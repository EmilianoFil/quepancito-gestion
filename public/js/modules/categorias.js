import { db } from '../firebase-config.js';
import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, getDocs, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { store } from '../store.js';
import { can } from '../auth.js';
import { meta, metaUpdate, escapeHtml } from '../utils.js';
import { toast, openModal, confirm, pageHeader, setLoading, spinner } from '../ui.js';
import { icon } from '../icons.js';

const COLORS = ['#C4762A','#E8A84A','#E74C3C','#2E7A4E','#16A085','#2980B9','#8E44AD','#D35400','#7F8C8D','#2C3E50','#F39C12','#C0392B'];

const TIPOS = [
  { value: 'cliente',   label: 'Cliente',   badge: 'badge-info' },
  { value: 'proveedor', label: 'Proveedor', badge: 'badge-warning' },
  { value: 'gasto',     label: 'Gasto',     badge: 'badge-error' },
  { value: 'ingreso',   label: 'Ingreso',   badge: 'badge-success' },
  { value: 'producto',  label: 'Producto',  badge: 'badge-neutral' },
];
const TIPO_MAP = Object.fromEntries(TIPOS.map(t => [t.value, t]));

let _unsub = null;
let _filter = 'all';

export default {
  async init(container) {
    container.innerHTML = spinner;
    const canEdit = store.state.user?.role === 'admin';

    container.innerHTML = `
      ${pageHeader('Categorías', canEdit ? `<button class="btn btn-primary" id="btn-new">${icon('plus')} Nueva categoría</button>` : '')}
      <div class="tabs" id="tipo-tabs">
        <div class="tab active" data-tipo="all">Todas</div>
        ${TIPOS.map(t => `<div class="tab" data-tipo="${t.value}">${t.label}</div>`).join('')}
      </div>
      <div id="cats-list"></div>
    `;

    if (canEdit) container.querySelector('#btn-new').addEventListener('click', () => openCatModal());

    container.querySelectorAll('.tab').forEach(tab =>
      tab.addEventListener('click', () => {
        container.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        _filter = tab.dataset.tipo;
      })
    );

    _unsub = onSnapshot(query(collection(db, 'categorias'), orderBy('nombre')), snap => {
      const cats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderList(container.querySelector('#cats-list'), cats, canEdit);
    });
  },

  destroy() { _unsub?.(); _filter = 'all'; },
};

function renderList(container, allCats, canEdit) {
  const cats = _filter === 'all' ? allCats : allCats.filter(c => c.tipo === _filter);
  if (!cats.length) {
    container.innerHTML = `<div class="empty-state">${icon('tag', 36)}<p>No hay categorías${_filter !== 'all' ? ' de este tipo' : ''}.</p>${canEdit ? '<p class="text-sm text-muted">Creá la primera usando el botón de arriba.</p>' : ''}</div>`;
    return;
  }
  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Color</th><th>Nombre</th><th>Tipo</th><th></th></tr></thead>
        <tbody>
          ${cats.map(c => {
            const tipo = TIPO_MAP[c.tipo];
            return `<tr>
              <td><span style="display:inline-block;width:20px;height:20px;border-radius:50%;background:${c.color || '#999'}"></span></td>
              <td style="font-weight:600">${escapeHtml(c.nombre)}</td>
              <td><span class="badge ${tipo?.badge || 'badge-neutral'}">${tipo?.label || c.tipo}</span></td>
              <td class="actions">${canEdit ? `<div class="td-actions">
                <button class="btn-icon" data-action="edit" data-id="${c.id}">${icon('pencil')}</button>
                <button class="btn-icon" data-action="del" data-id="${c.id}" data-name="${escapeHtml(c.nombre)}">${icon('trash')}</button>
              </div>` : ''}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
  const catMap = Object.fromEntries(allCats.map(c => [c.id, c]));
  container.querySelectorAll('[data-action="edit"]').forEach(b => b.addEventListener('click', () => openCatModal(catMap[b.dataset.id])));
  container.querySelectorAll('[data-action="del"]').forEach(b => b.addEventListener('click', () => deleteCat(b.dataset.id, b.dataset.name)));
}

function openCatModal(cat = null) {
  const isEdit = !!cat;
  const selectedColor = cat?.color || COLORS[0];

  const { modal, close } = openModal({
    title: isEdit ? 'Editar categoría' : 'Nueva categoría',
    size: 'sm',
    body: `
      <div class="form-grid cols-1">
        <div class="form-group">
          <label class="form-label">Nombre <span class="required">*</span></label>
          <input type="text" class="input" id="cat-nombre" value="${escapeHtml(cat?.nombre || '')}" placeholder="Ej: Panaderías, Harinas..." />
        </div>
        <div class="form-group">
          <label class="form-label">Tipo <span class="required">*</span></label>
          <select class="select-input" id="cat-tipo">
            ${TIPOS.map(t => `<option value="${t.value}" ${cat?.tipo === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Color</label>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px" id="color-picker">
            ${COLORS.map(c => `<button type="button" data-color="${c}" style="width:26px;height:26px;border-radius:50%;background:${c};border:3px solid ${c === selectedColor ? '#fff' : 'transparent'};box-shadow:${c === selectedColor ? '0 0 0 2px '+c : 'none'};cursor:pointer;transition:.15s"></button>`).join('')}
          </div>
          <input type="hidden" id="cat-color" value="${selectedColor}" />
        </div>
      </div>
    `,
    footer: `<button class="btn btn-secondary" id="c-cancel">Cancelar</button><button class="btn btn-primary" id="c-save">${isEdit ? 'Guardar' : 'Crear'}</button>`,
  });

  modal.querySelector('#c-cancel').addEventListener('click', close);

  modal.querySelectorAll('[data-color]').forEach(btn => btn.addEventListener('click', () => {
    modal.querySelector('#cat-color').value = btn.dataset.color;
    modal.querySelectorAll('[data-color]').forEach(b => {
      const sel = b.dataset.color === btn.dataset.color;
      b.style.border = `3px solid ${sel ? '#fff' : 'transparent'}`;
      b.style.boxShadow = sel ? `0 0 0 2px ${b.dataset.color}` : 'none';
    });
  }));

  modal.querySelector('#c-save').addEventListener('click', async () => {
    const nombre = modal.querySelector('#cat-nombre').value.trim();
    const tipo   = modal.querySelector('#cat-tipo').value;
    const color  = modal.querySelector('#cat-color').value;
    if (!nombre) { toast('El nombre es requerido.', 'error'); return; }
    const btn = modal.querySelector('#c-save');
    setLoading(btn, true);
    try {
      const user = store.state.user;
      if (isEdit) {
        await updateDoc(doc(db, 'categorias', cat.id), { nombre, tipo, color, ...metaUpdate(user) });
        toast('Categoría actualizada.', 'success');
      } else {
        await addDoc(collection(db, 'categorias'), { nombre, tipo, color, ...meta(user) });
        toast('Categoría creada.', 'success');
      }
      close();
    } catch { toast('Error al guardar.', 'error'); setLoading(btn, false); }
  });
}

async function deleteCat(id, nombre) {
  const snap = await getDocs(query(collection(db, 'clientes'), where('categoriaId', '==', id)));
  if (!snap.empty) { toast('No podés eliminar una categoría que está en uso.', 'error'); return; }
  const ok = await confirm({ title: 'Eliminar categoría', message: `¿Eliminás <strong>${nombre}</strong>?`, confirmLabel: 'Eliminar', danger: true });
  if (!ok) return;
  try { await deleteDoc(doc(db, 'categorias', id)); toast('Eliminada.', 'success'); }
  catch { toast('Error al eliminar.', 'error'); }
}
