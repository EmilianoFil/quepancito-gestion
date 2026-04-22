import { db, functions } from '../firebase-config.js';
import { collection, getDocs, doc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";
import { store } from '../store.js';
import { toast, openModal, confirm, pageHeader, setLoading, spinner } from '../ui.js';
import { escapeHtml, formatDateTime } from '../utils.js';
import { icon } from '../icons.js';

const SECTIONS = [
  { key: 'clientes',    label: 'Clientes' },
  { key: 'proveedores', label: 'Proveedores' },
  { key: 'empleados',   label: 'Empleados' },
  { key: 'productos',   label: 'Productos' },
  { key: 'insumos',     label: 'Insumos' },
  { key: 'movimientos', label: 'Movimientos' },
  { key: 'cuentas',     label: 'Cuentas' },
  { key: 'stock',       label: 'Stock' },
  { key: 'reportes',    label: 'Reportes' },
];

let _unsub = null;

export default {
  async init(container) {
    container.innerHTML = spinner;

    // Only admins can access this
    if (store.state.user?.role !== 'admin') {
      container.innerHTML = `<div class="empty-state"><p>Sin acceso.</p></div>`;
      return;
    }

    container.innerHTML = `
      ${pageHeader('Usuarios', `<button class="btn btn-primary" id="btn-new-user">${icon('plus')} Nuevo usuario</button>`)}
      <div id="users-list"></div>
    `;

    container.querySelector('#btn-new-user').addEventListener('click', () => openUserModal());

    _unsub = onSnapshot(collection(db, 'users'), snap => {
      const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderList(container.querySelector('#users-list'), users);
    });
  },

  destroy() { _unsub?.(); },
};

function renderList(container, users) {
  if (!users.length) {
    container.innerHTML = `<div class="empty-state">${icon('users', 36)}<p>No hay usuarios.</p></div>`;
    return;
  }

  const me = store.state.user.uid;

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Rol</th>
            <th>Estado</th>
            <th>Último ingreso</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${users.map(u => `
            <tr>
              <td>
                <div style="display:flex;align-items:center;gap:10px">
                  <div class="user-avatar" style="width:30px;height:30px;font-size:12px;background:${avatarColor(u.email)}">
                    ${(u.displayName || u.email || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <div style="font-weight:600;font-size:14px">${escapeHtml(u.displayName || '-')}</div>
                    <div class="text-xs text-muted">${escapeHtml(u.email)}</div>
                  </div>
                </div>
              </td>
              <td>
                <span class="badge ${u.role === 'admin' ? 'badge-warning' : 'badge-info'}">
                  ${u.role === 'admin' ? 'Admin' : 'Usuario'}
                </span>
              </td>
              <td><span class="badge ${u.disabled ? 'badge-neutral' : 'badge-success'}">${u.disabled ? 'Inactivo' : 'Activo'}</span></td>
              <td class="text-sm text-muted">${u.lastLogin ? formatDateTime(u.lastLogin) : '-'}</td>
              <td class="actions">
                <div class="td-actions">
                  <button class="btn-icon" title="Editar" data-action="edit" data-uid="${u.id}">${icon('pencil')}</button>
                  ${u.id !== me ? `<button class="btn-icon" title="Eliminar" data-action="delete" data-uid="${u.id}" data-name="${escapeHtml(u.email)}">${icon('trash')}</button>` : ''}
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  container.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => openUserModal(userMap[btn.dataset.uid]));
  });

  container.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => deleteUser(btn.dataset.uid, btn.dataset.name));
  });
}

function openUserModal(user = null) {
  const isEdit = !!user;
  const perms = user?.permissions || {};

  const { modal, close } = openModal({
    title: isEdit ? 'Editar usuario' : 'Nuevo usuario',
    size: 'lg',
    body: `
      <div class="form-grid">
        ${!isEdit ? `
          <div class="form-group">
            <label class="form-label">Email <span class="required">*</span></label>
            <input type="email" class="input" id="u-email" placeholder="usuario@email.com" value="${escapeHtml(user?.email || '')}" />
          </div>
          <div class="form-group">
            <label class="form-label">Nombre</label>
            <input type="text" class="input" id="u-name" placeholder="Nombre completo" value="${escapeHtml(user?.displayName || '')}" />
          </div>
        ` : `
          <div class="form-group span-2">
            <label class="form-label">Usuario</label>
            <div class="input" style="background:var(--c-surface-2);color:var(--c-text-2)">${escapeHtml(user.email)}</div>
          </div>
        `}
        <div class="form-group">
          <label class="form-label">Rol</label>
          <select class="select-input" id="u-role">
            <option value="user" ${user?.role !== 'admin' ? 'selected' : ''}>Usuario</option>
            <option value="admin" ${user?.role === 'admin' ? 'selected' : ''}>Administrador</option>
          </select>
        </div>
        ${!isEdit ? `
          <div class="form-group">
            <label class="form-label">Contraseña inicial</label>
            <input type="text" class="input" id="u-password" placeholder="Mínimo 6 caracteres" />
            <span class="form-hint">El usuario podrá cambiarla después.</span>
          </div>
        ` : '<div></div>'}
      </div>

      <div id="perms-section">
        <div style="margin:20px 0 10px;font-size:13px;font-weight:600;color:var(--c-text-2)">Permisos por sección</div>
        <table class="perms-table">
          <thead>
            <tr>
              <th>Sección</th>
              <th>Acceso</th>
            </tr>
          </thead>
          <tbody>
            ${SECTIONS.map(s => `
              <tr>
                <td>${s.label}</td>
                <td>
                  <select class="select-input" style="width:140px" data-perm="${s.key}" id="perm-${s.key}">
                    <option value="none"  ${(perms[s.key] || 'none') === 'none'  ? 'selected' : ''}>Sin acceso</option>
                    <option value="read"  ${(perms[s.key] || 'none') === 'read'  ? 'selected' : ''}>Solo lectura</option>
                    <option value="write" ${(perms[s.key] || 'none') === 'write' ? 'selected' : ''}>Lectura y escritura</option>
                  </select>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `,
    footer: `
      <button class="btn btn-secondary" id="u-cancel">Cancelar</button>
      <button class="btn btn-primary" id="u-save">${isEdit ? 'Guardar cambios' : 'Crear usuario'}</button>
    `,
  });

  modal.querySelector('#u-cancel').addEventListener('click', close);

  // Hide perms section if admin selected
  const roleSelect = modal.querySelector('#u-role');
  const permsSection = modal.querySelector('#perms-section');
  const togglePerms = () => { permsSection.style.opacity = roleSelect.value === 'admin' ? '.4' : '1'; };
  roleSelect.addEventListener('change', togglePerms);
  togglePerms();

  modal.querySelector('#u-save').addEventListener('click', async () => {
    const btn = modal.querySelector('#u-save');
    const role = modal.querySelector('#u-role').value;

    const permissions = {};
    SECTIONS.forEach(s => {
      permissions[s.key] = modal.querySelector(`#perm-${s.key}`)?.value || 'none';
    });

    setLoading(btn, true);
    try {
      if (isEdit) {
        const fn = httpsCallable(functions, 'updateUser');
        await fn({ uid: user.id, role, permissions });
        toast('Usuario actualizado.', 'success');
      } else {
        const email = modal.querySelector('#u-email')?.value.trim();
        const displayName = modal.querySelector('#u-name')?.value.trim();
        const password = modal.querySelector('#u-password')?.value;
        if (!email) { toast('El email es requerido.', 'error'); setLoading(btn, false); return; }
        if (!password || password.length < 6) { toast('La contraseña debe tener al menos 6 caracteres.', 'error'); setLoading(btn, false); return; }
        const fn = httpsCallable(functions, 'createUser');
        await fn({ email, displayName, password, role, permissions });
        toast('Usuario creado correctamente.', 'success');
      }
      close();
    } catch (err) {
      console.error(err);
      toast(err.message || 'Error al guardar el usuario.', 'error');
      setLoading(btn, false);
    }
  });
}

async function deleteUser(uid, name) {
  const ok = await confirm({
    title: 'Eliminar usuario',
    message: `¿Eliminás al usuario <strong>${name}</strong>? Esta acción no se puede deshacer.`,
    confirmLabel: 'Eliminar',
    danger: true,
  });
  if (!ok) return;
  try {
    const fn = httpsCallable(functions, 'deleteUser');
    await fn({ uid });
    toast('Usuario eliminado.', 'success');
  } catch (err) {
    toast(err.message || 'Error al eliminar el usuario.', 'error');
  }
}

function avatarColor(email) {
  const colors = ['#C4762A','#2E7A4E','#2980B9','#8E44AD','#C0392B','#D4820A'];
  let hash = 0;
  for (let i = 0; i < (email || '').length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}
