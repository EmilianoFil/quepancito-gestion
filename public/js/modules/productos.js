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

let _unsub  = null;
let _search = '';

export default {
  async init(container) {
    container.innerHTML = spinner;
    const canEdit = can('productos', 'write');

    container.innerHTML = `
      ${pageHeader('Productos', canEdit ? `<button class="btn btn-primary" id="btn-new">${icon('plus')} Nuevo producto</button>` : '')}
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="search-bar">
            ${icon('search')}
            <input type="text" id="search-input" placeholder="Buscar producto..." />
          </div>
        </div>
      </div>
      <div id="productos-list"></div>
    `;

    if (canEdit) container.querySelector('#btn-new').addEventListener('click', () => openProductoModal());
    container.querySelector('#search-input').addEventListener('input', e => { _search = e.target.value.toLowerCase(); });

    _unsub = onSnapshot(query(collection(db, 'productos'), orderBy('nombre')), snap => {
      const prods = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderList(container.querySelector('#productos-list'), prods, canEdit);
    });
  },

  destroy() { _unsub?.(); _search = ''; },
};

// ── Render ────────────────────────────────────────────────────────────────────

function renderList(container, all, canEdit) {
  const list = _search ? all.filter(p => p.nombre?.toLowerCase().includes(_search)) : all;

  if (!list.length) {
    container.innerHTML = `<div class="empty-state">${icon('package', 36)}<p>${all.length ? 'Sin resultados.' : 'No hay productos cargados.'}</p></div>`;
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Nombre</th>
          <th style="text-align:right">Rendimiento batch</th>
          <th style="text-align:right">Costo / kg</th>
          <th style="text-align:right">Precio venta</th>
          <th style="text-align:right">Margen</th>
          <th></th>
        </tr></thead>
        <tbody>
          ${list.map(p => {
            const margen = p.precioVenta && p.costoPorKg
              ? ((p.precioVenta - p.costoPorKg) / p.precioVenta * 100)
              : null;
            return `<tr>
              <td>
                <div style="font-weight:600">${escapeHtml(p.nombre)}</div>
                <div class="text-xs text-muted">${(p.receta?.length || 0)} ingredientes</div>
              </td>
              <td style="text-align:right" class="text-sm">${formatNumber(p.rendimientoKg ?? 0, 1)} kg</td>
              <td style="text-align:right;font-weight:700">${p.costoPorKg ? formatCurrency(p.costoPorKg) : '—'}</td>
              <td style="text-align:right">${p.precioVenta ? formatCurrency(p.precioVenta) : '—'}</td>
              <td style="text-align:right">
                ${margen !== null
                  ? `<span class="badge ${margen >= 20 ? 'badge-success' : margen >= 0 ? 'badge-warning' : 'badge-error'}">${formatNumber(margen, 1)}%</span>`
                  : '—'}
              </td>
              <td class="actions"><div class="td-actions">
                <button class="btn-icon" data-action="view" data-id="${p.id}" title="Ver receta">${icon('eye')}</button>
                ${canEdit ? `<button class="btn-icon" data-action="edit" data-id="${p.id}">${icon('pencil')}</button>` : ''}
                ${canEdit ? `<button class="btn-icon" data-action="del" data-id="${p.id}" data-name="${escapeHtml(p.nombre)}">${icon('trash')}</button>` : ''}
              </div></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  const map = Object.fromEntries(all.map(p => [p.id, p]));
  container.querySelectorAll('[data-action="view"]').forEach(b => b.addEventListener('click', () => openRecetaView(map[b.dataset.id])));
  container.querySelectorAll('[data-action="edit"]').forEach(b => b.addEventListener('click', () => openProductoModal(map[b.dataset.id])));
  container.querySelectorAll('[data-action="del"]').forEach(b => b.addEventListener('click', () => deleteProducto(b.dataset.id, b.dataset.name)));
}

// ── Receta view ───────────────────────────────────────────────────────────────

function openRecetaView(prod) {
  const receta = prod.receta || [];
  const totalCosto = receta.reduce((s, r) => s + (r.costoLinea ?? 0), 0);

  const { close } = openModal({
    title: `Receta — ${escapeHtml(prod.nombre)}`,
    size: 'lg',
    body: `
      <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px">
        <div class="stat-card">
          <div class="stat-label">Costo batch</div>
          <div class="stat-value" style="font-size:18px">${formatCurrency(totalCosto)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Rinde</div>
          <div class="stat-value" style="font-size:18px">${formatNumber(prod.rendimientoKg ?? 0, 1)} kg</div>
          <div class="stat-sub">Factor ${formatNumber(prod.factorRendimiento ?? 1.2, 2)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Costo / kg</div>
          <div class="stat-value stat-negative" style="font-size:18px">${prod.costoPorKg ? formatCurrency(prod.costoPorKg) : '—'}</div>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Insumo</th><th style="text-align:right">Cantidad</th><th>Unidad</th><th style="text-align:right">Precio/u</th><th style="text-align:right">Costo línea</th></tr></thead>
          <tbody>
            ${receta.map(r => `<tr>
              <td style="font-weight:500">${escapeHtml(r.insumoNombre)}</td>
              <td style="text-align:right">${formatNumber(r.cantidad, 3)}</td>
              <td class="text-sm text-muted">${r.unidad}</td>
              <td style="text-align:right" class="text-sm">${formatCurrency(r.precioPorUnidad ?? 0)}</td>
              <td style="text-align:right;font-weight:600">${formatCurrency(r.costoLinea ?? 0)}</td>
            </tr>`).join('')}
            <tr style="background:var(--c-surface-2);font-weight:700">
              <td colspan="4">Total batch</td>
              <td style="text-align:right">${formatCurrency(totalCosto)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `,
    footer: `<button class="btn btn-secondary" id="rv-close">Cerrar</button>`,
  });
  document.querySelector('#rv-close')?.addEventListener('click', close);
}

// ── Modal ─────────────────────────────────────────────────────────────────────

async function openProductoModal(prod = null) {
  const isEdit = !!prod;
  const insumosSnap = await getDocs(query(collection(db, 'insumos'), orderBy('nombre')));
  const insumos = insumosSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const insumoMap = Object.fromEntries(insumos.map(i => [i.id, i]));

  let receta = (prod?.receta || []).map(r => ({ ...r }));

  const { modal, close } = openModal({
    title: isEdit ? 'Editar producto' : 'Nuevo producto',
    size: 'xl',
    body: `
      <div class="form-grid" style="margin-bottom:20px">
        <div class="form-group span-2">
          <label class="form-label">Nombre <span class="required">*</span></label>
          <input type="text" class="input" id="p-nombre" value="${escapeHtml(prod?.nombre || '')}" placeholder="Ej: Pan francés, Medialuna..." />
        </div>
        <div class="form-group">
          <label class="form-label">Factor de rendimiento</label>
          <input type="number" class="input" id="p-factor" value="${prod?.factorRendimiento ?? 1.2}" min="0.1" step="0.01" />
          <span class="form-hint">Ej: 1.2 significa que el producto final pesa 1.2× la harina del batch.</span>
        </div>
        <div class="form-group">
          <label class="form-label">Precio de venta / kg (opcional)</label>
          <input type="number" class="input" id="p-precio" value="${prod?.precioVenta ?? ''}" min="0" step="0.01" placeholder="0.00" />
        </div>
        <div class="form-group span-2">
          <label class="form-label">Descripción</label>
          <input type="text" class="input" id="p-desc" value="${escapeHtml(prod?.descripcion || '')}" placeholder="Descripción opcional" />
        </div>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-weight:600;font-size:14px">Receta (ingredientes por batch)</div>
        <button type="button" class="btn btn-sm btn-secondary" id="btn-add-ing">${icon('plus')} Agregar ingrediente</button>
      </div>

      <div id="receta-table" class="table-wrap" style="margin-bottom:12px">
        <table>
          <thead><tr>
            <th>Insumo</th><th>Cantidad</th><th>Unidad</th>
            <th style="text-align:right">Precio/u</th>
            <th style="text-align:right">Costo línea</th>
            <th></th>
          </tr></thead>
          <tbody id="receta-body"></tbody>
        </table>
      </div>

      <div id="calc-footer" style="display:flex;gap:16px;flex-wrap:wrap;padding:12px 0;border-top:1px solid var(--c-border)">
        <div><span class="stat-label">Costo batch</span><br><strong id="calc-total">$0</strong></div>
        <div><span class="stat-label">Rinde</span><br><strong id="calc-rinde">0 kg</strong></div>
        <div><span class="stat-label">Costo / kg</span><br><strong id="calc-ckg" style="color:var(--c-primary)">$0</strong></div>
      </div>
    `,
    footer: `<button class="btn btn-secondary" id="p-cancel">Cancelar</button><button class="btn btn-primary" id="p-save">${isEdit ? 'Guardar' : 'Crear'}</button>`,
  });

  const recetaBody  = modal.querySelector('#receta-body');
  const factorInput = modal.querySelector('#p-factor');

  const calcCosts = () => {
    receta.forEach(r => {
      const ins = insumoMap[r.insumoId];
      r.precioPorUnidad = ins?.precioPorUnidad ?? 0;
      r.costoLinea = (r.cantidad ?? 0) * r.precioPorUnidad;
      r.unidad = ins?.unidad ?? r.unidad ?? 'kg';
    });
    const totalCosto = receta.reduce((s, r) => s + (r.costoLinea ?? 0), 0);
    const harKg = receta.find(r => insumoMap[r.insumoId]?.unidad === 'kg')?.cantidad ?? 0;
    const factor = parseFloat(factorInput.value) || 1.2;
    const rendeKg = harKg * factor;
    modal.querySelector('#calc-total').textContent = formatCurrency(totalCosto);
    modal.querySelector('#calc-rinde').textContent = `${formatNumber(rendeKg, 1)} kg`;
    modal.querySelector('#calc-ckg').textContent = rendeKg > 0 ? formatCurrency(totalCosto / rendeKg) : '—';
    return { totalCosto, rendeKg, factor };
  };

  const renderReceta = () => {
    recetaBody.innerHTML = receta.length === 0
      ? `<tr><td colspan="6" class="text-muted text-sm" style="text-align:center;padding:20px">Sin ingredientes todavía.</td></tr>`
      : receta.map((r, idx) => `
          <tr data-idx="${idx}">
            <td>
              <select class="select-input" data-field="insumoId" style="min-width:160px">
                <option value="">Seleccionar...</option>
                ${insumos.map(i => `<option value="${i.id}" ${i.id===r.insumoId?'selected':''}>${escapeHtml(i.nombre)}</option>`).join('')}
              </select>
            </td>
            <td>
              <input type="number" class="input" data-field="cantidad" value="${r.cantidad ?? ''}" min="0" step="0.001" style="width:100px" placeholder="0" />
            </td>
            <td class="text-sm text-muted" data-unit>${insumoMap[r.insumoId]?.unidad ?? r.unidad ?? '—'}</td>
            <td style="text-align:right" class="text-sm" data-precio>${formatCurrency(insumoMap[r.insumoId]?.precioPorUnidad ?? 0)}</td>
            <td style="text-align:right;font-weight:600" data-linea>${formatCurrency(r.costoLinea ?? 0)}</td>
            <td><button type="button" class="btn-icon" data-del="${idx}">${icon('trash')}</button></td>
          </tr>
        `).join('');

    recetaBody.querySelectorAll('[data-field]').forEach(inp => {
      inp.addEventListener('change', () => {
        const idx  = +inp.closest('tr').dataset.idx;
        const field = inp.dataset.field;
        receta[idx][field] = field === 'cantidad' ? parseFloat(inp.value) || 0 : inp.value;
        if (field === 'insumoId') {
          const ins = insumoMap[inp.value];
          receta[idx].insumoNombre = ins?.nombre ?? '';
        }
        calcCosts();
        // Update unit + precio display inline
        const row = inp.closest('tr');
        const ins = insumoMap[receta[idx].insumoId];
        row.querySelector('[data-unit]').textContent  = ins?.unidad ?? '—';
        row.querySelector('[data-precio]').textContent = formatCurrency(ins?.precioPorUnidad ?? 0);
        row.querySelector('[data-linea]').textContent  = formatCurrency(receta[idx].costoLinea ?? 0);
      });
    });

    recetaBody.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        receta.splice(+btn.dataset.del, 1);
        renderReceta();
        calcCosts();
      });
    });
  };

  modal.querySelector('#btn-add-ing').addEventListener('click', () => {
    receta.push({ insumoId: '', insumoNombre: '', cantidad: 0, unidad: 'kg', precioPorUnidad: 0, costoLinea: 0 });
    renderReceta();
    calcCosts();
  });

  factorInput.addEventListener('input', calcCosts);

  renderReceta();
  calcCosts();

  modal.querySelector('#p-cancel').addEventListener('click', close);
  modal.querySelector('#p-save').addEventListener('click', async () => {
    const nombre = modal.querySelector('#p-nombre').value.trim();
    if (!nombre) { toast('El nombre es requerido.', 'error'); return; }
    if (receta.some(r => !r.insumoId || !r.cantidad)) { toast('Completá todos los ingredientes.', 'error'); return; }

    const { totalCosto, rendeKg, factor } = calcCosts();
    const btn = modal.querySelector('#p-save');
    setLoading(btn, true);

    const data = {
      nombre,
      descripcion:       modal.querySelector('#p-desc').value.trim(),
      factorRendimiento: factor,
      rendimientoKg:     rendeKg,
      precioVenta:       parseFloat(modal.querySelector('#p-precio').value) || null,
      costoPorKg:        rendeKg > 0 ? totalCosto / rendeKg : null,
      costoTotalBatch:   totalCosto,
      receta,
    };

    try {
      const user = store.state.user;
      if (isEdit) {
        await updateDoc(doc(db, 'productos', prod.id), { ...data, ...metaUpdate(user) });
        toast('Producto actualizado.', 'success');
      } else {
        await addDoc(collection(db, 'productos'), { ...data, ...meta(user) });
        toast('Producto creado.', 'success');
      }
      close();
    } catch (e) { console.error(e); toast('Error al guardar.', 'error'); setLoading(btn, false); }
  });
}

async function deleteProducto(id, nombre) {
  const ok = await confirm({ title: 'Eliminar producto', message: `¿Eliminás <strong>${nombre}</strong>?`, confirmLabel: 'Eliminar', danger: true });
  if (!ok) return;
  try { await deleteDoc(doc(db, 'productos', id)); toast('Producto eliminado.', 'success'); }
  catch { toast('Error al eliminar.', 'error'); }
}
