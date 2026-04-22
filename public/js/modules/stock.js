import { db } from '../firebase-config.js';
import {
  collection, doc, updateDoc, addDoc,
  onSnapshot, query, orderBy, getDocs, limit, where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { store } from '../store.js';
import { can } from '../auth.js';
import { meta, metaUpdate, escapeHtml, formatNumber, formatDate } from '../utils.js';
import { toast, openModal, confirm, pageHeader, setLoading, spinner } from '../ui.js';
import { icon } from '../icons.js';

const TIPOS_MOV = [
  { value: 'compra',      label: 'Compra',      sign: +1 },
  { value: 'ajuste_pos',  label: 'Ajuste (+)',   sign: +1 },
  { value: 'ajuste_neg',  label: 'Ajuste (−)',   sign: -1 },
  { value: 'produccion',  label: 'Producción',   sign: -1 },
  { value: 'merma',       label: 'Merma / baja', sign: -1 },
];

let _unsub = null;
let _search = '';

export default {
  async init(container) {
    container.innerHTML = spinner;
    const canEdit = can('stock', 'write');

    container.innerHTML = `
      ${pageHeader('Stock de insumos', canEdit ? `<button class="btn btn-primary" id="btn-ajuste">${icon('plus')} Registrar movimiento</button>` : '')}
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="search-bar">
            ${icon('search')}
            <input type="text" id="search-input" placeholder="Buscar insumo..." />
          </div>
        </div>
      </div>
      <div id="stock-list"></div>
    `;

    if (canEdit) container.querySelector('#btn-ajuste').addEventListener('click', () => openMovModal());
    container.querySelector('#search-input').addEventListener('input', e => { _search = e.target.value.toLowerCase(); });

    _unsub = onSnapshot(query(collection(db, 'insumos'), orderBy('nombre')), snap => {
      const insumos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderList(container.querySelector('#stock-list'), insumos, canEdit);
    });
  },

  destroy() { _unsub?.(); _search = ''; },
};

function stockBadge(insumo) {
  const bajo = (insumo.stockActual ?? 0) <= (insumo.stockMinimo ?? 0) && (insumo.stockMinimo ?? 0) > 0;
  return bajo
    ? `<span class="badge badge-error">${icon('alertCircle')} Bajo</span>`
    : `<span class="badge badge-success">OK</span>`;
}

function renderList(container, all, canEdit) {
  const list = _search ? all.filter(i => i.nombre?.toLowerCase().includes(_search)) : all;

  if (!list.length) {
    container.innerHTML = `<div class="empty-state">${icon('layers', 36)}<p>${all.length ? 'Sin resultados.' : 'No hay insumos cargados.'}</p></div>`;
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Insumo</th>
          <th style="text-align:right">Stock actual</th>
          <th style="text-align:right">Stock mínimo</th>
          <th>Estado</th>
          <th></th>
        </tr></thead>
        <tbody>
          ${list.map(i => {
            const bajo = (i.stockActual ?? 0) <= (i.stockMinimo ?? 0) && (i.stockMinimo ?? 0) > 0;
            return `<tr>
              <td style="font-weight:600">${escapeHtml(i.nombre)}
                ${i.presentacion ? `<span class="text-sm text-muted"> · ${escapeHtml(i.presentacion)}</span>` : ''}
              </td>
              <td style="text-align:right" class="${bajo ? 'text-error font-bold' : ''}">
                ${formatNumber(i.stockActual ?? 0, 2)} <span class="text-sm text-muted">${i.unidad || 'kg'}</span>
              </td>
              <td style="text-align:right" class="text-sm text-muted">
                ${i.stockMinimo ? `${formatNumber(i.stockMinimo, 2)} ${i.unidad || 'kg'}` : '—'}
              </td>
              <td>${stockBadge(i)}</td>
              <td class="actions"><div class="td-actions">
                <button class="btn-icon" data-action="hist" data-id="${i.id}" title="Historial de movimientos">${icon('calendar')}</button>
                ${canEdit ? `<button class="btn-icon" data-action="ajuste" data-id="${i.id}" title="Registrar movimiento">${icon('pencil')}</button>` : ''}
              </div></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  const map = Object.fromEntries(all.map(i => [i.id, i]));
  container.querySelectorAll('[data-action="ajuste"]').forEach(b => b.addEventListener('click', () => openMovModal(map[b.dataset.id])));
  container.querySelectorAll('[data-action="hist"]').forEach(b => b.addEventListener('click', () => openHistorial(map[b.dataset.id])));
}

async function openMovModal(insumoPreselect = null) {
  // Cargar insumos para el dropdown
  const snap = await getDocs(query(collection(db, 'insumos'), orderBy('nombre')));
  const insumos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (!insumos.length) { toast('No hay insumos cargados.', 'error'); return; }

  const { modal, close } = openModal({
    title: 'Registrar movimiento de stock',
    size: 'sm',
    body: `
      <div class="form-grid">
        <div class="form-group span-2">
          <label class="form-label">Insumo <span class="required">*</span></label>
          <select class="select-input" id="sm-insumo">
            <option value="">— Seleccioná —</option>
            ${insumos.map(i => `<option value="${i.id}" data-unidad="${i.unidad || 'kg'}" data-stock="${i.stockActual ?? 0}" ${insumoPreselect?.id === i.id ? 'selected' : ''}>${escapeHtml(i.nombre)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group span-2" id="sm-stock-row" style="display:none">
          <p class="form-hint">Stock actual: <strong id="sm-stock-actual">—</strong></p>
        </div>
        <div class="form-group">
          <label class="form-label">Tipo <span class="required">*</span></label>
          <select class="select-input" id="sm-tipo">
            ${TIPOS_MOV.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Cantidad <span class="required">*</span></label>
          <input type="number" class="input" id="sm-cantidad" min="0" step="0.01" placeholder="0.00" />
          <span class="form-hint" id="sm-unidad-hint"></span>
        </div>
        <div class="form-group span-2">
          <label class="form-label">Notas</label>
          <input type="text" class="input" id="sm-notas" placeholder="Opcional..." />
        </div>
      </div>
    `,
    footer: `<button class="btn btn-secondary" id="sm-cancel">Cancelar</button><button class="btn btn-primary" id="sm-save">Registrar</button>`,
  });

  const selInsumo = modal.querySelector('#sm-insumo');
  const stockRow  = modal.querySelector('#sm-stock-row');
  const stockSpan = modal.querySelector('#sm-stock-actual');
  const unidadHint = modal.querySelector('#sm-unidad-hint');

  function updateInsumoInfo() {
    const opt = selInsumo.options[selInsumo.selectedIndex];
    if (opt.value) {
      const unidad = opt.dataset.unidad;
      const stock  = parseFloat(opt.dataset.stock);
      stockRow.style.display = '';
      stockSpan.textContent = `${formatNumber(stock, 2)} ${unidad}`;
      unidadHint.textContent = `en ${unidad}`;
    } else {
      stockRow.style.display = 'none';
      unidadHint.textContent = '';
    }
  }

  selInsumo.addEventListener('change', updateInsumoInfo);
  if (insumoPreselect) updateInsumoInfo();

  modal.querySelector('#sm-cancel').addEventListener('click', close);
  modal.querySelector('#sm-save').addEventListener('click', async () => {
    const insumoId = selInsumo.value;
    const tipo     = modal.querySelector('#sm-tipo').value;
    const cantidad = parseFloat(modal.querySelector('#sm-cantidad').value);
    const notas    = modal.querySelector('#sm-notas').value.trim();

    if (!insumoId) { toast('Seleccioná un insumo.', 'error'); return; }
    if (isNaN(cantidad) || cantidad <= 0) { toast('Ingresá una cantidad válida.', 'error'); return; }

    const btn = modal.querySelector('#sm-save');
    setLoading(btn, true);
    const user = store.state.user;

    const tipoInfo = TIPOS_MOV.find(t => t.value === tipo);
    const delta = tipoInfo.sign * cantidad;

    try {
      // Actualizar stock en insumo
      const opt = selInsumo.options[selInsumo.selectedIndex];
      const stockActualPrev = parseFloat(opt.dataset.stock);
      const stockNuevo = stockActualPrev + delta;

      await updateDoc(doc(db, 'insumos', insumoId), {
        stockActual: stockNuevo,
        ...metaUpdate(user),
      });

      // Registrar movimiento
      await addDoc(collection(db, 'stockMovimientos'), {
        insumoId,
        insumoNombre: opt.text,
        tipo,
        cantidad: delta,
        stockAnterior: stockActualPrev,
        stockNuevo,
        notas,
        fecha: new Date(),
        ...meta(user),
      });

      toast('Movimiento registrado.', 'success');
      close();
    } catch (e) { console.error(e); toast('Error al registrar.', 'error'); setLoading(btn, false); }
  });
}

async function openHistorial(insumo) {
  const snap = await getDocs(
    query(
      collection(db, 'stockMovimientos'),
      where('insumoId', '==', insumo.id),
      orderBy('fecha', 'desc'),
      limit(30)
    )
  );
  const movs = snap.docs.map(d => d.data());
  const tipoLabel = v => TIPOS_MOV.find(t => t.value === v)?.label ?? v;

  const { close } = openModal({
    title: `Movimientos — ${escapeHtml(insumo.nombre)}`,
    size: 'md',
    body: movs.length ? `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Cantidad</th><th>Nuevo stock</th><th>Notas</th></tr></thead>
          <tbody>
            ${movs.map(m => `<tr>
              <td class="text-sm text-muted">${formatDate(m.fecha)}</td>
              <td>${tipoLabel(m.tipo)}</td>
              <td class="${m.cantidad >= 0 ? 'text-success' : 'text-error'}" style="font-weight:600">
                ${m.cantidad >= 0 ? '+' : ''}${formatNumber(m.cantidad, 2)} ${insumo.unidad || 'kg'}
              </td>
              <td style="font-weight:600">${formatNumber(m.stockNuevo ?? 0, 2)} ${insumo.unidad || 'kg'}</td>
              <td class="text-sm text-muted">${escapeHtml(m.notas || '—')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    ` : `<div class="empty-state" style="min-height:80px"><p class="text-sm text-muted">Sin movimientos registrados.</p></div>`,
    footer: `<button class="btn btn-secondary" id="sh-close">Cerrar</button>`,
  });
  document.querySelector('#sh-close')?.addEventListener('click', close);
}
