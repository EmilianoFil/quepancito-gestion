import { db } from '../firebase-config.js';
import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { store } from '../store.js';
import { can } from '../auth.js';
import { meta, metaUpdate, escapeHtml, formatCurrency } from '../utils.js';
import { toast, openModal, confirm, pageHeader, setLoading, spinner } from '../ui.js';
import { icon } from '../icons.js';

const TIPOS = [
  { value: 'efectivo',    label: 'Efectivo',    color: '#2E7A4E', icon: '💵' },
  { value: 'banco',       label: 'Banco',       color: '#2980B9', icon: '🏦' },
  { value: 'mercadopago', label: 'MercadoPago', color: '#009EE3', icon: '💳' },
  { value: 'otro',        label: 'Otro',        color: '#7F8C8D', icon: '💰' },
];
const TIPO_MAP = Object.fromEntries(TIPOS.map(t => [t.value, t]));

let _unsub = null;

export default {
  async init(container) {
    container.innerHTML = spinner;
    const canEdit = can('cuentas', 'write');

    container.innerHTML = `
      ${pageHeader('Cuentas', canEdit ? `<button class="btn btn-primary" id="btn-new">${icon('plus')} Nueva cuenta</button>` : '')}
      <div id="balance-total" class="stat-card" style="margin-bottom:20px;max-width:280px"></div>
      <div id="cuentas-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px"></div>
    `;

    if (canEdit) container.querySelector('#btn-new').addEventListener('click', () => openCuentaModal());

    _unsub = onSnapshot(query(collection(db, 'cuentas'), orderBy('nombre')), snap => {
      const cuentas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderCuentas(container, cuentas, canEdit);
    });
  },

  destroy() { _unsub?.(); },
};

function renderCuentas(container, cuentas, canEdit) {
  const total = cuentas.reduce((s, c) => s + (c.saldo ?? 0), 0);

  const totalEl = container.querySelector('#balance-total');
  totalEl.innerHTML = `
    <div class="stat-label">Balance total</div>
    <div class="stat-value ${total >= 0 ? 'stat-positive' : 'stat-negative'}">${formatCurrency(total)}</div>
    <div class="stat-sub">${cuentas.length} cuenta${cuentas.length !== 1 ? 's' : ''}</div>
  `;

  const grid = container.querySelector('#cuentas-grid');
  if (!cuentas.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">${icon('wallet', 36)}<p>No hay cuentas creadas.</p></div>`;
    return;
  }

  grid.innerHTML = cuentas.map(c => {
    const tipo = TIPO_MAP[c.tipo] || TIPO_MAP.otro;
    return `
      <div class="card">
        <div class="card-header">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:22px">${tipo.icon}</span>
            <div>
              <div style="font-weight:700;font-size:15px">${escapeHtml(c.nombre)}</div>
              <div class="text-xs text-muted">${tipo.label}</div>
            </div>
          </div>
          ${canEdit ? `<div class="td-actions">
            <button class="btn-icon" data-action="edit" data-id="${c.id}">${icon('pencil')}</button>
            <button class="btn-icon" data-action="del" data-id="${c.id}" data-name="${escapeHtml(c.nombre)}">${icon('trash')}</button>
          </div>` : ''}
        </div>
        <div class="card-body" style="padding:16px 20px">
          <div class="stat-value ${(c.saldo ?? 0) >= 0 ? 'stat-positive' : 'stat-negative'}" style="font-size:22px">
            ${formatCurrency(c.saldo ?? 0)}
          </div>
          ${c.descripcion ? `<div class="text-xs text-muted" style="margin-top:6px">${escapeHtml(c.descripcion)}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  const cuentaMap = Object.fromEntries(cuentas.map(c => [c.id, c]));
  grid.querySelectorAll('[data-action="edit"]').forEach(b => b.addEventListener('click', () => openCuentaModal(cuentaMap[b.dataset.id])));
  grid.querySelectorAll('[data-action="del"]').forEach(b => b.addEventListener('click', () => deleteCuenta(b.dataset.id, b.dataset.name)));
}

function openCuentaModal(cuenta = null) {
  const isEdit = !!cuenta;
  const { modal, close } = openModal({
    title: isEdit ? 'Editar cuenta' : 'Nueva cuenta',
    size: 'sm',
    body: `
      <div class="form-grid cols-1">
        <div class="form-group">
          <label class="form-label">Nombre <span class="required">*</span></label>
          <input type="text" class="input" id="cu-nombre" value="${escapeHtml(cuenta?.nombre || '')}" placeholder="Ej: Banco Galicia, Caja chica..." />
        </div>
        <div class="form-group">
          <label class="form-label">Tipo</label>
          <select class="select-input" id="cu-tipo">
            ${TIPOS.map(t => `<option value="${t.value}" ${cuenta?.tipo === t.value ? 'selected' : ''}>${t.icon} ${t.label}</option>`).join('')}
          </select>
        </div>
        ${!isEdit ? `
          <div class="form-group">
            <label class="form-label">Saldo inicial</label>
            <input type="number" class="input" id="cu-saldo" value="0" min="0" step="0.01" />
            <span class="form-hint">El saldo se actualizará automáticamente con cada movimiento.</span>
          </div>
        ` : ''}
        <div class="form-group">
          <label class="form-label">Descripción</label>
          <input type="text" class="input" id="cu-desc" value="${escapeHtml(cuenta?.descripcion || '')}" placeholder="Opcional" />
        </div>
      </div>
    `,
    footer: `<button class="btn btn-secondary" id="cu-cancel">Cancelar</button><button class="btn btn-primary" id="cu-save">${isEdit ? 'Guardar' : 'Crear'}</button>`,
  });

  modal.querySelector('#cu-cancel').addEventListener('click', close);
  modal.querySelector('#cu-save').addEventListener('click', async () => {
    const nombre = modal.querySelector('#cu-nombre').value.trim();
    if (!nombre) { toast('El nombre es requerido.', 'error'); return; }
    const tipo   = modal.querySelector('#cu-tipo').value;
    const desc   = modal.querySelector('#cu-desc').value.trim();
    const btn = modal.querySelector('#cu-save');
    setLoading(btn, true);
    try {
      const user = store.state.user;
      if (isEdit) {
        await updateDoc(doc(db, 'cuentas', cuenta.id), { nombre, tipo, descripcion: desc, ...metaUpdate(user) });
        toast('Cuenta actualizada.', 'success');
      } else {
        const saldo = parseFloat(modal.querySelector('#cu-saldo').value) || 0;
        await addDoc(collection(db, 'cuentas'), { nombre, tipo, saldo, saldoInicial: saldo, descripcion: desc, ...meta(user) });
        toast('Cuenta creada.', 'success');
      }
      close();
    } catch { toast('Error al guardar.', 'error'); setLoading(btn, false); }
  });
}

async function deleteCuenta(id, nombre) {
  const ok = await confirm({ title: 'Eliminar cuenta', message: `¿Eliminás la cuenta <strong>${nombre}</strong>? El historial de movimientos no se borrará.`, confirmLabel: 'Eliminar', danger: true });
  if (!ok) return;
  try { await deleteDoc(doc(db, 'cuentas', id)); toast('Cuenta eliminada.', 'success'); }
  catch { toast('Error al eliminar.', 'error'); }
}
