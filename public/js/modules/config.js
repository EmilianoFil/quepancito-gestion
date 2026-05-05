import { db } from '../firebase-config.js';
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { store } from '../store.js';
import { can } from '../auth.js';
import { meta, metaUpdate, escapeHtml, formatCurrency } from '../utils.js';
import { toast, openModal, confirm, pageHeader, setLoading, spinner } from '../ui.js';
import { icon } from '../icons.js';

let _unsub = null;

export default {
  async init(container) {
    container.innerHTML = spinner;
    const canEdit = can('config', 'write');

    container.innerHTML = `
      ${pageHeader('Listas de Precios', canEdit ? `<button class="btn btn-primary" id="btn-new">${icon('plus')} Nueva lista</button>` : '')}
      <p class="text-sm text-muted" style="margin-bottom:20px">
        Creá listas de precios con nombre (ej: Reventa, Fleteros) y asignales precios por producto.
        Luego asignás una lista a cada cliente.
      </p>
      <div id="listas-list"></div>
    `;

    if (canEdit) container.querySelector('#btn-new').addEventListener('click', () => openListaModal());

    _unsub = onSnapshot(query(collection(db, 'listasPrecios'), orderBy('nombre')), snap => {
      const listas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderList(container.querySelector('#listas-list'), listas, canEdit);
    });
  },

  destroy() { _unsub?.(); },
};

// ── Render ────────────────────────────────────────────────────────────────────

function renderList(container, listas, canEdit) {
  if (!listas.length) {
    container.innerHTML = `<div class="empty-state">${icon('archive', 36)}<p>No hay listas de precios configuradas.</p></div>`;
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Nombre</th>
          <th>Descripción</th>
          <th style="text-align:right">Productos con precio</th>
          <th></th>
        </tr></thead>
        <tbody>
          ${listas.map(l => `
            <tr>
              <td style="font-weight:600">${escapeHtml(l.nombre)}</td>
              <td class="text-sm text-muted">${escapeHtml(l.descripcion || '—')}</td>
              <td style="text-align:right" class="text-sm">${Object.keys(l.precios || {}).length}</td>
              <td class="actions"><div class="td-actions">
                ${canEdit ? `<button class="btn-icon" data-action="edit" data-id="${l.id}">${icon('pencil')}</button>` : ''}
                ${canEdit ? `<button class="btn-icon" data-action="del" data-id="${l.id}" data-name="${escapeHtml(l.nombre)}">${icon('trash')}</button>` : ''}
              </div></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  const map = Object.fromEntries(listas.map(l => [l.id, l]));
  container.querySelectorAll('[data-action="edit"]').forEach(b => b.addEventListener('click', () => openListaModal(map[b.dataset.id])));
  container.querySelectorAll('[data-action="del"]').forEach(b => b.addEventListener('click', () => deleteLista(b.dataset.id, b.dataset.name)));
}

// ── Modal ─────────────────────────────────────────────────────────────────────

async function openListaModal(lista = null) {
  const isEdit = !!lista;

  // Fetch all final products for the price table
  const prodsSnap = await getDocs(query(collection(db, 'productos'), orderBy('nombre')));
  const productos = prodsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(p => !p.tipo || p.tipo === 'producto');

  const precios = lista?.precios || {};

  const { modal, close } = openModal({
    title: isEdit ? `Editar lista: ${escapeHtml(lista.nombre)}` : 'Nueva lista de precios',
    size: 'xl',
    body: `
      <div class="form-grid" style="margin-bottom:20px">
        <div class="form-group">
          <label class="form-label">Nombre <span class="required">*</span></label>
          <input type="text" class="input" id="lp-nombre" value="${escapeHtml(lista?.nombre || '')}" placeholder="Ej: Reventa, Fleteros..." />
        </div>
        <div class="form-group">
          <label class="form-label">Descripción</label>
          <input type="text" class="input" id="lp-desc" value="${escapeHtml(lista?.descripcion || '')}" placeholder="Descripción opcional" />
        </div>
      </div>

      <div style="font-weight:600;font-size:14px;margin-bottom:10px">Precios por producto</div>
      ${productos.length ? `
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Producto</th>
              <th style="text-align:right">Precio base</th>
              <th style="text-align:right">Precio en esta lista</th>
            </tr></thead>
            <tbody>
              ${productos.map(p => `
                <tr>
                  <td style="font-weight:500">${escapeHtml(p.nombre)}</td>
                  <td style="text-align:right" class="text-sm text-muted">${p.precioVenta ? formatCurrency(p.precioVenta) : '—'}</td>
                  <td style="text-align:right">
                    <input type="number" class="input" data-prod-id="${p.id}"
                      value="${precios[p.id] ?? ''}" min="0" step="0.01"
                      placeholder="Sin precio" style="width:130px;text-align:right" />
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : `<p class="text-sm text-muted">No hay productos cargados todavía. Podés configurar los precios después.</p>`}
    `,
    footer: `<button class="btn btn-secondary" id="lp-cancel">Cancelar</button><button class="btn btn-primary" id="lp-save">${isEdit ? 'Guardar' : 'Crear'}</button>`,
  });

  modal.querySelector('#lp-cancel').addEventListener('click', close);
  modal.querySelector('#lp-save').addEventListener('click', async () => {
    const nombre = modal.querySelector('#lp-nombre').value.trim();
    if (!nombre) { toast('El nombre es requerido.', 'error'); return; }

    const nuevosPrecios = {};
    modal.querySelectorAll('[data-prod-id]').forEach(inp => {
      const val = parseFloat(inp.value);
      if (val > 0) nuevosPrecios[inp.dataset.prodId] = val;
    });

    const btn = modal.querySelector('#lp-save');
    setLoading(btn, true);

    const data = {
      nombre,
      descripcion: modal.querySelector('#lp-desc').value.trim(),
      precios: nuevosPrecios,
    };

    try {
      const user = store.state.user;
      if (isEdit) {
        await updateDoc(doc(db, 'listasPrecios', lista.id), { ...data, ...metaUpdate(user) });
        toast('Lista actualizada.', 'success');
      } else {
        await addDoc(collection(db, 'listasPrecios'), { ...data, ...meta(user) });
        toast('Lista creada.', 'success');
      }
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
