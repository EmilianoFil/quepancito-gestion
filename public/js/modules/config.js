import { db } from '../firebase-config.js';
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { store } from '../store.js';
import { can } from '../auth.js';
import { meta, metaUpdate, escapeHtml, formatCurrency, formatNumber } from '../utils.js';
import { toast, openModal, confirm, pageHeader, setLoading, spinner } from '../ui.js';
import { icon } from '../icons.js';

let _unsubs = [];

export default {
  async init(container) {
    container.innerHTML = spinner;
    const canEdit = can('config', 'write');

    container.innerHTML = `
      ${pageHeader('Configuración')}

      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <h2 style="font-size:16px;font-weight:700">Listas de Precios</h2>
        ${canEdit ? `<button class="btn btn-primary btn-sm" id="btn-new-lista">${icon('plus')} Nueva lista</button>` : ''}
      </div>
      <p class="text-sm text-muted" style="margin-bottom:12px">Precios por cliente (Reventa, Fleteros…). Se asignan en la ficha del cliente.</p>
      <div id="listas-list" style="margin-bottom:32px"></div>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <h2 style="font-size:16px;font-weight:700">Modos de Venta</h2>
        ${canEdit ? `<button class="btn btn-primary btn-sm" id="btn-new-modo">${icon('plus')} Nuevo modo</button>` : ''}
      </div>
      <p class="text-sm text-muted" style="margin-bottom:12px">Unidades de pedido (Por kilo, Por unidad, Por 10kg…). Definís el peso en kg de cada modo para calcular producción.</p>
      <div id="modos-list"></div>
    `;

    if (canEdit) {
      container.querySelector('#btn-new-lista').addEventListener('click', () => openListaModal());
      container.querySelector('#btn-new-modo').addEventListener('click', () => openModoModal());
    }

    _unsubs.forEach(u => u());
    _unsubs = [];

    _unsubs.push(
      onSnapshot(query(collection(db, 'listasPrecios'), orderBy('nombre')), snap => {
        renderListas(container.querySelector('#listas-list'), snap.docs.map(d => ({ id: d.id, ...d.data() })), canEdit);
      }),
      onSnapshot(query(collection(db, 'modosVenta'), orderBy('nombre')), snap => {
        renderModos(container.querySelector('#modos-list'), snap.docs.map(d => ({ id: d.id, ...d.data() })), canEdit);
      })
    );
  },

  destroy() { _unsubs.forEach(u => u()); _unsubs = []; },
};

// ── Listas de Precios ─────────────────────────────────────────────────────────

function renderListas(container, listas, canEdit) {
  if (!listas.length) {
    container.innerHTML = `<div class="empty-state" style="min-height:80px">${icon('archive', 28)}<p class="text-sm">Sin listas de precios.</p></div>`;
    return;
  }
  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Nombre</th><th>Descripción</th><th style="text-align:right">Productos</th><th></th></tr></thead>
        <tbody>
          ${listas.map(l => `
            <tr>
              <td style="font-weight:600">${escapeHtml(l.nombre)}</td>
              <td class="text-sm text-muted">${escapeHtml(l.descripcion || '—')}</td>
              <td style="text-align:right" class="text-sm">${Object.keys(l.precios || {}).length}</td>
              <td class="actions"><div class="td-actions">
                ${canEdit ? `<button class="btn-icon" data-action="edit-lista" data-id="${l.id}">${icon('pencil')}</button>` : ''}
                ${canEdit ? `<button class="btn-icon" data-action="del-lista" data-id="${l.id}" data-name="${escapeHtml(l.nombre)}">${icon('trash')}</button>` : ''}
              </div></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  const map = Object.fromEntries(listas.map(l => [l.id, l]));
  container.querySelectorAll('[data-action="edit-lista"]').forEach(b => b.addEventListener('click', () => openListaModal(map[b.dataset.id])));
  container.querySelectorAll('[data-action="del-lista"]').forEach(b => b.addEventListener('click', () => deleteLista(b.dataset.id, b.dataset.name)));
}

async function openListaModal(lista = null) {
  const isEdit = !!lista;
  const prodsSnap = await getDocs(query(collection(db, 'productos'), orderBy('nombre')));
  const productos = prodsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => !p.tipo || p.tipo === 'producto');
  const precios = lista?.precios || {};

  const { modal, close } = openModal({
    title: isEdit ? `Editar: ${escapeHtml(lista.nombre)}` : 'Nueva lista de precios',
    size: 'xl',
    body: `
      <div class="form-grid" style="margin-bottom:20px">
        <div class="form-group"><label class="form-label">Nombre <span class="required">*</span></label>
          <input type="text" class="input" id="lp-nombre" value="${escapeHtml(lista?.nombre || '')}" placeholder="Ej: Reventa, Fleteros..." /></div>
        <div class="form-group"><label class="form-label">Descripción</label>
          <input type="text" class="input" id="lp-desc" value="${escapeHtml(lista?.descripcion || '')}" /></div>
      </div>
      <div style="font-weight:600;font-size:14px;margin-bottom:10px">Precios por producto</div>
      ${productos.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Producto</th><th style="text-align:right">Precio base</th><th style="text-align:right">Precio en esta lista</th></tr></thead>
        <tbody>${productos.map(p => `<tr>
          <td style="font-weight:500">${escapeHtml(p.nombre)}</td>
          <td style="text-align:right" class="text-sm text-muted">${p.precioVenta ? formatCurrency(p.precioVenta) : '—'}</td>
          <td style="text-align:right"><input type="number" class="input" data-prod-id="${p.id}" value="${precios[p.id] ?? ''}" min="0" step="0.01" placeholder="Sin precio" style="width:130px;text-align:right" /></td>
        </tr>`).join('')}</tbody>
      </table></div>` : `<p class="text-sm text-muted">No hay productos cargados todavía.</p>`}`,
    footer: `<button class="btn btn-secondary" id="lp-cancel">Cancelar</button><button class="btn btn-primary" id="lp-save">${isEdit ? 'Guardar' : 'Crear'}</button>`,
  });
  modal.querySelector('#lp-cancel').addEventListener('click', close);
  modal.querySelector('#lp-save').addEventListener('click', async () => {
    const nombre = modal.querySelector('#lp-nombre').value.trim();
    if (!nombre) { toast('El nombre es requerido.', 'error'); return; }
    const nuevosPrecios = {};
    modal.querySelectorAll('[data-prod-id]').forEach(inp => { const v = parseFloat(inp.value); if (v > 0) nuevosPrecios[inp.dataset.prodId] = v; });
    const btn = modal.querySelector('#lp-save');
    setLoading(btn, true);
    try {
      const user = store.state.user;
      const data = { nombre, descripcion: modal.querySelector('#lp-desc').value.trim(), precios: nuevosPrecios };
      if (isEdit) { await updateDoc(doc(db, 'listasPrecios', lista.id), { ...data, ...metaUpdate(user) }); toast('Lista actualizada.', 'success'); }
      else { await addDoc(collection(db, 'listasPrecios'), { ...data, ...meta(user) }); toast('Lista creada.', 'success'); }
      close();
    } catch (e) { console.error(e); toast('Error al guardar.', 'error'); setLoading(btn, false); }
  });
}

async function deleteLista(id, nombre) {
  const ok = await confirm({ title: 'Eliminar lista', message: `¿Eliminás la lista <strong>${nombre}</strong>?`, confirmLabel: 'Eliminar', danger: true });
  if (!ok) return;
  try { await deleteDoc(doc(db, 'listasPrecios', id)); toast('Lista eliminada.', 'success'); }
  catch { toast('Error al eliminar.', 'error'); }
}

// ── Modos de Venta ────────────────────────────────────────────────────────────

function renderModos(container, modos, canEdit) {
  if (!modos.length) {
    container.innerHTML = `<div class="empty-state" style="min-height:80px">${icon('archive', 28)}<p class="text-sm">Sin modos de venta.</p></div>`;
    return;
  }
  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Nombre</th><th style="text-align:right">Peso (kg/unidad)</th><th></th></tr></thead>
        <tbody>
          ${modos.map(m => `
            <tr>
              <td style="font-weight:600">${escapeHtml(m.nombre)}</td>
              <td style="text-align:right">${formatNumber(m.pesoKg, 3)} kg</td>
              <td class="actions"><div class="td-actions">
                ${canEdit ? `<button class="btn-icon" data-action="edit-modo" data-id="${m.id}">${icon('pencil')}</button>` : ''}
                ${canEdit ? `<button class="btn-icon" data-action="del-modo" data-id="${m.id}" data-name="${escapeHtml(m.nombre)}">${icon('trash')}</button>` : ''}
              </div></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  const map = Object.fromEntries(modos.map(m => [m.id, m]));
  container.querySelectorAll('[data-action="edit-modo"]').forEach(b => b.addEventListener('click', () => openModoModal(map[b.dataset.id])));
  container.querySelectorAll('[data-action="del-modo"]').forEach(b => b.addEventListener('click', () => deleteModo(b.dataset.id, b.dataset.name)));
}

async function openModoModal(modo = null) {
  const isEdit = !!modo;
  const { modal, close } = openModal({
    title: isEdit ? 'Editar modo de venta' : 'Nuevo modo de venta',
    size: 'sm',
    body: `
      <div class="form-grid cols-1">
        <div class="form-group">
          <label class="form-label">Nombre <span class="required">*</span></label>
          <input type="text" class="input" id="mv-nombre" value="${escapeHtml(modo?.nombre || '')}" placeholder="Ej: Por kilo, Por unidad, Por 10kg..." />
        </div>
        <div class="form-group">
          <label class="form-label">Peso en kg por unidad <span class="required">*</span></label>
          <input type="number" class="input" id="mv-peso" value="${modo?.pesoKg ?? ''}" min="0.001" step="0.001" placeholder="Ej: 1 = 1kg, 0.05 = 50g, 10 = 10kg" />
          <span class="form-hint">Si el cliente pide 5 unidades en este modo, se calcula 5 × este peso = kg totales.</span>
        </div>
      </div>`,
    footer: `<button class="btn btn-secondary" id="mv-cancel">Cancelar</button><button class="btn btn-primary" id="mv-save">${isEdit ? 'Guardar' : 'Crear'}</button>`,
  });
  modal.querySelector('#mv-cancel').addEventListener('click', close);
  modal.querySelector('#mv-save').addEventListener('click', async () => {
    const nombre = modal.querySelector('#mv-nombre').value.trim();
    const pesoKg = parseFloat(modal.querySelector('#mv-peso').value);
    if (!nombre) { toast('El nombre es requerido.', 'error'); return; }
    if (!pesoKg || pesoKg <= 0) { toast('El peso debe ser mayor a 0.', 'error'); return; }
    const btn = modal.querySelector('#mv-save');
    setLoading(btn, true);
    try {
      const user = store.state.user;
      const data = { nombre, pesoKg };
      if (isEdit) { await updateDoc(doc(db, 'modosVenta', modo.id), { ...data, ...metaUpdate(user) }); toast('Modo actualizado.', 'success'); }
      else { await addDoc(collection(db, 'modosVenta'), { ...data, ...meta(user) }); toast('Modo creado.', 'success'); }
      close();
    } catch (e) { console.error(e); toast('Error al guardar.', 'error'); setLoading(btn, false); }
  });
}

async function deleteModo(id, nombre) {
  const ok = await confirm({ title: 'Eliminar modo', message: `¿Eliminás el modo <strong>${nombre}</strong>? Los productos que lo usen quedarán sin ese modo.`, confirmLabel: 'Eliminar', danger: true });
  if (!ok) return;
  try { await deleteDoc(doc(db, 'modosVenta', id)); toast('Modo eliminado.', 'success'); }
  catch { toast('Error al eliminar.', 'error'); }
}
