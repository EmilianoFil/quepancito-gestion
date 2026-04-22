import { icon } from './icons.js';

// ── Toasts ──────────────────────────────────────────────────────────────────

export function toast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  const iconName = { success: 'check', error: 'alertCircle', warning: 'alertCircle', info: 'info' }[type] || 'info';
  el.innerHTML = `<span class="toast-icon">${icon(iconName)}</span><span class="toast-msg">${message}</span>`;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast-in'));
  setTimeout(() => {
    el.classList.remove('toast-in');
    el.addEventListener('transitionend', () => el.remove());
  }, duration);
}

// ── Modal ────────────────────────────────────────────────────────────────────

let _modalStack = [];

export function openModal({ title, body, footer, size = 'md', onClose } = {}) {
  const backdrop = document.getElementById('modal-backdrop');
  const container = document.getElementById('modal-container');

  const modal = document.createElement('div');
  modal.className = `modal modal-${size}`;
  modal.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">${title || ''}</h3>
      <button class="btn-icon modal-close">${icon('x')}</button>
    </div>
    <div class="modal-body">${body || ''}</div>
    ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
  `;

  container.appendChild(modal);
  backdrop.hidden = false;
  requestAnimationFrame(() => modal.classList.add('modal-in'));

  const close = () => {
    modal.classList.remove('modal-in');
    modal.addEventListener('transitionend', () => {
      modal.remove();
      _modalStack = _modalStack.filter(m => m !== modal);
      if (_modalStack.length === 0) backdrop.hidden = true;
    }, { once: true });
    onClose?.();
  };

  modal.querySelector('.modal-close').addEventListener('click', close);
  _modalStack.push(modal);

  return { modal, close };
}

export function closeAllModals() {
  [..._modalStack].forEach(m => m.querySelector('.modal-close')?.click());
}

// ── Confirm Dialog ───────────────────────────────────────────────────────────

export function confirm({ title, message, confirmLabel = 'Confirmar', danger = false }) {
  return new Promise(resolve => {
    const { modal, close } = openModal({
      title,
      body: `<p class="confirm-message">${message}</p>`,
      footer: `
        <button class="btn btn-secondary" id="confirm-cancel">Cancelar</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirm-ok">${confirmLabel}</button>
      `,
      onClose: () => resolve(false),
    });
    modal.querySelector('#confirm-cancel').addEventListener('click', () => { close(); resolve(false); });
    modal.querySelector('#confirm-ok').addEventListener('click', () => { close(); resolve(true); });
  });
}

// ── Loading overlay ──────────────────────────────────────────────────────────

export function setLoading(btn, loading) {
  if (!btn) return;
  if (loading) {
    btn._origText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-sm"></span>';
    btn.disabled = true;
  } else {
    btn.innerHTML = btn._origText || btn.innerHTML;
    btn.disabled = false;
  }
}

// ── Empty state ──────────────────────────────────────────────────────────────

export function emptyState(message, actionLabel, onAction) {
  return `
    <div class="empty-state">
      <div class="empty-icon">${icon('archive', 40)}</div>
      <p>${message}</p>
      ${actionLabel ? `<button class="btn btn-primary" id="empty-action">${icon('plus')} ${actionLabel}</button>` : ''}
    </div>
  `;
}

// ── Page header ──────────────────────────────────────────────────────────────

export function pageHeader(title, actions = '') {
  return `<div class="page-header"><h1 class="page-title">${title}</h1><div class="page-actions">${actions}</div></div>`;
}

// ── Spinner ──────────────────────────────────────────────────────────────────

export const spinner = `<div class="page-loading"><div class="spinner"></div></div>`;
