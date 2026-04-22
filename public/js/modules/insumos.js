import { db } from '../firebase-config.js';
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, getDocs, addDoc as addSubDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { store } from '../store.js';
import { can } from '../auth.js';
import { meta, metaUpdate, escapeHtml, formatCurrency, formatNumber, formatDate } from '../utils.js';
import { toast, openModal, confirm, pageHeader, setLoading, spinner } from '../ui.js';
import { icon } from '../icons.js';

const UNIDADES = ['kg','g','l','ml','un','doc'];

let _unsub = null;
let _search = '';

export default {
  async init(container) {
    container.innerHTML = spinner;
    const canEdit = can('insumos', 'write');

    container.innerHTML = `
      ${pageHeader('Insumos', canEdit ? `<button class="btn btn-primary" id="btn-new">${icon('plus')} Nuevo insumo</button>` : '')}
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="search-bar">
            ${icon('search')}
            <input type="text" id="search-input" placeholder="Buscar insumo..." />
          </div>
        </div>
      </div>
      <div id="insumos-list"></div>
    `;

    if (canEdit) container.querySelector('#btn-new').addEventListener('click', () => openInsumoModal());
    container.querySelector('#search-input').addEventListener('input', e => { _search = e.target.value.toLowerCase(); });

    _unsub = onSnapshot(query(collection(db, 'insumos'), orderBy('nombre')), snap => {
      const insumos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderList(container.querySelector('#insumos-list'), insumos, canEdit);
    });
  },

  destroy() { _unsub?.(); _search = ''; },
};

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
          <th>Nombre</th><th>Presentación</th><th>Unidad</th>
          <th style="text-align:right">Precio / unidad</th>
          <th style="text-align:right">Stock actual</th>
          <th>Alerta</th><th></th>
        </tr></thead>
        <tbody>
          ${list.map(i => {
            const stockBajo = (i.stockActual ?? 0) <= (i.stockMinimo ?? 0) && (i.stockMinimo ?? 0) > 0;
            return `<tr>
              <td style="font-weight:600">${escapeHtml(i.nombre)}</td>
              <td class="text-sm text-muted">${escapeHtml(i.presentacion || '—')}</td>
              <td><span class="badge badge-neutral">${i.unidad || 'kg'}</span></td>
              <td style="text-align:right;font-weight:600">${formatCurrency(i.precioPorUnidad ?? 0)}</td>
              <td style="text-align:right" class="${stockBajo ? 'text-error font-bold' : ''}">
                ${formatNumber(i.stockActual ?? 0, 2)} ${i.unidad || 'kg'}
              </td>
              <td>
                ${stockBajo
                  ? `<span class="badge badge-error">${icon('alertCircle')} Stock bajo</span>`
                  : `<span class="badge badge-success">OK</span>`}
              </td>
              <td class="actions"><div class="td-actions">
                <button class="btn-icon" data-action="hist" data-id="${i.id}" title="Historial de precios">${icon('calendar')}</button>
                ${canEdit ? `<button class="btn-icon" data-action="edit" data-id="${i.id}">${icon('pencil')}</button>` : ''}
                ${canEdit ? `<button class="btn-icon" data-action="del" data-id="${i.id}" data-name="${escapeHtml(i.nombre)}">${icon('trash')}</button>` : ''}
              </div></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  const map = Object.fromEntries(all.map(i => [i.id, i]));
  container.querySelectorAll('[data-action="edit"]').forEach(b => b.addEventListener('click', () => openInsumoModal(map[b.dataset.id])));
  container.querySelectorAll('[data-action="del"]').forEach(b => b.addEventListener('click', () => deleteInsumo(b.dataset.id, b.dataset.name)));
  container.querySelectorAll('[data-action="hist"]').forEach(b => b.addEventListener('click', () => openHistorial(map[b.dataset.id])));
}

function openInsumoModal(insumo = null) {
  const isEdit = !!insumo;
  const precioAnterior = insumo?.precioPorUnidad;

  const { modal, close } = openModal({
    title: isEdit ? 'Editar insumo' : 'Nuevo insumo',
    size: 'md',
    body: `
      <div class="form-grid">
        <div class="form-group span-2">
          <label class="form-label">Nombre <span class="required">*</span></label>
          <input type="text" class="input" id="ins-nombre" value="${escapeHtml(insumo?.nombre || '')}" placeholder="Ej: Harina, Levadura, Grasa..." />
        </div>
        <div class="form-group span-2">
          <label class="form-label">Presentación</label>
          <input type="text" class="input" id="ins-pres" value="${escapeHtml(insumo?.presentacion || '')}" placeholder="Ej: Bolsa x 25kg, x 0.5kg x 20un" />
        </div>
        <div class="form-group">
          <label class="form-label">Unidad base <span class="required">*</span></label>
          <select class="select-input" id="ins-unidad">
            ${UNIDADES.map(u => `<option value="${u}" ${insumo?.unidad === u ? 'selected' : ''}>${u}</option>`).join('')}
          </select>
          <span class="form-hint">Unidad usada en recetas y stock.</span>
        </div>
        <div class="form-group">
          <label class="form-label">Precio por unidad <span class="required">*</span></label>
          <input type="number" class="input" id="ins-precio" value="${insumo?.precioPorUnidad ?? ''}" min="0" step="0.01" placeholder="0.00" />
          ${isEdit ? '<span class="form-hint">Si cambia el precio, se guardará en el historial.</span>' : ''}
        </div>
        <div class="form-group">
          <label class="form-label">Stock actual</label>
          <input type="number" class="input" id="ins-stock" value="${insumo?.stockActual ?? 0}" min="0" step="0.01" />
        </div>
        <div class="form-group">
          <label class="form-label">Stock mínimo (alerta)</label>
          <input type="number" class="input" id="ins-stockmin" value="${insumo?.stockMinimo ?? 0}" min="0" step="0.01" />
        </div>
      </div>
    `,
    footer: `<button class="btn btn-secondary" id="i-cancel">Cancelar</button><button class="btn btn-primary" id="i-save">${isEdit ? 'Guardar' : 'Crear'}</button>`,
  });

  modal.querySelector('#i-cancel').addEventListener('click', close);
  modal.querySelector('#i-save').addEventListener('click', async () => {
    const nombre = modal.querySelector('#ins-nombre').value.trim();
    const precio = parseFloat(modal.querySelector('#ins-precio').value);
    if (!nombre) { toast('El nombre es requerido.', 'error'); return; }
    if (isNaN(precio) || precio < 0) { toast('Ingresá un precio válido.', 'error'); return; }

    const btn = modal.querySelector('#i-save');
    setLoading(btn, true);
    const user = store.state.user;

    const data = {
      nombre,
      presentacion:  modal.querySelector('#ins-pres').value.trim(),
      unidad:        modal.querySelector('#ins-unidad').value,
      precioPorUnidad: precio,
      stockActual:   parseFloat(modal.querySelector('#ins-stock').value) || 0,
      stockMinimo:   parseFloat(modal.querySelector('#ins-stockmin').value) || 0,
    };

    try {
      if (isEdit) {
        await updateDoc(doc(db, 'insumos', insumo.id), { ...data, ...metaUpdate(user) });
        // Si cambió el precio, guardar en historial
        if (precio !== precioAnterior) {
          await addDoc(collection(db, 'insumos', insumo.id, 'precios'), {
            precio,
            precioAnterior,
            fecha: new Date(),
            ...meta(user),
          });
        }
        toast('Insumo actualizado.', 'success');
      } else {
        const ref = await addDoc(collection(db, 'insumos'), { ...data, ...meta(user) });
        await addDoc(collection(db, ref.id, 'precios'), {
          precio,
          precioAnterior: null,
          fecha: new Date(),
          ...meta(user),
        });
        toast('Insumo creado.', 'success');
      }
      close();
    } catch (e) { console.error(e); toast('Error al guardar.', 'error'); setLoading(btn, false); }
  });
}

async function openHistorial(insumo) {
  const snap = await getDocs(query(collection(db, 'insumos', insumo.id, 'precios'), orderBy('fecha', 'desc')));
  const precios = snap.docs.map(d => d.data());

  const { close } = openModal({
    title: `Historial de precios — ${escapeHtml(insumo.nombre)}`,
    size: 'sm',
    body: precios.length ? `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Precio</th><th>Anterior</th></tr></thead>
          <tbody>
            ${precios.map(p => `<tr>
              <td class="text-sm text-muted">${formatDate(p.fecha)}</td>
              <td style="font-weight:600">${formatCurrency(p.precio)}</td>
              <td class="text-sm text-muted">${p.precioAnterior != null ? formatCurrency(p.precioAnterior) : '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    ` : `<div class="empty-state" style="min-height:80px"><p class="text-sm text-muted">Sin historial.</p></div>`,
    footer: `<button class="btn btn-secondary" id="h-close">Cerrar</button>`,
  });
  document.querySelector('#h-close')?.addEventListener('click', close);
}

async function deleteInsumo(id, nombre) {
  const ok = await confirm({ title: 'Eliminar insumo', message: `¿Eliminás <strong>${nombre}</strong>? Si está en recetas, los costos quedarán desactualizados.`, confirmLabel: 'Eliminar', danger: true });
  if (!ok) return;
  try { await deleteDoc(doc(db, 'insumos', id)); toast('Insumo eliminado.', 'success'); }
  catch { toast('Error al eliminar.', 'error'); }
}
