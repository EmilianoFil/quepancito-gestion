import { db } from '../firebase-config.js';
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { store } from '../store.js';
import { can } from '../auth.js';
import { meta, metaUpdate, escapeHtml, formatCurrency, formatDate, formatDateInput, startOfWeek, startOfMonth, startOfYear, nowInTZ } from '../utils.js';
import { toast, openModal, confirm, pageHeader, setLoading, spinner } from '../ui.js';
import { icon } from '../icons.js';
import { getCategorias, getCuentas, getClientes, getProveedores, cuentasOptions } from '../data.js';

let _unsub  = null;
let _period = 'month';
let _tipo   = 'all';
let _search = '';

export default {
  async init(container) {
    container.innerHTML = spinner;
    const canEdit = can('movimientos', 'write');

    container.innerHTML = `
      ${pageHeader('Movimientos', canEdit
        ? `<button class="btn btn-primary" id="btn-new">${icon('plus')} Nuevo movimiento</button>`
        : '')}

      <div class="movs-toolbar">
        <div class="tab-bar" id="period-tabs">
          ${['week','month','year'].map(p => `
            <button class="tab-btn ${_period===p?'active':''}" data-period="${p}">
              ${{week:'Semana',month:'Mes',year:'Año'}[p]}
            </button>`).join('')}
        </div>
        <div class="movs-filters">
          <div class="search-bar">
            ${icon('search')}
            <input type="text" id="search-input" placeholder="Buscar..." value="${_search}" />
          </div>
          <div class="tipo-btns">
            ${['all','ingreso','egreso'].map(t => `
              <button class="btn btn-sm ${_tipo===t?'btn-primary':'btn-secondary'}" data-tipo="${t}">
                ${{all:'Todos',ingreso:'Ingresos',egreso:'Egresos'}[t]}
              </button>`).join('')}
          </div>
        </div>
      </div>

      <div id="stats-row" class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px"></div>
      <div id="movs-list"></div>
    `;

    if (canEdit) container.querySelector('#btn-new').addEventListener('click', () => openMovModal());

    container.querySelectorAll('[data-period]').forEach(tab =>
      tab.addEventListener('click', () => {
        _period = tab.dataset.period;
        container.querySelectorAll('[data-period]').forEach(t =>
          t.classList.toggle('active', t.dataset.period === _period));
        resubscribe(container, canEdit);
      })
    );

    container.querySelectorAll('[data-tipo]').forEach(btn =>
      btn.addEventListener('click', () => {
        _tipo = btn.dataset.tipo;
        container.querySelectorAll('[data-tipo]').forEach(b => {
          b.classList.toggle('btn-primary', b.dataset.tipo === _tipo);
          b.classList.toggle('btn-secondary', b.dataset.tipo !== _tipo);
        });
      })
    );

    container.querySelector('#search-input').addEventListener('input', e => { _search = e.target.value.toLowerCase(); });

    resubscribe(container, canEdit);
  },

  destroy() { _unsub?.(); _search = ''; _tipo = 'all'; _period = 'month'; },
};

// ── Subscription ──────────────────────────────────────────────────────────────

function periodStart() {
  const now = nowInTZ();
  return { week: startOfWeek, month: startOfMonth, year: startOfYear }[_period](now);
}

function resubscribe(container, canEdit) {
  _unsub?.();
  const desde = Timestamp.fromDate(periodStart());
  const hasta = Timestamp.fromDate(nowInTZ());
  const q = query(
    collection(db, 'movimientos'),
    where('fecha', '>=', desde),
    where('fecha', '<=', hasta),
    orderBy('fecha', 'desc')
  );
  _unsub = onSnapshot(q, snap => {
    const movs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderStats(container.querySelector('#stats-row'), movs);
    renderList(container.querySelector('#movs-list'), movs, canEdit);
  }, err => console.error('movimientos:', err));
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderStats(el, movs) {
  const ing = movs.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + (m.monto ?? 0), 0);
  const egr = movs.filter(m => m.tipo === 'egreso').reduce((s, m) => s + (m.monto ?? 0), 0);
  const res = ing - egr;
  el.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Ingresos</div>
      <div class="stat-value stat-positive" style="font-size:20px">${formatCurrency(ing)}</div>
      <div class="stat-sub">${movs.filter(m=>m.tipo==='ingreso').length} movimientos</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Egresos</div>
      <div class="stat-value stat-negative" style="font-size:20px">${formatCurrency(egr)}</div>
      <div class="stat-sub">${movs.filter(m=>m.tipo==='egreso').length} movimientos</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Resultado</div>
      <div class="stat-value ${res >= 0 ? 'stat-positive' : 'stat-negative'}" style="font-size:20px">${formatCurrency(res)}</div>
      <div class="stat-sub">${movs.length} total</div>
    </div>
  `;
}

function renderList(el, all, canEdit) {
  let list = all;
  if (_tipo !== 'all') list = list.filter(m => m.tipo === _tipo);
  if (_search) list = list.filter(m =>
    m.descripcion?.toLowerCase().includes(_search) ||
    m.categoriaNombre?.toLowerCase().includes(_search) ||
    m.clienteNombre?.toLowerCase().includes(_search) ||
    m.proveedorNombre?.toLowerCase().includes(_search)
  );

  if (!list.length) {
    el.innerHTML = `<div class="empty-state">${icon('arrowsLR', 36)}<p>${all.length ? 'Sin resultados.' : 'No hay movimientos en este período.'}</p></div>`;
    return;
  }

  el.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Fecha</th><th>Descripción</th><th>Categoría</th>
          <th>Cuenta</th><th>Asociado a</th>
          <th style="text-align:right">Monto</th><th></th>
        </tr></thead>
        <tbody>
          ${list.map(m => `
            <tr>
              <td class="text-sm text-muted" style="white-space:nowrap">${formatDate(m.fecha)}</td>
              <td>
                <div style="font-weight:500">${escapeHtml(m.descripcion || '—')}</div>
                ${m.notas ? `<div class="text-xs text-muted">${escapeHtml(m.notas)}</div>` : ''}
              </td>
              <td>${m.categoriaNombre
                ? `<span class="badge ${m.tipo==='ingreso'?'badge-success':'badge-error'}">${escapeHtml(m.categoriaNombre)}</span>`
                : '<span class="text-muted text-xs">—</span>'}</td>
              <td class="text-sm">${escapeHtml(m.cuentaNombre || '—')}</td>
              <td class="text-sm text-muted">
                ${m.clienteNombre  ? `👤 ${escapeHtml(m.clienteNombre)}`  : ''}
                ${m.proveedorNombre ? `🏭 ${escapeHtml(m.proveedorNombre)}` : ''}
                ${!m.clienteNombre && !m.proveedorNombre ? '—' : ''}
              </td>
              <td style="text-align:right;font-weight:700;white-space:nowrap;color:${m.tipo==='ingreso'?'var(--c-success)':'var(--c-error)'}">
                ${m.tipo==='ingreso'?'+':'-'}${formatCurrency(m.monto)}
              </td>
              <td class="actions">${canEdit ? `
                <div class="td-actions">
                  <button class="btn-icon" data-action="edit" data-id="${m.id}">${icon('pencil')}</button>
                  <button class="btn-icon" data-action="del" data-id="${m.id}">${icon('trash')}</button>
                </div>` : ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  const movMap = Object.fromEntries(all.map(m => [m.id, m]));
  el.querySelectorAll('[data-action="edit"]').forEach(b => b.addEventListener('click', () => openMovModal(movMap[b.dataset.id])));
  el.querySelectorAll('[data-action="del"]').forEach(b => b.addEventListener('click', () => deleteMov(movMap[b.dataset.id])));
}

// ── Modal ─────────────────────────────────────────────────────────────────────

async function openMovModal(mov = null) {
  const isEdit = !!mov;
  const [cuentas, clientes, proveedores, catsIng, catsGasto] = await Promise.all([
    getCuentas(), getClientes(), getProveedores(),
    getCategorias('ingreso'), getCategorias('gasto'),
  ]);

  const defaultTipo = mov?.tipo ?? 'ingreso';
  const today = formatDateInput(new Date());

  const { modal, close } = openModal({
    title: isEdit ? 'Editar movimiento' : 'Nuevo movimiento',
    size: 'md',
    body: `
      <div class="form-grid cols-1">
        <div class="form-group">
          <label class="form-label">Tipo <span class="required">*</span></label>
          <div style="display:flex;gap:8px">
            <button type="button" data-val="ingreso" class="btn w-full ${defaultTipo==='ingreso'?'btn-primary':'btn-secondary'}" ${isEdit?'disabled':''}>
              ${icon('plus')} Ingreso
            </button>
            <button type="button" data-val="egreso" class="btn w-full ${defaultTipo==='egreso'?'btn-danger':'btn-secondary'}" ${isEdit?'disabled':''}>
              ${icon('arrowsLR')} Egreso
            </button>
          </div>
          <input type="hidden" id="mov-tipo" value="${defaultTipo}" />
        </div>

        <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:16px">
          <div class="form-group">
            <label class="form-label">Monto <span class="required">*</span></label>
            <input type="number" class="input" id="mov-monto"
              value="${mov?.monto ?? ''}" min="0.01" step="0.01" placeholder="0.00"
              ${isEdit ? 'readonly style="background:var(--c-surface-2);color:var(--c-text-3)"' : ''} />
            ${isEdit ? '<span class="form-hint">Para corregir el monto, eliminá y volvé a cargar.</span>' : ''}
          </div>
          <div class="form-group">
            <label class="form-label">Fecha <span class="required">*</span></label>
            <input type="date" class="input" id="mov-fecha" value="${mov ? formatDateInput(mov.fecha) : today}" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Descripción</label>
          <input type="text" class="input" id="mov-desc"
            value="${escapeHtml(mov?.descripcion || '')}"
            placeholder="Ej: Venta al contado, Pago de harina..." />
        </div>

        <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:16px">
          <div class="form-group">
            <label class="form-label">Categoría</label>
            <select class="select-input" id="mov-cat"><option value="">Sin categoría</option></select>
          </div>
          <div class="form-group">
            <label class="form-label">Cuenta ${isEdit?'':'<span class="required">*</span>'}</label>
            <select class="select-input" id="mov-cuenta" ${isEdit?'disabled style="background:var(--c-surface-2)"':''}>
              ${cuentasOptions(cuentas, mov?.cuentaId)}
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Asociar a (opcional)</label>
          <div style="display:flex;gap:8px">
            <select class="select-input" id="ent-tipo" style="width:140px;flex-shrink:0" ${isEdit?'disabled':''}>
              <option value="">Ninguno</option>
              <option value="cliente" ${mov?.clienteId?'selected':''}>Cliente</option>
              <option value="proveedor" ${mov?.proveedorId?'selected':''}>Proveedor</option>
            </select>
            <select class="select-input" id="ent-id" style="flex:1" ${isEdit?'disabled':''}><option value="">—</option></select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Notas</label>
          <textarea class="textarea" id="mov-notas" rows="2" placeholder="Notas opcionales...">${escapeHtml(mov?.notas || '')}</textarea>
        </div>
      </div>
    `,
    footer: `
      <button class="btn btn-secondary" id="m-cancel">Cancelar</button>
      <button class="btn btn-primary" id="m-save">${isEdit ? 'Guardar cambios' : 'Registrar'}</button>
    `,
  });

  const tipoInput = modal.querySelector('#mov-tipo');
  const catSel    = modal.querySelector('#mov-cat');
  const entTipo   = modal.querySelector('#ent-tipo');
  const entId     = modal.querySelector('#ent-id');

  const fillCats = (tipo) => {
    const cats = tipo === 'ingreso' ? catsIng : catsGasto;
    catSel.innerHTML = `<option value="">Sin categoría</option>` +
      cats.map(c => `<option value="${c.id}" ${c.id===mov?.categoriaId?'selected':''}>${escapeHtml(c.nombre)}</option>`).join('');
  };

  const fillEntidades = (tipo) => {
    const list = tipo === 'cliente' ? clientes : tipo === 'proveedor' ? proveedores : [];
    const sel = tipo === 'cliente' ? mov?.clienteId : mov?.proveedorId;
    entId.innerHTML = `<option value="">Seleccionar...</option>` +
      list.map(e => `<option value="${e.id}" ${e.id===sel?'selected':''}>${escapeHtml(e.nombre)}</option>`).join('');
  };

  modal.querySelectorAll('[data-val]').forEach(btn => btn.addEventListener('click', () => {
    tipoInput.value = btn.dataset.val;
    modal.querySelectorAll('[data-val]').forEach(b => {
      const sel = b.dataset.val === tipoInput.value;
      b.className = `btn w-full ${sel ? (b.dataset.val==='ingreso' ? 'btn-primary' : 'btn-danger') : 'btn-secondary'}`;
    });
    fillCats(tipoInput.value);
  }));

  entTipo.addEventListener('change', () => fillEntidades(entTipo.value));

  fillCats(defaultTipo);
  fillEntidades(mov?.clienteId ? 'cliente' : mov?.proveedorId ? 'proveedor' : '');

  modal.querySelector('#m-cancel').addEventListener('click', close);
  modal.querySelector('#m-save').addEventListener('click', async () => {
    const tipo  = tipoInput.value;
    const monto = parseFloat(modal.querySelector('#mov-monto').value);
    const fecha = modal.querySelector('#mov-fecha').value;
    const cuentaId = modal.querySelector('#mov-cuenta').value;

    if (!isEdit && (!monto || monto <= 0)) { toast('Ingresá un monto válido.', 'error'); return; }
    if (!fecha) { toast('La fecha es requerida.', 'error'); return; }
    if (!isEdit && !cuentaId) { toast('Seleccioná una cuenta.', 'error'); return; }

    const catId  = catSel.value;
    const allCats = [...catsIng, ...catsGasto];
    const catObj  = allCats.find(c => c.id === catId);
    const cuentaObj  = cuentas.find(c => c.id === cuentaId);
    const entTipoVal = entTipo.value;
    const entIdVal   = entId.value;
    const clienteObj  = entTipoVal === 'cliente'   ? clientes.find(c => c.id === entIdVal)   : null;
    const provObj     = entTipoVal === 'proveedor'  ? proveedores.find(p => p.id === entIdVal) : null;

    const btn = modal.querySelector('#m-save');
    setLoading(btn, true);

    try {
      const user = store.state.user;
      if (isEdit) {
        await updateDoc(doc(db, 'movimientos', mov.id), {
          descripcion:     modal.querySelector('#mov-desc').value.trim(),
          fecha:           Timestamp.fromDate(new Date(fecha + 'T12:00:00')),
          categoriaId:     catId || null,
          categoriaNombre: catObj?.nombre || null,
          notas:           modal.querySelector('#mov-notas').value.trim(),
          ...metaUpdate(user),
        });
        toast('Movimiento actualizado.', 'success');
      } else {
        await addDoc(collection(db, 'movimientos'), {
          tipo,
          monto,
          fecha:           Timestamp.fromDate(new Date(fecha + 'T12:00:00')),
          descripcion:     modal.querySelector('#mov-desc').value.trim(),
          categoriaId:     catId || null,
          categoriaNombre: catObj?.nombre || null,
          cuentaId,
          cuentaNombre:    cuentaObj?.nombre || null,
          clienteId:       clienteObj?.id    || null,
          clienteNombre:   clienteObj?.nombre || null,
          proveedorId:     provObj?.id        || null,
          proveedorNombre: provObj?.nombre    || null,
          notas:           modal.querySelector('#mov-notas').value.trim(),
          ...meta(user),
        });
        toast('Movimiento registrado.', 'success');
      }
      close();
    } catch (e) {
      console.error(e);
      toast('Error al guardar.', 'error');
      setLoading(btn, false);
    }
  });
}

async function deleteMov(mov) {
  const ok = await confirm({
    title: 'Eliminar movimiento',
    message: `¿Eliminás el movimiento de <strong>${formatCurrency(mov.monto)}</strong>?<br>
      <span class="text-sm text-muted">Se revertirán los saldos automáticamente.</span>`,
    confirmLabel: 'Eliminar',
    danger: true,
  });
  if (!ok) return;
  try {
    await deleteDoc(doc(db, 'movimientos', mov.id));
    toast('Movimiento eliminado. Saldos actualizados.', 'success');
  } catch { toast('Error al eliminar.', 'error'); }
}
