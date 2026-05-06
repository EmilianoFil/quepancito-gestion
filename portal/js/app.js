import { auth, db } from './firebase-config.js';
import {
  onAuthStateChanged, signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  collection, doc, addDoc, setDoc, getDocs, getDoc,
  deleteDoc, query, where, orderBy, onSnapshot,
  serverTimestamp, updateDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ── State ──────────────────────────────────────────────────────────────────
let currentUser = null;
let portalUser  = null;
let activeTab   = 'inicio';
let _unsub      = null;

// ── Auth guard ─────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = 'login.html'; return; }
  currentUser = user;
  const snap = await getDoc(doc(db, 'proveedoresPortal', user.uid));
  portalUser  = snap.exists() ? { id: snap.id, ...snap.data() } : { id: user.uid, nombre: user.email };
  document.getElementById('user-nombre').textContent = portalUser.nombre;
  document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));
  setupNav();
  navigateTo('inicio');
});

// ── Nav ────────────────────────────────────────────────────────────────────
function setupNav() {
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.tab));
  });
}

function navigateTo(tab) {
  activeTab = tab;
  document.querySelectorAll('.nav-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );
  if (_unsub) { _unsub(); _unsub = null; }
  const content = document.getElementById('app-content');
  content.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  const views = { inicio, nuevoPedido, misClientes, plantillas };
  views[tab]?.(content);
}

// ── Toast ──────────────────────────────────────────────────────────────────
function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast${type ? ' toast-' + type : ''}`;
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── Modal ──────────────────────────────────────────────────────────────────
function openModal({ title, body, footer, onClose }) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal-sheet">
        <div class="modal-header">
          <span>${title}</span>
          <button class="btn-icon-sm" id="modal-x">✕</button>
        </div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
      </div>
    </div>`;
  const modal = root.querySelector('.modal-sheet');
  const close = () => { root.innerHTML = ''; onClose?.(); };
  root.querySelector('#modal-x').addEventListener('click', close);
  root.querySelector('#modal-backdrop').addEventListener('click', e => {
    if (e.target === root.querySelector('#modal-backdrop')) close();
  });
  return { modal, close };
}

// ══════════════════════════════════════════════════════════════════════════
// INICIO
// ══════════════════════════════════════════════════════════════════════════
async function inicio(el) {
  const snap = await getDocs(query(
    collection(db, 'pedidos'),
    where('ownerUID', '==', currentUser.uid),
    orderBy('fechaCreacion', 'desc'),
  ));
  if (snap.empty) {
    el.innerHTML = `
      <div class="empty">
        <div class="empty-icon">📦</div>
        <p>Todavía no hiciste ningún pedido.</p>
        <button class="btn btn-primary mt-4" onclick="document.querySelector('[data-tab=nuevoPedido]').click()">Hacer primer pedido</button>
      </div>`;
    return;
  }
  const pedidos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  el.innerHTML = `<h2 class="fw-bold mb-4" style="font-size:18px">Mis pedidos</h2>` +
    pedidos.map(p => pedidoCard(p)).join('');
}

function estadoBadge(e) {
  const map = {
    enviado:         ['badge-enviado',         'Enviado'],
    confirmado:      ['badge-confirmado',       'Confirmado'],
    en_preparacion:  ['badge-en_preparacion',   'En preparación'],
    listo:           ['badge-listo',            'Listo para entregar'],
    entregado:       ['badge-entregado',        'Entregado'],
  };
  const [cls, label] = map[e] || ['badge-enviado', e];
  return `<span class="badge ${cls}">${label}</span>`;
}

function pedidoCard(p) {
  const fecha = p.fechaCreacion?.toDate
    ? p.fechaCreacion.toDate().toLocaleDateString('es-AR')
    : '—';
  const entrega = p.fechaEntrega || '—';
  const lineas = (p.lineas || []).map(l =>
    `<div class="text-sm text-muted" style="margin-left:8px">• ${l.subClienteNombre}: ${
      (l.items || []).map(i => `${i.productoNombre} ×${i.cantidad}`).join(', ')
    }</div>`
  ).join('');
  return `
    <div class="card mb-2">
      <div class="card-header">
        <span>Pedido del ${fecha}</span>
        ${estadoBadge(p.estado || 'enviado')}
      </div>
      <div class="card-body">
        <div class="text-sm text-muted mb-2">Entrega: ${entrega} · Total: ${(p.totalKg || 0).toFixed(1)} kg</div>
        ${lineas}
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════════════════
// MIS CLIENTES
// ══════════════════════════════════════════════════════════════════════════
async function misClientes(el) {
  const render = async () => {
    const snap = await getDocs(query(
      collection(db, 'portalSubClientes'),
      where('ownerUID', '==', currentUser.uid),
      orderBy('nombre'),
    ));
    const clientes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    el.innerHTML = `
      <div class="d-flex justify-between align-center mb-4">
        <h2 class="fw-bold" style="font-size:18px">Mis clientes</h2>
        <button class="btn btn-primary btn-sm" id="btn-add-cliente">+ Agregar</button>
      </div>
      ${clientes.length === 0
        ? '<div class="empty"><div class="empty-icon">👥</div><p>Todavía no tenés clientes cargados.</p></div>'
        : clientes.map(c => `
          <div class="card mb-2">
            <div class="card-body d-flex justify-between align-center">
              <div>
                <div class="fw-bold">${c.nombre}</div>
                ${c.direccion ? `<div class="text-sm text-muted">${c.direccion}</div>` : ''}
                ${c.telefono  ? `<div class="text-sm text-muted">${c.telefono}</div>` : ''}
              </div>
              <div class="d-flex gap-2">
                <button class="btn btn-ghost btn-sm" data-edit="${c.id}">Editar</button>
                <button class="btn btn-danger btn-sm" data-del="${c.id}">Borrar</button>
              </div>
            </div>
          </div>`).join('')}`;

    el.querySelector('#btn-add-cliente')?.addEventListener('click', () => openClienteModal(null, render));
    el.querySelectorAll('[data-edit]').forEach(b =>
      b.addEventListener('click', () => {
        const c = clientes.find(x => x.id === b.dataset.edit);
        openClienteModal(c, render);
      })
    );
    el.querySelectorAll('[data-del]').forEach(b =>
      b.addEventListener('click', async () => {
        if (!confirm('¿Borrar este cliente?')) return;
        await deleteDoc(doc(db, 'portalSubClientes', b.dataset.del));
        toast('Cliente eliminado');
        render();
      })
    );
  };
  render();
}

function openClienteModal(cliente, onSaved) {
  const isNew = !cliente;
  const { modal, close } = openModal({
    title: isNew ? 'Nuevo cliente' : 'Editar cliente',
    body: `
      <div class="form-group">
        <label class="form-label">Nombre <span style="color:var(--c-danger)">*</span></label>
        <input class="input" id="cl-nombre" value="${cliente?.nombre || ''}" />
      </div>
      <div class="form-group">
        <label class="form-label">Dirección</label>
        <input class="input" id="cl-dir" value="${cliente?.direccion || ''}" />
      </div>
      <div class="form-group">
        <label class="form-label">Teléfono</label>
        <input class="input" id="cl-tel" value="${cliente?.telefono || ''}" />
      </div>
      <div class="form-group">
        <label class="form-label">Notas</label>
        <input class="input" id="cl-notas" value="${cliente?.notas || ''}" />
      </div>`,
    footer: `
      <button class="btn btn-secondary" id="cl-cancel">Cancelar</button>
      <button class="btn btn-primary" id="cl-save">Guardar</button>`,
  });

  modal.querySelector('#cl-cancel').addEventListener('click', close);
  modal.querySelector('#cl-save').addEventListener('click', async () => {
    const nombre = modal.querySelector('#cl-nombre').value.trim();
    if (!nombre) { toast('El nombre es requerido', 'error'); return; }
    const data = {
      ownerUID:  currentUser.uid,
      nombre,
      direccion: modal.querySelector('#cl-dir').value.trim(),
      telefono:  modal.querySelector('#cl-tel').value.trim(),
      notas:     modal.querySelector('#cl-notas').value.trim(),
    };
    if (isNew) {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, 'portalSubClientes'), data);
    } else {
      await updateDoc(doc(db, 'portalSubClientes', cliente.id), data);
    }
    toast(isNew ? 'Cliente agregado' : 'Cliente actualizado', 'success');
    close();
    onSaved();
  });
}

// ══════════════════════════════════════════════════════════════════════════
// PLANTILLAS
// ══════════════════════════════════════════════════════════════════════════
async function plantillas(el) {
  const render = async () => {
    const snap = await getDocs(query(
      collection(db, 'pedidosPlantillas'),
      where('ownerUID', '==', currentUser.uid),
      orderBy('nombre'),
    ));
    const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    el.innerHTML = `
      <div class="d-flex justify-between align-center mb-4">
        <h2 class="fw-bold" style="font-size:18px">Plantillas</h2>
      </div>
      ${lista.length === 0
        ? '<div class="empty"><div class="empty-icon">📋</div><p>No tenés plantillas guardadas. Podés guardar un pedido como plantilla al crearlo.</p></div>'
        : lista.map(p => `
          <div class="card mb-2">
            <div class="card-body d-flex justify-between align-center">
              <div>
                <div class="fw-bold">${p.nombre}</div>
                <div class="text-sm text-muted">${(p.lineas || []).length} cliente(s)</div>
              </div>
              <div class="d-flex gap-2">
                <button class="btn btn-primary btn-sm" data-use="${p.id}">Usar</button>
                <button class="btn btn-danger btn-sm" data-del="${p.id}">Borrar</button>
              </div>
            </div>
          </div>`).join('')}`;

    el.querySelectorAll('[data-use]').forEach(b =>
      b.addEventListener('click', () => {
        const plantilla = lista.find(x => x.id === b.dataset.use);
        navigateTo('nuevoPedido');
        setTimeout(() => cargarPlantillaEnPedido(plantilla), 100);
      })
    );
    el.querySelectorAll('[data-del]').forEach(b =>
      b.addEventListener('click', async () => {
        if (!confirm('¿Borrar esta plantilla?')) return;
        await deleteDoc(doc(db, 'pedidosPlantillas', b.dataset.del));
        toast('Plantilla eliminada');
        render();
      })
    );
  };
  render();
}

// ══════════════════════════════════════════════════════════════════════════
// NUEVO PEDIDO
// ══════════════════════════════════════════════════════════════════════════

// pedido draft: { lineas: [{subClienteId, subClienteNombre, items:[...]}] }
let draft = { lineas: [], fechaEntrega: '', copiaCliente: false };

function cargarPlantillaEnPedido(plantilla) {
  draft.lineas = JSON.parse(JSON.stringify(plantilla.lineas || []));
  renderNuevoPedido(document.getElementById('app-content'));
}

async function nuevoPedido(el) {
  draft = { lineas: [], fechaEntrega: '', copiaCliente: false };
  renderNuevoPedido(el);
}

async function renderNuevoPedido(el) {
  const [clientesSnap, productosSnap, modosSnap] = await Promise.all([
    getDocs(query(collection(db, 'portalSubClientes'), where('ownerUID', '==', currentUser.uid), orderBy('nombre'))),
    getDocs(query(collection(db, 'productos'), orderBy('nombre'))),
    getDocs(query(collection(db, 'modosVenta'), orderBy('nombre'))),
  ]);

  const clientes  = clientesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const productos = productosSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(p => p.tipo !== 'preparacion');
  const modos     = modosSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // add any draft client that may not be in list (loaded from template)
  const clienteMap = Object.fromEntries(clientes.map(c => [c.id, c]));

  el.innerHTML = `
    <h2 class="fw-bold mb-4" style="font-size:18px">Nuevo pedido</h2>

    <div class="card mb-3">
      <div class="card-body">
        <div class="form-group">
          <label class="form-label">Fecha de entrega (opcional)</label>
          <input type="date" class="input" id="fecha-entrega" value="${draft.fechaEntrega}" />
        </div>
        <label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer">
          <input type="checkbox" id="copia-cliente" ${draft.copiaCliente ? 'checked' : ''} />
          Quiero una copia del pedido por email
        </label>
      </div>
    </div>

    ${clientes.length === 0
      ? `<div class="empty"><div class="empty-icon">👥</div>
         <p>Primero tenés que agregar clientes en "Mis Clientes".</p></div>`
      : `<div class="mb-3">
           <div class="d-flex justify-between align-center mb-2">
             <span class="fw-bold">Clientes en este pedido</span>
             <button class="btn btn-ghost btn-sm" id="btn-add-linea">+ Agregar cliente</button>
           </div>
           <div id="lineas-container"></div>
         </div>
         <div id="totals-bar"></div>
         <div class="d-flex gap-2" style="flex-wrap:wrap">
           <button class="btn btn-secondary" id="btn-guardar-plantilla">Guardar como plantilla</button>
           <button class="btn btn-primary" id="btn-enviar" style="flex:1">Enviar pedido</button>
         </div>`}`;

  if (clientes.length === 0) return;

  el.querySelector('#fecha-entrega').addEventListener('change', e => draft.fechaEntrega = e.target.value);
  el.querySelector('#copia-cliente').addEventListener('change', e => draft.copiaCliente = e.target.checked);

  const renderLineas = () => {
    const container = el.querySelector('#lineas-container');
    container.innerHTML = draft.lineas.map((linea, li) => {
      const prodDisp = productos.filter(p =>
        !p.modosVentaIds?.length || p.modosVentaIds.some(m => modos.find(x => x.id === m))
      );
      return `
        <div class="card mb-2" data-linea="${li}">
          <div class="card-header">
            <span>${linea.subClienteNombre}</span>
            <button class="btn-icon-sm btn-icon-danger" data-del-linea="${li}">✕</button>
          </div>
          <div class="card-body">
            ${linea.items.map((item, ii) => {
              const prod = productos.find(p => p.id === item.productoId);
              const modosProd = prod?.modosVentaIds?.length
                ? modos.filter(m => prod.modosVentaIds.includes(m.id))
                : modos;
              return `
                <div class="product-row" data-item="${ii}">
                  <div>
                    <div class="product-name">${item.productoNombre}</div>
                    <div class="product-meta">${item.modoVentaNombre} · ${(item.pesoUnitKg * item.cantidad).toFixed(2)} kg</div>
                  </div>
                  <select class="select-input" style="width:auto;font-size:13px" data-modo-sel="${li}-${ii}">
                    ${modosProd.map(m =>
                      `<option value="${m.id}" data-peso="${m.pesoKg}" ${m.id === item.modoVentaId ? 'selected' : ''}>${m.nombre}</option>`
                    ).join('')}
                  </select>
                  <div class="qty-wrap">
                    <button class="qty-btn" data-qty-dec="${li}-${ii}">−</button>
                    <input class="qty-input" type="number" min="1" value="${item.cantidad}" data-qty-inp="${li}-${ii}" />
                    <button class="qty-btn" data-qty-inc="${li}-${ii}">+</button>
                  </div>
                  <button class="btn-icon-sm btn-icon-danger" data-del-item="${li}-${ii}">✕</button>
                </div>`;
            }).join('')}
            <div class="mt-2">
              <select class="select-input" style="font-size:13px" id="prod-sel-${li}">
                <option value="">— Agregar producto —</option>
                ${prodDisp.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>`;
    }).join('');

    // bindings
    container.querySelectorAll('[data-del-linea]').forEach(b =>
      b.addEventListener('click', () => {
        draft.lineas.splice(+b.dataset.delLinea, 1);
        renderLineas();
      })
    );
    container.querySelectorAll('[data-del-item]').forEach(b => {
      const [li, ii] = b.dataset.delItem.split('-').map(Number);
      b.addEventListener('click', () => {
        draft.lineas[li].items.splice(ii, 1);
        renderLineas();
      });
    });
    container.querySelectorAll('[data-modo-sel]').forEach(sel => {
      const [li, ii] = sel.dataset.modoSel.split('-').map(Number);
      sel.addEventListener('change', () => {
        const opt = sel.options[sel.selectedIndex];
        draft.lineas[li].items[ii].modoVentaId   = opt.value;
        draft.lineas[li].items[ii].modoVentaNombre = opt.text;
        draft.lineas[li].items[ii].pesoUnitKg     = parseFloat(opt.dataset.peso) || 0;
        renderLineas();
      });
    });
    container.querySelectorAll('[data-qty-inp]').forEach(inp => {
      const [li, ii] = inp.dataset.qtyInp.split('-').map(Number);
      inp.addEventListener('change', () => {
        draft.lineas[li].items[ii].cantidad = Math.max(1, parseInt(inp.value) || 1);
        renderLineas();
      });
    });
    container.querySelectorAll('[data-qty-dec]').forEach(b => {
      const [li, ii] = b.dataset.qtyDec.split('-').map(Number);
      b.addEventListener('click', () => {
        draft.lineas[li].items[ii].cantidad = Math.max(1, draft.lineas[li].items[ii].cantidad - 1);
        renderLineas();
      });
    });
    container.querySelectorAll('[data-qty-inc]').forEach(b => {
      const [li, ii] = b.dataset.qtyInc.split('-').map(Number);
      b.addEventListener('click', () => {
        draft.lineas[li].items[ii].cantidad++;
        renderLineas();
      });
    });
    // add product selector
    container.querySelectorAll('[id^="prod-sel-"]').forEach(sel => {
      const li = parseInt(sel.id.replace('prod-sel-', ''));
      sel.addEventListener('change', () => {
        const prod = productos.find(p => p.id === sel.value);
        if (!prod) return;
        const modosProd = prod.modosVentaIds?.length
          ? modos.filter(m => prod.modosVentaIds.includes(m.id))
          : modos;
        const primerModo = modosProd[0];
        if (!primerModo) { toast('Este producto no tiene modos de venta', 'error'); sel.value = ''; return; }
        draft.lineas[li].items.push({
          productoId:     prod.id,
          productoNombre: prod.nombre,
          modoVentaId:    primerModo.id,
          modoVentaNombre: primerModo.nombre,
          pesoUnitKg:     primerModo.pesoKg || 0,
          cantidad:       1,
        });
        renderLineas();
      });
    });

    // totals
    let totalKg = 0;
    draft.lineas.forEach(l => l.items.forEach(i => { totalKg += (i.pesoUnitKg || 0) * i.cantidad; }));
    el.querySelector('#totals-bar').innerHTML = totalKg > 0
      ? `<div class="totals-bar mb-3">
           <div><div class="t-label">Total kg</div><div class="t-value">${totalKg.toFixed(1)} kg</div></div>
         </div>`
      : '';
  };

  renderLineas();

  // add cliente linea
  el.querySelector('#btn-add-linea').addEventListener('click', () => {
    const yaElegidos = new Set(draft.lineas.map(l => l.subClienteId));
    const disponibles = clientes.filter(c => !yaElegidos.has(c.id));
    if (disponibles.length === 0) { toast('Ya agregaste todos tus clientes', 'error'); return; }
    openClientePickerModal(disponibles, cliente => {
      draft.lineas.push({ subClienteId: cliente.id, subClienteNombre: cliente.nombre, items: [] });
      renderLineas();
    });
  });

  el.querySelector('#btn-guardar-plantilla').addEventListener('click', () => {
    if (draft.lineas.every(l => l.items.length === 0)) {
      toast('Agregá al menos un producto antes de guardar', 'error'); return;
    }
    openGuardarPlantillaModal();
  });

  el.querySelector('#btn-enviar').addEventListener('click', async () => {
    if (draft.lineas.every(l => l.items.length === 0)) {
      toast('El pedido está vacío', 'error'); return;
    }
    const btn = el.querySelector('#btn-enviar');
    btn.disabled = true;
    btn.textContent = 'Enviando...';
    try {
      let totalKg = 0;
      draft.lineas.forEach(l => l.items.forEach(i => { totalKg += (i.pesoUnitKg || 0) * i.cantidad; }));
      await addDoc(collection(db, 'pedidos'), {
        ownerUID:      currentUser.uid,
        ownerNombre:   portalUser.nombre,
        fechaCreacion: serverTimestamp(),
        fechaEntrega:  draft.fechaEntrega || null,
        estado:        'enviado',
        lineas:        draft.lineas,
        totalKg,
        copiaCliente:  draft.copiaCliente,
      });
      toast('¡Pedido enviado!', 'success');
      navigateTo('inicio');
    } catch (e) {
      toast('Error al enviar el pedido', 'error');
      btn.disabled = false;
      btn.textContent = 'Enviar pedido';
    }
  });
}

function openClientePickerModal(clientes, onPick) {
  const { modal, close } = openModal({
    title: 'Elegir cliente',
    body: `<div id="picker-list">
      ${clientes.map(c => `
        <div class="card mb-2" style="cursor:pointer" data-pick="${c.id}">
          <div class="card-body fw-bold">${c.nombre}</div>
        </div>`).join('')}
    </div>`,
  });
  modal.querySelectorAll('[data-pick]').forEach(el => {
    el.addEventListener('click', () => {
      const c = clientes.find(x => x.id === el.dataset.pick);
      close();
      onPick(c);
    });
  });
}

function openGuardarPlantillaModal() {
  const { modal, close } = openModal({
    title: 'Guardar plantilla',
    body: `
      <div class="form-group">
        <label class="form-label">Nombre de la plantilla</label>
        <input class="input" id="tmpl-nombre" placeholder="Ej: Pedido semanal" />
      </div>`,
    footer: `
      <button class="btn btn-secondary" id="tmpl-cancel">Cancelar</button>
      <button class="btn btn-primary" id="tmpl-save">Guardar</button>`,
  });
  modal.querySelector('#tmpl-cancel').addEventListener('click', close);
  modal.querySelector('#tmpl-save').addEventListener('click', async () => {
    const nombre = modal.querySelector('#tmpl-nombre').value.trim();
    if (!nombre) { toast('Ingresá un nombre', 'error'); return; }
    await addDoc(collection(db, 'pedidosPlantillas'), {
      ownerUID:  currentUser.uid,
      nombre,
      lineas:    draft.lineas,
      createdAt: serverTimestamp(),
    });
    toast('Plantilla guardada', 'success');
    close();
  });
}
