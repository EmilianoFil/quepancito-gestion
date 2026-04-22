import { db } from '../firebase-config.js';
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { store } from '../store.js';
import { can } from '../auth.js';
import { formatCurrency, formatDateTime, startOfMonth } from '../utils.js';
import { pageHeader, spinner } from '../ui.js';
import { icon } from '../icons.js';

export default {
  async init(container) {
    container.innerHTML = spinner;
    const user = store.state.user;

    try {
      const [movData, balance] = await Promise.all([
        can('movimientos', 'read') ? loadMovimientos() : null,
        can('cuentas', 'read') ? loadBalanceCuentas() : null,
      ]);

      container.innerHTML = `
        ${pageHeader('Dashboard')}

        <div class="stats-grid">
          ${can('movimientos', 'read') ? `
            <div class="stat-card">
              <div class="stat-label">Ingresos del mes</div>
              <div class="stat-value stat-positive">${formatCurrency(movData?.ingresosMes ?? 0)}</div>
              <div class="stat-sub">Mes actual</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Egresos del mes</div>
              <div class="stat-value stat-negative">${formatCurrency(movData?.egresosMes ?? 0)}</div>
              <div class="stat-sub">Mes actual</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Resultado del mes</div>
              <div class="stat-value ${(movData?.resultado ?? 0) >= 0 ? 'stat-positive' : 'stat-negative'}">
                ${formatCurrency(movData?.resultado ?? 0)}
              </div>
              <div class="stat-sub">Ingresos − Egresos</div>
            </div>
          ` : ''}
          ${can('cuentas', 'read') && balance !== null ? `
            <div class="stat-card">
              <div class="stat-label">Balance cuentas</div>
              <div class="stat-value">${formatCurrency(balance)}</div>
              <div class="stat-sub">Total disponible</div>
            </div>
          ` : ''}
        </div>

        ${can('movimientos', 'read') && movData?.recientes?.length ? `
          <div class="card">
            <div class="card-header">
              <span class="card-title">Últimos movimientos</span>
              <a class="btn btn-sm btn-ghost" data-route="/movimientos" style="cursor:pointer">
                Ver todos ${icon('chevronR')}
              </a>
            </div>
            <div class="table-wrap" style="border:none;border-radius:0">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Descripción</th>
                    <th>Categoría</th>
                    <th style="text-align:right">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  ${movData.recientes.map(m => `
                    <tr>
                      <td class="text-sm text-muted">${formatDateTime(m.fecha)}</td>
                      <td>${m.descripcion || '-'}</td>
                      <td><span class="badge badge-neutral">${m.categoriaNombre || '-'}</span></td>
                      <td style="text-align:right;font-weight:600" class="${m.tipo === 'ingreso' ? 'text-success' : 'text-error'}">
                        ${m.tipo === 'ingreso' ? '+' : '-'}${formatCurrency(m.monto)}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : `
          <div class="empty-state">
            <div class="empty-icon">${icon('home', 40)}</div>
            <p>Bienvenido, <strong>${user?.displayName || user?.email}</strong></p>
            <p class="text-sm text-muted">Usá el menú para navegar por el sistema.</p>
          </div>
        `}
      `;

      // Wire up "Ver todos" link
      container.querySelector('[data-route="/movimientos"]')?.addEventListener('click', e => {
        e.preventDefault();
        import('../router.js').then(m => m.router.navigate('/movimientos'));
      });

    } catch (err) {
      console.error('Dashboard error:', err);
      container.innerHTML = `<div class="empty-state"><p>Error al cargar el dashboard.</p></div>`;
    }
  },

  destroy() {},
};

async function loadMovimientos() {
  const inicio = Timestamp.fromDate(startOfMonth());
  const q = query(
    collection(db, 'movimientos'),
    where('fecha', '>=', inicio),
    orderBy('fecha', 'desc')
  );
  const snap = await getDocs(q);
  let ingresosMes = 0, egresosMes = 0;
  const recientes = [];

  snap.forEach(doc => {
    const d = doc.data();
    if (d.tipo === 'ingreso') ingresosMes += d.monto ?? 0;
    else egresosMes += d.monto ?? 0;
    if (recientes.length < 8) recientes.push(d);
  });

  return { ingresosMes, egresosMes, resultado: ingresosMes - egresosMes, recientes };
}

async function loadBalanceCuentas() {
  const snap = await getDocs(collection(db, 'cuentas'));
  let total = 0;
  snap.forEach(doc => { total += doc.data().saldo ?? 0; });
  return total;
}
