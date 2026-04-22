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
    const canEdit = can('clientes', 'write');
    _cats = await getCategorias('cliente');

    container.innerHTML = `
      ${pageHeader('Clientes', canEdit ? `<button class="btn btn-primary" id="btn-new">${icon('plus')} Nuevo cliente</button>` : '')}
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
      <div id="clientes-list"></div>
    `;

    if (canEdit) container.querySelector('#btn-new').addEventListener('click', () => openClienteModal());
    container.querySelector('#search-input').addEventListener('input', e => { _search = e.target.value.toLowerCase(); });
    container.querySelector('#cat-filter').addEventListener('change', e => { _catFilter = e.target.value; });

    _unsub = onSnapshot(query(collection(db, 'clientes'), orderBy('nombre')), snap => {
      const clientes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderList(container.querySelector('#clientes-list'), clientes, canEdit);
    });
  },

  destroy() { _unsub?.(); _search = ''; _catFilter = ''; },
};

function renderList(container, all, canEdit) {
  let list = all;
  if (_search) list = list.filter(c => c.nombre?.toLowerCase().includes(_search));
  if (_catFilter) list = list.filter(c => c.categoriaId === _catFilter);

  if (!list.length) {
    container.innerHTML = `<div class="empty-state">${icon('users', 36)}<p>${all.length ? 'Sin resultados.' : 'No hay clientes todavía.'}</p></div>`;
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Nombre</th><th>Categoría</th><th>Contacto</th><th>Cta. Cte.</th><th></th></tr></thead>
        <tbody>
          ${list.map(c => `
            <tr style="cursor:pointer" data-id="${c.id}">
              <td>
                <div style="font-weight:600">${escapeHtml(c.nombre)}</div>
                ${c.contacto?.empresa ? `<div class="text-xs text-muted">${escapeHtml(c.contacto.empresa)}</div>` : ''}
              </td>
              <td>${c.categoriaNombre ? `<span class="badge badge-info">${escapeHtml(c.categoriaNombre)}</span>` : '<span class="text-muted">-</span>'}</td>
              <td>
                ${c.contacto?.telefono ? `<div class="text-sm">${icon('user')} ${escapeHtml(c.contacto.telefono)}</div>` : ''}
                ${c.contacto?.email ? `<div class="text-sm text-muted">${escapeHtml(c.contacto.email)}</div>` : ''}
              </td>
              <td>${saldoBadge(c.saldoCuentaCorriente ?? 0, 'cliente')}</td>
              <td class="actions">
                <div class="td-actions">
                  <button class="btn-icon" data-action="detail" data-id="${c.id}" title="Ver detalle">${icon('eye')}</button>
                  ${canEdit ? `<button class="btn-icon" data-action="edit" data-id="${c.id}" title="Editar">${icon('pencil')}</button>` : ''}
                  ${canEdit ? `<button class="btn-icon" data-action="del" data-id="${c.id}" data-name="${escapeHtml(c.nombre)}" title="Eliminar">${icon('trash')}</button>` : ''}
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  const cMap = Object.fromEntries(all.map(c => [c.id, c]));
  container.querySelectorAll('[data-action="detail"]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); openDetail(cMap[b.dataset.id]); }));
  container.querySelectorAll('[data-action="edit"]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); openClienteModal(cMap[b.dataset.id]); }));
  container.querySelectorAll('[data-action="del"]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); deleteCliente(b.dataset.id, b.dataset.name); }));
}

function saldoBadge(saldo, tipo) {
  if (saldo === 0) return `<span class="badge badge-success">Al día</span>`;
  if (tipo === 'cliente') {
    return saldo > 0
      ? `<span class="badge badge-error">Debe ${formatCurrency(saldo)}</span>`
      : `<span class="badge badge-success">A favor ${formatCurrency(Math.abs(saldo))}</span>`;
  }
  return saldo > 0
    ? `<span class="badge badge-error">Debemos ${formatCurrency(saldo)}</span>`
    : `<span class="badge badge-success">A favor ${formatCurrency(Math.abs(saldo))}</span>`;
}

async function openDetail(cliente) {
  const movsSnap = await getDocs(query(
    collection(db, 'movimientos'),
    where('clienteId', '==', cliente.id),
    orderBy('fecha', 'desc'),
    limit(20)
  ));
  const movs = movsSnap.docs.map(d => d.data());

  const { close } = openModal({
    title: escapeHtml(cliente.nombre),
    size: 'lg',
    body: `
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:20px">
        <div class="stat-card" style="flex:1;min-width:180px">
          <div class="stat-label">Cuenta corriente</div>
          <div class="stat-value ${(cliente.saldoCuentaCorriente ?? 0) > 0 ? 'stat-negative' : 'stat-positive'}" style="font-size:20px">
            ${formatCurrency(cliente.saldoCuentaCorriente ?? 0)}
          </div>
          <div class="stat-sub">${(cliente.saldoCuentaCorriente ?? 0) > 0 ? 'Debe' : (cliente.saldoCuentaCorriente ?? 0) < 0 ? 'A favor' : 'Al día'}</div>
        </div>
        ${cliente.contacto?.telefono ? `<div class="stat-card" style="flex:1;min-width:180px">
          <div class="stat-label">Teléfono</div>
          <div style="font-size:15px;font-weight:600;margin-top:6px">${escapeHtml(cliente.contacto.telefono)}</div>
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
                <td class="text-sm" style="text-align:right;font-weight:600" class="${m.tipo === 'ingreso' ? 'text-success' : 'text-error'}">
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

async function openClienteModal(cliente = null) {
  const isEdit = !!cliente;
  const cats = _cats.length ? _cats : await getCategorias('cliente');

  const { modal, close } = openModal({
    title: isEdit ? 'Editar cliente' : 'Nuevo cliente',
    size: 'lg',
    body: `
      <div class="form-grid">
        <div class="form-group span-2">
          <label class="form-label">Nombre / Razón social <span class="required">*</span></label>
          <input type="text" class="input" id="cl-nombre" value="${escapeHtml(cliente?.nombre || '')}" placeholder="Nombre del cliente" />
        </div>
        <div class="form-group">
          <label class="form-label">Categoría</label>
          <select class="select-input" id="cl-cat">${categoriasOptions(cats, cliente?.categoriaId)}</select>
        </div>
        <div class="form-group">
          <label class="form-label">CUIT / DNI</label>
          <input type="text" class="input" id="cl-cuit" value="${escapeHtml(cliente?.cuit || '')}" placeholder="20-12345678-9" />
        </div>
      </div>

      <div style="margin:16px 0 10px;font-size:13px;font-weight:600;color:var(--c-text-2);border-top:1px solid var(--c-border);padding-top:16px">Contacto</div>
      <div class="form-grid">
        <div class="form-group">
          <label class="form-label">Nombre del contacto</label>
          <input type="text" class="input" id="cl-cnt-nombre" value="${escapeHtml(cliente?.contacto?.nombre || '')}" placeholder="Persona de contacto" />
        </div>
        <div class="form-group">
          <label class="form-label">Teléfono</label>
          <input type="tel" class="input" id="cl-cnt-tel" value="${escapeHtml(cliente?.contacto?.telefono || '')}" placeholder="+54 11 1234-5678" />
        </div>
        <div class="form-group">
          <label class="form-label">Email</label>
          <input type="email" class="input" id="cl-cnt-email" value="${escapeHtml(cliente?.contacto?.email || '')}" placeholder="email@ejemplo.com" />
        </div>
        <div class="form-group">
          <label class="form-label">Dirección</label>
          <input type="text" class="input" id="cl-cnt-dir" value="${escapeHtml(cliente?.contacto?.direccion || '')}" placeholder="Calle 123, Ciudad" />
        </div>
        <div class="form-group span-2">
          <label class="form-label">Notas</label>
          <textarea class="textarea" id="cl-notas" rows="2" placeholder="Notas internas...">${escapeHtml(cliente?.notas || '')}</textarea>
        </div>
      </div>
    `,
    footer: `<button class="btn btn-secondary" id="cl-cancel">Cancelar</button><button class="btn btn-primary" id="cl-save">${isEdit ? 'Guardar' : 'Crear'}</button>`,
  });

  modal.querySelector('#cl-cancel').addEventListener('click', close);
  modal.querySelector('#cl-save').addEventListener('click', async () => {
    const nombre = modal.querySelector('#cl-nombre').value.trim();
    if (!nombre) { toast('El nombre es requerido.', 'error'); return; }

    const catId = modal.querySelector('#cl-cat').value;
    const catObj = cats.find(c => c.id === catId);
    const btn = modal.querySelector('#cl-save');
    setLoading(btn, true);

    const data = {
      nombre,
      cuit: modal.querySelector('#cl-cuit').value.trim(),
      categoriaId: catId || null,
      categoriaNombre: catObj?.nombre || null,
      contacto: {
        nombre:    modal.querySelector('#cl-cnt-nombre').value.trim(),
        telefono:  modal.querySelector('#cl-cnt-tel').value.trim(),
        email:     modal.querySelector('#cl-cnt-email').value.trim(),
        direccion: modal.querySelector('#cl-cnt-dir').value.trim(),
      },
      notas: modal.querySelector('#cl-notas').value.trim(),
      activo: true,
    };

    try {
      const user = store.state.user;
      if (isEdit) {
        await updateDoc(doc(db, 'clientes', cliente.id), { ...data, ...metaUpdate(user) });
        toast('Cliente actualizado.', 'success');
      } else {
        await addDoc(collection(db, 'clientes'), { ...data, saldoCuentaCorriente: 0, ...meta(user) });
        toast('Cliente creado.', 'success');
      }
      close();
    } catch (e) { toast('Error al guardar.', 'error'); setLoading(btn, false); }
  });
}

async function deleteCliente(id, nombre) {
  const ok = await confirm({ title: 'Eliminar cliente', message: `¿Eliminás a <strong>${nombre}</strong>? Los movimientos asociados no se borrarán.`, confirmLabel: 'Eliminar', danger: true });
  if (!ok) return;
  try { await deleteDoc(doc(db, 'clientes', id)); toast('Cliente eliminado.', 'success'); }
  catch { toast('Error al eliminar.', 'error'); }
}
