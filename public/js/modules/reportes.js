import { db } from '../firebase-config.js';
import {
  collection, query, where, orderBy, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { can } from '../auth.js';
import { formatCurrency, formatDate, startOfWeek, startOfMonth, startOfYear, nowInTZ } from '../utils.js';
import { pageHeader, spinner, setLoading } from '../ui.js';
import { icon } from '../icons.js';

const PERIODOS = [
  { value: 'semana',  label: 'Esta semana' },
  { value: 'mes',     label: 'Este mes' },
  { value: 'anio',    label: 'Este año' },
  { value: 'custom',  label: 'Personalizado' },
];

let _periodo = 'mes';
let _desde = null;
let _hasta = null;

export default {
  async init(container) {
    if (!can('reportes', 'read')) {
      container.innerHTML = `<div class="empty-state">${icon('lock', 40)}<p>Sin acceso.</p></div>`;
      return;
    }

    container.innerHTML = `
      ${pageHeader('Reportes')}
      <div class="toolbar">
        <div class="toolbar-left" style="gap:8px;flex-wrap:wrap">
          <div class="tab-bar" id="periodo-tabs">
            ${PERIODOS.map(p => `<button class="tab-btn ${p.value === _periodo ? 'active' : ''}" data-periodo="${p.value}">${p.label}</button>`).join('')}
          </div>
          <div id="custom-range" style="display:none;gap:8px;align-items:center" class="flex">
            <input type="date" class="input" id="r-desde" style="width:140px" />
            <span class="text-muted">→</span>
            <input type="date" class="input" id="r-hasta" style="width:140px" />
            <button class="btn btn-primary" id="r-aplicar">Aplicar</button>
          </div>
        </div>
      </div>
      <div id="reporte-content">${spinner}</div>
    `;

    container.querySelectorAll('.tab-btn').forEach(b => {
      b.addEventListener('click', () => {
        _periodo = b.dataset.periodo;
        container.querySelectorAll('.tab-btn').forEach(t => t.classList.toggle('active', t.dataset.periodo === _periodo));
        const customRow = container.querySelector('#custom-range');
        customRow.style.display = _periodo === 'custom' ? '' : 'none';
        if (_periodo !== 'custom') loadReport(container);
      });
    });

    container.querySelector('#r-aplicar')?.addEventListener('click', () => {
      _desde = container.querySelector('#r-desde').value;
      _hasta = container.querySelector('#r-hasta').value;
      if (!_desde || !_hasta) return;
      loadReport(container);
    });

    await loadReport(container);
  },

  destroy() { _periodo = 'mes'; _desde = null; _hasta = null; },
};

function getRange() {
  const now = nowInTZ();
  if (_periodo === 'semana')  return { desde: startOfWeek(),  hasta: now };
  if (_periodo === 'mes')     return { desde: startOfMonth(), hasta: now };
  if (_periodo === 'anio')    return { desde: startOfYear(),  hasta: now };
  // custom
  const desde = _desde ? new Date(_desde + 'T00:00:00-03:00') : startOfMonth();
  const hasta = _hasta ? new Date(_hasta + 'T23:59:59-03:00') : now;
  return { desde, hasta };
}

async function loadReport(container) {
  const content = container.querySelector('#reporte-content');
  content.innerHTML = spinner;

  const { desde, hasta } = getRange();

  const snap = await getDocs(
    query(collection(db, 'movimientos'), where('fecha', '>=', desde), where('fecha', '<=', hasta), orderBy('fecha', 'desc'))
  );

  const movs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  let ingresos = 0, egresos = 0;
  const byCategoria = {};
  const byCuenta = {};

  for (const m of movs) {
    if (m.tipo === 'ingreso') ingresos += m.monto ?? 0;
    else egresos += m.monto ?? 0;

    // Agrupación por categoría
    const catKey = m.categoriaNombre || 'Sin categoría';
    if (!byCategoria[catKey]) byCategoria[catKey] = { ingresos: 0, egresos: 0 };
    if (m.tipo === 'ingreso') byCategoria[catKey].ingresos += m.monto ?? 0;
    else byCategoria[catKey].egresos += m.monto ?? 0;

    // Agrupación por cuenta
    const cuentaKey = m.cuentaNombre || 'Sin cuenta';
    if (!byCuenta[cuentaKey]) byCuenta[cuentaKey] = { ingresos: 0, egresos: 0 };
    if (m.tipo === 'ingreso') byCuenta[cuentaKey].ingresos += m.monto ?? 0;
    else byCuenta[cuentaKey].egresos += m.monto ?? 0;
  }

  const resultado = ingresos - egresos;
  const margen = ingresos > 0 ? (resultado / ingresos) * 100 : 0;

  // Ordenar categorías por gasto desc
  const catRows = Object.entries(byCategoria).sort((a, b) => (b[1].egresos + b[1].ingresos) - (a[1].egresos + a[1].ingresos));
  const cuentaRows = Object.entries(byCuenta);

  content.innerHTML = `
    <!-- KPIs -->
    <div class="stats-grid" style="margin-bottom:24px">
      <div class="stat-card">
        <div class="stat-label">Ingresos</div>
        <div class="stat-value text-success">${formatCurrency(ingresos)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Egresos</div>
        <div class="stat-value text-error">${formatCurrency(egresos)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Resultado</div>
        <div class="stat-value ${resultado >= 0 ? 'text-success' : 'text-error'}">${formatCurrency(resultado)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Margen</div>
        <div class="stat-value ${margen >= 20 ? 'text-success' : margen >= 0 ? '' : 'text-error'}">${margen.toFixed(1)}%</div>
      </div>
    </div>

    <div class="report-grid">
      <!-- Por categoría -->
      <div class="card">
        <div class="card-header"><h3 class="card-title">Por categoría</h3></div>
        <div class="card-body" style="padding:0">
          ${catRows.length ? `
          <div class="table-wrap">
            <table>
              <thead><tr><th>Categoría</th><th style="text-align:right">Ingresos</th><th style="text-align:right">Egresos</th></tr></thead>
              <tbody>
                ${catRows.map(([cat, v]) => `<tr>
                  <td>${cat}</td>
                  <td style="text-align:right;color:var(--c-success)">${v.ingresos ? formatCurrency(v.ingresos) : '—'}</td>
                  <td style="text-align:right;color:var(--c-error)">${v.egresos ? formatCurrency(v.egresos) : '—'}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>` : `<div class="empty-state" style="min-height:80px"><p class="text-sm text-muted">Sin movimientos en el período.</p></div>`}
        </div>
      </div>

      <!-- Por cuenta -->
      <div class="card">
        <div class="card-header"><h3 class="card-title">Por cuenta</h3></div>
        <div class="card-body" style="padding:0">
          ${cuentaRows.length ? `
          <div class="table-wrap">
            <table>
              <thead><tr><th>Cuenta</th><th style="text-align:right">Ingresos</th><th style="text-align:right">Egresos</th></tr></thead>
              <tbody>
                ${cuentaRows.map(([cuenta, v]) => `<tr>
                  <td>${cuenta}</td>
                  <td style="text-align:right;color:var(--c-success)">${v.ingresos ? formatCurrency(v.ingresos) : '—'}</td>
                  <td style="text-align:right;color:var(--c-error)">${v.egresos ? formatCurrency(v.egresos) : '—'}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>` : `<div class="empty-state" style="min-height:80px"><p class="text-sm text-muted">Sin movimientos en el período.</p></div>`}
        </div>
      </div>
    </div>

    <!-- Últimos movimientos del período -->
    <div class="card" style="margin-top:24px">
      <div class="card-header"><h3 class="card-title">Movimientos del período</h3><span class="text-sm text-muted">${movs.length} registros</span></div>
      <div class="card-body" style="padding:0">
        ${movs.length ? `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Categoría</th><th>Cuenta</th><th style="text-align:right">Monto</th></tr></thead>
            <tbody>
              ${movs.map(m => `<tr>
                <td class="text-sm text-muted">${formatDate(m.fecha)}</td>
                <td><span class="badge ${m.tipo === 'ingreso' ? 'badge-success' : 'badge-error'}">${m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}</span></td>
                <td>${m.descripcion || '—'}</td>
                <td class="text-sm text-muted">${m.categoriaNombre || '—'}</td>
                <td class="text-sm text-muted">${m.cuentaNombre || '—'}</td>
                <td style="text-align:right;font-weight:600;color:var(--c-${m.tipo === 'ingreso' ? 'success' : 'error'})">${formatCurrency(m.monto)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>` : `<div class="empty-state" style="min-height:80px"><p class="text-sm text-muted">Sin movimientos en el período.</p></div>`}
      </div>
    </div>
  `;
}
