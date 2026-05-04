const TZ = 'America/Argentina/Buenos_Aires';

export function formatDate(value) {
  if (!value) return '-';
  const d = value?.toDate ? value.toDate() : new Date(value);
  return d.toLocaleDateString('es-AR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '-';
  const d = value?.toDate ? value.toDate() : new Date(value);
  return d.toLocaleString('es-AR', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
}

export function formatDateInput(value) {
  if (!value) return '';
  const d = value?.toDate ? value.toDate() : new Date(value);
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d); // yyyy-mm-dd
}

export function nowInTZ() {
  // Return the actual current moment — Firestore Timestamps are UTC internally.
  // The old toLocaleString trick created a "shifted" Date that broke range queries.
  return new Date();
}

export function formatCurrency(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return '-';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', minimumFractionDigits: 2
  }).format(amount);
}

export function formatNumber(n, decimals = 2) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals
  }).format(n);
}

export function parseCurrency(str) {
  if (!str) return 0;
  return parseFloat(String(str).replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
}

export function meta(user) {
  const now = new Date();
  return {
    createdBy: user.uid,
    createdByEmail: user.email,
    createdAt: now,
    updatedBy: user.uid,
    updatedByEmail: user.email,
    updatedAt: now,
  };
}

export function metaUpdate(user) {
  return {
    updatedBy: user.uid,
    updatedByEmail: user.email,
    updatedAt: new Date(),
  };
}

export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function slugify(str) {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');
}

export function startOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = start
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function startOfYear(date = new Date()) {
  return new Date(date.getFullYear(), 0, 1);
}
