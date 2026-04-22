import { db } from '../firebase-config.js';
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { store } from '../store.js';
import { can } from '../auth.js';
import { meta, metaUpdate, escapeHtml, formatCurrency, formatDate } from '../utils.js';
import { toast, openModal, confirm, pageHeader, setLoading, spinner } from '../ui.js';
import { icon } from '../icons.js';

const TIPOS_PAGO = [
  { value: 'mensual',   label: 'Mensual' },
  { value: 'quincenal', label: 'Quincenal' },
  { value: 'semanal',   label: 'Semanal' },
  { value: 'jornal',    label: 'Jornal (por día)' },
  { value: 'hora',      label: 'Por hora' },
];

const TURNOS = [
  { value: 'dia',     label: 'Día' },
  { value: 'noche',   label: 'Noche' },
  { value: 'ambos',   label: 'Ambos' },
  { value: 'ninguno', label: '—' },
];

let _unsub = null;
let _search = '';

export default {
  async init(container) {
    container.innerHTML = spinner;
    const canEdit = can('empleados', 'write');

    container.innerHTML = `
      ${pageHeader('Empleados', canEdit ? `<button class="btn btn-primary" id="btn-new">${icon('plus')} Nuevo empleado</button>` : '')}
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="search-bar">
            ${icon('search')}
            <input type="text" id="search-input" placeholder="Buscar empleado..." />
          </div>
        </div>
      </div>
      <div id="empleados-list"></div>
    `;

    if (canEdit) container.querySelector('#btn-new').addEventListener('click', () => openEmpleadoModal());
    container.querySelector('#search-input').addEventListener('input', e => { _search = e.target.value.toLowerCase(); });

    _unsub = onSnapshot(query(collection(db, 'empleados'), orderBy('nombre')), snap => {
      const empleados = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderList(container.querySelector('#empleados-list'), empleados, canEdit);
    });
  },

  destroy() { _unsub?.(); _search = ''; },
};

function tipoPagoLabel(v) { return TIPOS_PAGO.find(t => t.value === v)?.label ?? v; }
function turnoLabel(v)    { return TURNOS.find(t => t.value === v)?.label ?? v; }

function renderList(container, all, canEdit) {
  const list = _search
    ? all.filter(e => e.nombre?.toLowerCase().includes(_search) || e.dni?.toLowerCase().includes(_search))
    : all;

  if (!list.length) {
    container.innerHTML = `<div class="empty-state">${icon('users', 36)}<p>${all.length ? 'Sin resultados.' : 'No hay empleados cargados.'}</p></div>`;
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Nombre</th><th>DNI</th><th>Tipo de pago</th>
          <th style="text-align:right">Sueldo / tarifa</th>
          <th>Turno</th><th>Estado</th><th></th>
        </tr></thead>
        <tbody>
          ${list.map(e => {
            const activo = e.activo !== false;
            return `<tr>
              <td style="font-weight:600">${escapeHtml(e.nombre)}</td>
              <td class="text-sm text-muted">${escapeHtml(e.dni || '—')}</td>
              <td>${tipoPagoLabel(e.tipoPago)}</td>
              <td style="text-align:right;font-weight:600">${formatCurrency(e.sueldo ?? 0)}</td>
              <td>${turnoLabel(e.turno)}</td>
              <td>${activo ? `<span class="badge badge-success">Activo</span>` : `<span class="badge badge-neutral">Inactivo</span>`}</td>
              <td class="actions"><div class="td-actions">
                <button class="btn-icon" data-action="hist" data-id="${e.id}" title="Historial de sueldos">${icon('calendar')}</button>
                ${canEdit ? `<button class="btn-icon" data-action="edit" data-id="${e.id}">${icon('pencil')}</button>` : ''}
                ${canEdit ? `<button class="btn-icon" data-action="del" data-id="${e.id}" data-name="${escapeHtml(e.nombre)}">${icon('trash')}</button>` : ''}
              </div></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  const map = Object.fromEntries(all.map(e => [e.id, e]));
  container.querySelectorAll('[data-action="edit"]').forEach(b => b.addEventListener('click', () => openEmpleadoModal(map[b.dataset.id])));
  container.querySelectorAll('[data-action="del"]').forEach(b => b.addEventListener('click', () => deleteEmpleado(b.dataset.id, b.dataset.name)));
  container.querySelectorAll('[data-action="hist"]').forEach(b => b.addEventListener('click', () => openHistorial(map[b.dataset.id])));
}

function openEmpleadoModal(empleado = null) {
  const isEdit = !!empleado;
  const sueldoAnterior = empleado?.sueldo;

  const { modal, close } = openModal({
    title: isEdit ? 'Editar empleado' : 'Nuevo empleado',
    size: 'md',
    body: `
      <div class="form-grid">
        <div class="form-group span-2">
          <label class="form-label">Nombre completo <span class="required">*</span></label>
          <input type="text" class="input" id="emp-nombre" value="${escapeHtml(empleado?.nombre || '')}" placeholder="Ej: Juan Pérez" />
        </div>
        <div class="form-group">
          <label class="form-label">DNI</label>
          <input type="text" class="input" id="emp-dni" value="${escapeHtml(empleado?.dni || '')}" placeholder="Ej: 30123456" />
        </div>
        <div class="form-group">
          <label class="form-label">Teléfono</label>
          <input type="text" class="input" id="emp-tel" value="${escapeHtml(empleado?.telefono || '')}" placeholder="Ej: 11 4567-8901" />
        </div>
        <div class="form-group">
          <label class="form-label">Tipo de pago <span class="required">*</span></label>
          <select class="select-input" id="emp-tipo">
            ${TIPOS_PAGO.map(t => `<option value="${t.value}" ${empleado?.tipoPago === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Sueldo / tarifa <span class="required">*</span></label>
          <input type="number" class="input" id="emp-sueldo" value="${empleado?.sueldo ?? ''}" min="0" step="100" placeholder="0.00" />
          ${isEdit ? '<span class="form-hint">Si cambia el monto, se guardará en el historial.</span>' : ''}
        </div>
        <div class="form-group">
          <label class="form-label">Turno</label>
          <select class="select-input" id="emp-turno">
            ${TURNOS.map(t => `<option value="${t.value}" ${(empleado?.turno ?? 'ninguno') === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Fecha de ingreso</label>
          <input type="date" class="input" id="emp-inicio" value="${empleado?.fechaIngreso || ''}" />
        </div>
        ${isEdit ? `
        <div class="form-group">
          <label class="form-label">Estado</label>
          <select class="select-input" id="emp-activo">
            <option value="true" ${empleado?.activo !== false ? 'selected' : ''}>Activo</option>
            <option value="false" ${empleado?.activo === false ? 'selected' : ''}>Inactivo</option>
          </select>
        </div>` : ''}
        <div class="form-group span-2">
          <label class="form-label">Notas</label>
          <textarea class="input" id="emp-notas" rows="2" placeholder="Observaciones...">${escapeHtml(empleado?.notas || '')}</textarea>
        </div>
      </div>
    `,
    footer: `<button class="btn btn-secondary" id="e-cancel">Cancelar</button><button class="btn btn-primary" id="e-save">${isEdit ? 'Guardar' : 'Crear'}</button>`,
  });

  modal.querySelector('#e-cancel').addEventListener('click', close);
  modal.querySelector('#e-save').addEventListener('click', async () => {
    const nombre = modal.querySelector('#emp-nombre').value.trim();
    const sueldo = parseFloat(modal.querySelector('#emp-sueldo').value);
    if (!nombre) { toast('El nombre es requerido.', 'error'); return; }
    if (isNaN(sueldo) || sueldo < 0) { toast('Ingresá un sueldo válido.', 'error'); return; }

    const btn = modal.querySelector('#e-save');
    setLoading(btn, true);
    const user = store.state.user;

    const data = {
      nombre,
      dni:          modal.querySelector('#emp-dni').value.trim(),
      telefono:     modal.querySelector('#emp-tel').value.trim(),
      tipoPago:     modal.querySelector('#emp-tipo').value,
      sueldo,
      turno:        modal.querySelector('#emp-turno').value,
      fechaIngreso: modal.querySelector('#emp-inicio').value || null,
      notas:        modal.querySelector('#emp-notas').value.trim(),
      activo:       isEdit ? modal.querySelector('#emp-activo').value === 'true' : true,
    };

    try {
      if (isEdit) {
        await updateDoc(doc(db, 'empleados', empleado.id), { ...data, ...metaUpdate(user) });
        if (sueldo !== sueldoAnterior) {
          await addDoc(collection(db, 'empleados', empleado.id, 'sueldos'), {
            sueldo, sueldoAnterior,
            tipoPago: data.tipoPago,
            fecha: new Date(),
            ...meta(user),
          });
        }
        toast('Empleado actualizado.', 'success');
      } else {
        const ref = await addDoc(collection(db, 'empleados'), { ...data, ...meta(user) });
        await addDoc(collection(db, 'empleados', ref.id, 'sueldos'), {
          sueldo, sueldoAnterior: null,
          tipoPago: data.tipoPago,
          fecha: new Date(),
          ...meta(user),
        });
        toast('Empleado creado.', 'success');
      }
      close();
    } catch (e) { console.error(e); toast('Error al guardar.', 'error'); setLoading(btn, false); }
  });
}

async function openHistorial(empleado) {
  const snap = await getDocs(query(collection(db, 'empleados', empleado.id, 'sueldos'), orderBy('fecha', 'desc')));
  const sueldos = snap.docs.map(d => d.data());

  const { close } = openModal({
    title: `Historial de sueldos — ${escapeHtml(empleado.nombre)}`,
    size: 'sm',
    body: sueldos.length ? `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Sueldo</th><th>Anterior</th><th>Tipo</th></tr></thead>
          <tbody>
            ${sueldos.map(s => `<tr>
              <td class="text-sm text-muted">${formatDate(s.fecha)}</td>
              <td style="font-weight:600">${formatCurrency(s.sueldo)}</td>
              <td class="text-sm text-muted">${s.sueldoAnterior != null ? formatCurrency(s.sueldoAnterior) : '—'}</td>
              <td class="text-sm">${tipoPagoLabel(s.tipoPago)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    ` : `<div class="empty-state" style="min-height:80px"><p class="text-sm text-muted">Sin historial.</p></div>`,
    footer: `<button class="btn btn-secondary" id="h-close">Cerrar</button>`,
  });
  document.querySelector('#h-close')?.addEventListener('click', close);
}

async function deleteEmpleado(id, nombre) {
  const ok = await confirm({ title: 'Eliminar empleado', message: `¿Eliminás a <strong>${nombre}</strong>?`, confirmLabel: 'Eliminar', danger: true });
  if (!ok) return;
  try { await deleteDoc(doc(db, 'empleados', id)); toast('Empleado eliminado.', 'success'); }
  catch { toast('Error al eliminar.', 'error'); }
}
