import { db } from '../firebase-config.js';
import {
  collection, query, orderBy, onSnapshot,
  doc, updateDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { toast, openModal } from '../ui.js';

let _unsub = null;

const ESTADOS = [
  { value: 'enviado',        label: 'Enviado',             cls: 'badge-enviado' },
  { value: 'confirmado',     label: 'Confirmado',          cls: 'badge-confirmado' },
  { value: 'en_preparacion', label: 'En preparación',      cls: 'badge-en_preparacion' },
  { value: 'listo',          label: 'Listo para entregar', cls: 'badge-listo' },
  { value: 'entregado',      label: 'Entregado',           cls: 'badge-entregado' },
];

function estadoBadge(e) {
  const est = ESTADOS.find(x => x.value === e) || ESTADOS[0];
  return `<span class="badge ${est.cls}">${est.label}</span>`;
}

export default {
  async init(el) {
    el.innerHTML = `
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <h1 class="page-title">Pedidos del portal</h1>
        <div style="display:flex;gap:8px;align-items:center">
          <label style="font-size:13px;color:var(--c-text-2)">Estado:</label>
          <select id="filtro-estado" style="padding:6px 10px;border:1.5px solid var(--c-border);border-radius:8px;font-size:13px">
            <option value="">Todos</option>
            ${ESTADOS.map(e => `<option value="${e.value}">${e.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="pedidos-list"></div>`;

    let filtro = '';
    const render = (pedidos) => {
      const lista = filtro ? pedidos.filter(p => p.estado === filtro) : pedidos;
      const listEl = el.querySelector('#pedidos-list');
      if (lista.length === 0) {
        listEl.innerHTML = `<div class="empty-state"><p>No hay pedidos${filtro ? ' con ese estado' : ''}.</p></div>`;
        return;
      }
      listEl.innerHTML = lista.map(p => {
        const fecha = p.fechaCreacion?.toDate
          ? p.fechaCreacion.toDate().toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
          : '—';
        const lineasHtml = (p.lineas || []).map(l =>
          `<div style="margin:6px 0 2px;font-weight:600;font-size:13px">${l.subClienteNombre}</div>` +
          (l.items || []).map(i =>
            `<div style="font-size:13px;color:var(--c-text-2);margin-left:12px">• ${i.productoNombre} — ${i.modoVentaNombre} ×${i.cantidad} (${((i.pesoUnitKg||0)*i.cantidad).toFixed(2)} kg)</div>`
          ).join('')
        ).join('');
        return `
          <div class="card" style="margin-bottom:12px" data-id="${p.id}">
            <div class="card-header">
              <div>
                <span style="font-weight:700">${p.ownerNombre || '—'}</span>
                <span style="font-size:12px;color:var(--c-text-2);margin-left:8px">${fecha}</span>
              </div>
              <div style="display:flex;align-items:center;gap:10px">
                ${estadoBadge(p.estado)}
                <button class="btn btn-ghost btn-sm" data-gestionar="${p.id}">Gestionar</button>
              </div>
            </div>
            <div class="card-body">
              <div style="display:flex;gap:24px;margin-bottom:10px;flex-wrap:wrap">
                <div><span style="font-size:12px;color:var(--c-text-2)">Total</span><br><strong>${(p.totalKg||0).toFixed(2)} kg</strong></div>
                <div><span style="font-size:12px;color:var(--c-text-2)">Entrega</span><br><strong>${p.fechaEntrega||'—'}</strong></div>
                <div><span style="font-size:12px;color:var(--c-text-2)">Email enviado</span><br><strong>${p.emailEnviado ? 'Sí' : 'No'}</strong></div>
              </div>
              ${lineasHtml}
            </div>
          </div>`;
      }).join('');

      listEl.querySelectorAll('[data-gestionar]').forEach(btn =>
        btn.addEventListener('click', () => {
          const p = pedidos.find(x => x.id === btn.dataset.gestionar);
          openGestionarModal(p);
        })
      );
    };

    let allPedidos = [];
    _unsub = onSnapshot(
      query(collection(db, 'pedidos'), orderBy('fechaCreacion', 'desc')),
      snap => {
        allPedidos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        render(allPedidos);
      }
    );

    el.querySelector('#filtro-estado').addEventListener('change', e => {
      filtro = e.target.value;
      render(allPedidos);
    });
  },

  destroy() {
    _unsub?.();
    _unsub = null;
  },
};

function openGestionarModal(pedido) {
  const { modal, close } = openModal({
    title: `Pedido — ${pedido.ownerNombre}`,
    body: `
      <div style="margin-bottom:16px">
        <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:var(--c-text-2)">Cambiar estado</label>
        <select id="estado-sel" style="width:100%;padding:10px 12px;border:1.5px solid var(--c-border);border-radius:8px;font-size:15px">
          ${ESTADOS.map(e =>
            `<option value="${e.value}" ${e.value === pedido.estado ? 'selected' : ''}>${e.label}</option>`
          ).join('')}
        </select>
      </div>
      <div style="font-size:13px;color:var(--c-text-2)">
        <strong>Entrega:</strong> ${pedido.fechaEntrega || 'Sin fecha'}<br>
        <strong>Total:</strong> ${(pedido.totalKg||0).toFixed(2)} kg<br>
        <strong>Copia cliente:</strong> ${pedido.copiaCliente ? 'Sí' : 'No'}
      </div>`,
    footer: `
      <button class="btn btn-secondary" id="gest-cancel">Cancelar</button>
      <button class="btn btn-primary" id="gest-save">Guardar</button>`,
  });

  modal.querySelector('#gest-cancel').addEventListener('click', close);
  modal.querySelector('#gest-save').addEventListener('click', async () => {
    const nuevoEstado = modal.querySelector('#estado-sel').value;
    await updateDoc(doc(db, 'pedidos', pedido.id), { estado: nuevoEstado });
    toast('Estado actualizado', 'success');
    close();
  });
}
