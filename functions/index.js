const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentDeleted } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();

// ── Helpers ──────────────────────────────────────────────────────────────────

async function assertAdmin(context) {
  if (!context.auth) throw new HttpsError('unauthenticated', 'No autenticado.');
  const snap = await db.doc(`users/${context.auth.uid}`).get();
  if (!snap.exists || snap.data().role !== 'admin') {
    throw new HttpsError('permission-denied', 'Solo los administradores pueden realizar esta acción.');
  }
}

function metaCreated(uid, email) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  return { createdBy: uid, createdByEmail: email, createdAt: now, updatedBy: uid, updatedByEmail: email, updatedAt: now };
}

function metaUpdated(uid, email) {
  return { updatedBy: uid, updatedByEmail: email, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
}

// ── createUser ────────────────────────────────────────────────────────────────

exports.createUser = onCall(async (request) => {
  await assertAdmin(request);
  const { email, displayName, password, role = 'user', permissions = {} } = request.data;

  if (!email || !password) throw new HttpsError('invalid-argument', 'Email y contraseña requeridos.');

  let userRecord;
  try {
    userRecord = await auth.createUser({ email, displayName: displayName || '', password });
  } catch (err) {
    const msgs = {
      'auth/email-already-exists': 'Ya existe un usuario con ese email.',
      'auth/invalid-email': 'El email no es válido.',
      'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
    };
    throw new HttpsError('already-exists', msgs[err.code] || err.message);
  }

  await db.doc(`users/${userRecord.uid}`).set({
    email,
    displayName: displayName || '',
    role,
    permissions,
    disabled: false,
    ...metaCreated(request.auth.uid, request.auth.token.email),
  });

  return { uid: userRecord.uid };
});

// ── updateUser ────────────────────────────────────────────────────────────────

exports.updateUser = onCall(async (request) => {
  await assertAdmin(request);
  const { uid, role, permissions, displayName, disabled } = request.data;
  if (!uid) throw new HttpsError('invalid-argument', 'UID requerido.');

  const update = { ...metaUpdated(request.auth.uid, request.auth.token.email) };
  if (role !== undefined) update.role = role;
  if (permissions !== undefined) update.permissions = permissions;
  if (displayName !== undefined) update.displayName = displayName;
  if (disabled !== undefined) {
    update.disabled = disabled;
    await auth.updateUser(uid, { disabled });
  }

  await db.doc(`users/${uid}`).update(update);
  return { ok: true };
});

// ── deleteUser ────────────────────────────────────────────────────────────────

exports.deleteUser = onCall(async (request) => {
  await assertAdmin(request);
  const { uid } = request.data;
  if (!uid) throw new HttpsError('invalid-argument', 'UID requerido.');

  await auth.deleteUser(uid);
  await db.doc(`users/${uid}`).delete();
  return { ok: true };
});

// ── onMovimientoCreated — actualiza saldo de cuenta y cuenta corriente ────────

exports.onMovimientoCreated = onDocumentCreated('movimientos/{movId}', async (event) => {
  const data = event.data?.data();
  if (!data) return;

  const batch = db.batch();
  const increment = admin.firestore.FieldValue.increment;

  // Actualizar saldo de la cuenta (banco, efectivo, etc.)
  if (data.cuentaId) {
    const delta = data.tipo === 'ingreso' ? data.monto : -data.monto;
    batch.update(db.doc(`cuentas/${data.cuentaId}`), { saldo: increment(delta) });
  }

  // Actualizar cuenta corriente del cliente
  if (data.clienteId) {
    // ingreso = cobro al cliente → reduce su deuda (nos deben menos)
    // egreso = venta a crédito → aumenta su deuda
    const delta = data.tipo === 'ingreso' ? -data.monto : data.monto;
    batch.update(db.doc(`clientes/${data.clienteId}`), { saldoCuentaCorriente: increment(delta) });
  }

  // Actualizar cuenta corriente del proveedor
  if (data.proveedorId) {
    // egreso = pago al proveedor → reduce lo que debemos
    // ingreso (devolución) → aumenta lo que debemos
    const delta = data.tipo === 'egreso' ? -data.monto : data.monto;
    batch.update(db.doc(`proveedores/${data.proveedorId}`), { saldoCuentaCorriente: increment(delta) });
  }

  await batch.commit();
});

// ── onMovimientoDeleted — revierte saldos al eliminar ────────────────────────

exports.onMovimientoDeleted = onDocumentDeleted('movimientos/{movId}', async (event) => {
  const data = event.data?.data();
  if (!data) return;

  const batch = db.batch();
  const increment = admin.firestore.FieldValue.increment;

  if (data.cuentaId) {
    const delta = data.tipo === 'ingreso' ? -data.monto : data.monto;
    batch.update(db.doc(`cuentas/${data.cuentaId}`), { saldo: increment(delta) });
  }
  if (data.clienteId) {
    const delta = data.tipo === 'ingreso' ? data.monto : -data.monto;
    batch.update(db.doc(`clientes/${data.clienteId}`), { saldoCuentaCorriente: increment(delta) });
  }
  if (data.proveedorId) {
    const delta = data.tipo === 'egreso' ? data.monto : -data.monto;
    batch.update(db.doc(`proveedores/${data.proveedorId}`), { saldoCuentaCorriente: increment(delta) });
  }

  await batch.commit();
});

// ── onProduccionCreated — descuenta stock de insumos ─────────────────────────

exports.onProduccionCreated = onDocumentCreated('produccion/{prodId}', async (event) => {
  const data = event.data?.data();
  if (!data?.insumos?.length) return;

  const batch = db.batch();
  const increment = admin.firestore.FieldValue.increment;

  for (const item of data.insumos) {
    if (!item.insumoId || !item.cantidad) continue;
    batch.update(db.doc(`stock/${item.insumoId}`), {
      stockActual: increment(-item.cantidad),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // Registrar movimiento de stock
    const movRef = db.collection('stockMovimientos').doc();
    batch.set(movRef, {
      insumoId: item.insumoId,
      cantidad: -item.cantidad,
      tipo: 'produccion',
      referencia: event.params.prodId,
      fecha: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
});

// ── weeklyReport — resumen semanal (lunes 8am Buenos Aires) ──────────────────

exports.weeklyReport = onSchedule({
  schedule: '0 8 * * 1',
  timeZone: 'America/Argentina/Buenos_Aires',
}, async () => {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);

  const snap = await db.collection('movimientos')
    .where('fecha', '>=', weekStart)
    .where('fecha', '<', now)
    .get();

  let ingresos = 0, egresos = 0;
  snap.forEach(d => {
    const data = d.data();
    if (data.tipo === 'ingreso') ingresos += data.monto ?? 0;
    else egresos += data.monto ?? 0;
  });

  await db.collection('reportes').add({
    tipo: 'semanal',
    desde: weekStart,
    hasta: now,
    ingresos,
    egresos,
    resultado: ingresos - egresos,
    generadoEn: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`Reporte semanal: ingresos=$${ingresos} egresos=$${egresos}`);
});
