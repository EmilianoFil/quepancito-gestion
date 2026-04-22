import { db } from '../firebase-config.js';
import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, where, getDocs, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { store } from '../store.js';
import { can } from '../auth.js';
import { meta, metaUpdate, escapeHtml, formatCurrency, formatDate } from '../utils.js';
import { toast, openModal, confirm, pageHeader, setLoading, spinner } from '../ui.js';
import { icon } from '../icons.js';
import { getCategorias, categoriasOptions } from '../data.js';

let _unsub = null;
let _search = '';
let _catFilter = '';
let _cats = [];

export default {
  async init(container) {
    container.innerHTML = spinner;
    const canEdit = can('proveedores', 'write');
    _cats = await getCategorias('proveedor');

    container.innerHTML = `
      ${pageHeader('Proveedores', canEdit ? `<button class="btn btn-primary" id="btn-new">${icon('plus')} Nuevo proveedor</button>` : '')}
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="search-bar">
            ${icon('search')}
            <input type="text" id="search-input" placeholder="Buscar por nombre..." value="${_search}" />
          </div>
        </div>
        <div class="toolbar-right">
          <select class="select-input" id="cat-filter" style="width:180px">
            <option value="">Todas las categorías</option>
            ${_cats.map(c => `<option value="${c.id}" ${_catFilter === c.id ? 'selected' : ''}>${c.nombre}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="provs-list"></div>
    `;

    if (canEdit) container.querySelector('#btn-new').addEventListener('click', () => openProvModal());
    container.querySelector('#search-input').addEventListener('input', e => { _search = e.target.value.toLowerCase(); });
    container.querySelector('#cat-filter').addEventListener('change', e => { _catFilter = e.target.value; });

    _unsub = onSnapshot(query(collection(db, 'proveedores'), orderBy('nombre')), snap => {
      const provs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderList(container.querySelector('#provs-list'), provs, canEdit);
    });
  },

  destroy() { _unsub?.(); _search = ''; _catFilter = ''; },
};

function renderList(container, all, canEdit) {
  let list = all;
  if (_search) list = list.filter(p => p.nombre?.toLowerCase().includes(_search));
  if (_catFilter) list = list.filter(p => p.categoriaId === _catFilter);

  if (!list.length) {
    container.innerHTML = `<div class="empty-state">${icon('truck', 36)}<p>${all.length ? 'Sin resultados.' : 'No hay proveedores todavía.'}</p></div>`;
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Nombre</th><th>Categoría</th><th>Contacto</th><th>CUIT</th><th>Cta. Cte.</th><th></th></tr></thead>
        <tbody>
          ${list.map(p => `
            <tr>
              <td style="font-weight:600">${escapeHtml(p.nombre)}</td>
              <td>${p.categoriaNombre ? `<span class="badge badge-warning">${escapeHtml(p.categoriaNombre)}</span>` : '<span class="text-muted">-</span>'}</td>
              <td>
                ${p.contacto?.telefono ? `<div class="text-sm">${escapeHtml(p.contacto.telefono)}</div>` : ''}
                ${p.contacto?.email ? `<div class="text-sm text-muted">${escapeHtml(p.contacto.email)}</div>` : ''}
              </td>
              <td class="text-sm text-muted">${escapeHtml(p.cuit || '-')}</td>
              <td>${saldoBadge(p.saldoCuentaCorriente ?? 0)}</td>
              <td class="actions">
                <div class="td-actions">
                  <button class="btn-icon" data-action="detail" data-id="${p.id}" title="Ver detalle">${icon('eye')}</button>
                  ${canEdit ? `<button class="btn-icon" data-action="edit" data-id="${p.id}">${icon('pencil')}</button>` : ''}
                  ${canEdit ? `<button class="btn-icon" data-action="del" data-id="${p.id}" data-name="${escapeHtml(p.nombre)}">${icon('trash')}</button>` : ''}
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  const pMap = Object.fromEntries(all.map(p => [p.id, p]));
  container.querySelectorAll('[data-action="detail"]').forEach(b => b.addEventListener('click', () => openDetail(pMap[b.dataset.id])));
  container.querySelectorAll('[data-action="edit"]').forEach(b => b.addEventListener('click', () => openProvModal(pMap[b.dataset.id])));
  container.querySelectorAll('[data-action="del"]').forEach(b => b.addEventListener('click', () => deleteProv(b.dataset.id, b.dataset.name)));
}

function saldoBadge(saldo) {
  if (saldo === 0) return `<span class="badge badge-success">Al día</span>`;
  return saldo > 0
    ? `<span class="badge badge-error">Debemos ${formatCurrency(saldo)}</span>`
    : `<span class="badge badge-success">A favor ${formatCurrency(Math.abs(saldo))}</span>`;
}

async function openDetail(prov) {
  const movsSnap = await getDocs(query(
    collection(db, 'movimientos'),
    where('proveedorId', '==', prov.id),
    orderBy('fecha', 'desc'),
    limit(20)
  ));
  const movs = movsSnap.docs.map(d => d.data());

  const { close } = openModal({
    title: escapeHtml(prov.nombre),
    size: 'lg',
    body: `
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:20px">
        <div class="stat-card" style="flex:1;min-width:180px">
          <div class="stat-label">Cuenta corriente</div>
          <div class="stat-value ${(prov.saldoCuentaCorriente ?? 0) > 0 ? 'stat-negative' : 'stat-positive'}" style="font-size:20px">
            ${formatCurrency(prov.saldoCuentaCorriente ?? 0)}
          </div>
          <div class="stat-sub">${(prov.saldoCuentaCorriente ?? 0) > 0 ? 'Debemos' : (prov.saldoCuentaCorriente ?? 0) < 0 ? 'A favor' : 'Al día'}</div>
        </div>
        ${prov.cuit ? `<div class="stat-card" style="flex:1;min-width:180px">
          <div class="stat-label">CUIT</div>
          <div style="font-size:15px;font-weight:600;margin-top:6px">${escapeHtml(prov.cuit)}</div>
        </div>` : ''}
        ${prov.contacto?.telefono ? `<div class="stat-card" style="flex:1;min-width:180px">
          <div class="stat-label">Teléfono</div>
          <div style="font-size:15px;font-weight:600;margin-top:6px">${escapeHtml(prov.contacto.telefono)}</div>
        </div>` : ''}
      </div>
      <div style="font-weight:600;margin-bottom:10px;font-size:14px">Últimos movimientos</div>
      ${movs.length ? `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Descripción</th><th style="text-align:right">Monto</th></tr></thead>
            <tbody>
              ${movs.map(m => `<tr>
                <td class="text-sm text-muted">${formatDate(m.fecha)}</td>
                <td class="text-sm">${escapeHtml(m.descripcion || '-')}</td>
                <td class="text-sm" style="text-align:right;font-weight:600;color:${m.tipo === 'ingreso' ? 'var(--c-success)' : 'var(--c-error)'}">
                  ${m.tipo === 'ingreso' ? '+' : '-'}${formatCurrency(m.monto)}
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      ` : `<div class="empty-state" style="min-height:80px"><p class="text-sm text-muted">Sin movimientos registrados.</p></div>`}
    `,
    footer: `<button class="btn btn-secondary" id="det-close">Cerrar</button>`,
  });
  document.querySelector('#det-close')?.addEventListener('click', close);
}

async function openProvModal(prov = null) {
  const isEdit = !!prov;
  const cats = _cats.length ? _cats : await getCategorias('proveedor');

  const { modal, close } = openModal({
    title: isEdit ? 'Editar proveedor' : 'Nuevo proveedor',
    size: 'lg',
    body: `
      <div class="form-grid">
        <div class="form-group span-2">
          <label class="form-label">Nombre / Razón social <span class="required">*</span></label>
          <input type="text" class="input" id="pv-nombre" value="${escapeHtml(prov?.nombre || '')}" placeholder="Nombre del proveedor" />
        </div>
        <div class="form-group">
          <label class="form-label">Categoría</label>
          <select class="select-input" id="pv-cat">${categoriasOptions(cats, prov?.categoriaId)}</select>
        </div>
        <div class="form-group">
          <label class="form-label">CUIT</label>
          <input type="text" class="input" id="pv-cuit" value="${escapeHtml(prov?.cuit || '')}" placeholder="20-12345678-9" />
        </div>
      </div>

      <div style="margin:16px 0 10px;font-size:13px;font-weight:600;color:var(--c-text-2);border-top:1px solid var(--c-border);padding-top:16px">Contacto</div>
      <div class="form-grid">
        <div class="form-group">
          <label class="form-label">Nombre del contacto</label>
          <input type="text" class="input" id="pv-cnt-nombre" value="${escapeHtml(prov?.contacto?.nombre || '')}" />
        </div>
        <div class="form-group">
          <label class="form-label">Teléfono</label>
          <input type="tel" class="input" id="pv-cnt-tel" value="${escapeHtml(prov?.contacto?.telefono || '')}" />
        </div>
        <div class="form-group">
          <label class="form-label">Email</label>
          <input type="email" class="input" id="pv-cnt-email" value="${escapeHtml(prov?.contacto?.email || '')}" />
        </div>
        <div class="form-group">
          <label class="form-label">Website</label>
          <input type="text" class="input" id="pv-website" value="${escapeHtml(prov?.contacto?.website || '')}" placeholder="www.proveedor.com" />
        </div>
        <div class="form-group">
          <label class="form-label">Dirección</label>
          <input type="text" class="input" id="pv-cnt-dir" value="${escapeHtml(prov?.contacto?.direccion || '')}" />
        </div>
        <div class="form-group">
          <label class="form-label">Notas</label>
          <textarea class="textarea" id="pv-notas" rows="2">${escapeHtml(prov?.notas || '')}</textarea>
        </div>
      </div>
    `,
    footer: `<button class="btn btn-secondary" id="pv-cancel">Cancelar</button><button class="btn btn-primary" id="pv-save">${isEdit ? 'Guardar' : 'Crear'}</button>`,
  });

  modal.querySelector('#pv-cancel').addEventListener('click', close);
  modal.querySelector('#pv-save').addEventListener('click', async () => {
    const nombre = modal.querySelector('#pv-nombre').value.trim();
    if (!nombre) { toast('El nombre es requerido.', 'error'); return; }
    const catId  = modal.querySelector('#pv-cat').value;
    const catObj = cats.find(c => c.id === catId);
    const btn = modal.querySelector('#pv-save');
    setLoading(btn, true);

    const data = {
      nombre,
      cuit: modal.querySelector('#pv-cuit').value.trim(),
      categoriaId: catId || null,
      categoriaNombre: catObj?.nombre || null,
      contacto: {
        nombre:    modal.querySelector('#pv-cnt-nombre').value.trim(),
        telefono:  modal.querySelector('#pv-cnt-tel').value.trim(),
        email:     modal.querySelector('#pv-cnt-email').value.trim(),
        direccion: modal.querySelector('#pv-cnt-dir').value.trim(),
        website:   modal.querySelector('#pv-website').value.trim(),
      },
      notas: modal.querySelector('#pv-notas').value.trim(),
      activo: true,
    };

    try {
      const user = store.state.user;
      if (isEdit) {
        await updateDoc(doc(db, 'proveedores', prov.id), { ...data, ...metaUpdate(user) });
        toast('Proveedor actualizado.', 'success');
      } else {
        await addDoc(collection(db, 'proveedores'), { ...data, saldoCuentaCorriente: 0, ...meta(user) });
        toast('Proveedor creado.', 'success');
      }
      close();
    } catch { toast('Error al guardar.', 'error'); setLoading(btn, false); }
  });
}

async function deleteProv(id, nombre) {
  const ok = await confirm({ title: 'Eliminar proveedor', message: `¿Eliminás a <strong>${nombre}</strong>?`, confirmLabel: 'Eliminar', danger: true });
  if (!ok) return;
  try { await deleteDoc(doc(db, 'proveedores', id)); toast('Proveedor eliminado.', 'success'); }
  catch { toast('Error al eliminar.', 'error'); }
}
