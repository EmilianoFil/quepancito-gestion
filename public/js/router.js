import { spinner } from './ui.js';
import { store } from './store.js';

const V = '2';
const ROUTES = {
  '/dashboard':    () => import(`./modules/dashboard.js?v=${V}`),
  '/clientes':     () => import(`./modules/clientes.js?v=${V}`),
  '/proveedores':  () => import(`./modules/proveedores.js?v=${V}`),
  '/empleados':    () => import(`./modules/empleados.js?v=${V}`),
  '/productos':    () => import(`./modules/productos.js?v=${V}`),
  '/insumos':      () => import(`./modules/insumos.js?v=${V}`),
  '/movimientos':  () => import(`./modules/movimientos.js?v=${V}`),
  '/cuentas':      () => import(`./modules/cuentas.js?v=${V}`),
  '/stock':        () => import(`./modules/stock.js?v=${V}`),
  '/reportes':     () => import(`./modules/reportes.js?v=${V}`),
  '/categorias':   () => import(`./modules/categorias.js?v=${V}`),
  '/usuarios':     () => import(`./modules/usuarios.js?v=${V}`),
  '/config':       () => import(`./modules/config.js?v=${V}`),
  '/pedidos':      () => import(`./modules/pedidos.js?v=${V}`),
};

const ROUTE_TITLES = {
  '/dashboard':   'Inicio',
  '/clientes':    'Clientes',
  '/proveedores': 'Proveedores',
  '/empleados':   'Empleados',
  '/productos':   'Productos',
  '/insumos':     'Insumos',
  '/movimientos': 'Movimientos',
  '/cuentas':     'Cuentas',
  '/stock':       'Stock',
  '/reportes':    'Reportes',
  '/categorias':  'Categorías',
  '/usuarios':    'Usuarios',
  '/config':      'Configuración',
  '/pedidos':     'Pedidos',
};

// Sections that require a specific permission to access
const ROUTE_PERMS = {
  '/clientes': 'clientes', '/proveedores': 'proveedores',
  '/empleados': 'empleados', '/productos': 'productos',
  '/insumos': 'insumos', '/movimientos': 'movimientos',
  '/cuentas': 'cuentas', '/stock': 'stock', '/reportes': 'reportes',
};

class Router {
  constructor() { this._current = null; }

  init() {
    window.addEventListener('hashchange', () => this._load());
    this._load();
  }

  navigate(path) {
    window.location.hash = path;
  }

  async _load() {
    const path = window.location.hash.slice(1) || '/dashboard';
    const loader = ROUTES[path];

    if (!loader) { this.navigate('/dashboard'); return; }

    // Permission check (inlined to avoid circular dep with auth.js)
    const perm = ROUTE_PERMS[path];
    const user = store.state.user;
    if (perm && user && user.role !== 'admin') {
      const p = user.permissions?.[perm] ?? 'none';
      if (p === 'none') { this.navigate('/dashboard'); return; }
    }

    store.setRoute(path);
    this._currentModule?.destroy?.();

    const content = document.getElementById('page-content');
    if (content) content.innerHTML = spinner;

    try {
      const mod = await loader();
      this._currentModule = mod.default ?? mod;
      if (content) await this._currentModule.init(content);
    } catch (e) {
      console.error('Router error:', e);
      if (content) content.innerHTML = `<div class="empty-state"><p>Error al cargar la sección.</p></div>`;
    }

    this._updateActive(path);
    this._updateTitle(path);
    this._closeMobileSidebar();
  }

  _updateActive(path) {
    document.querySelectorAll('[data-route]').forEach(el =>
      el.classList.toggle('active', el.dataset.route === path)
    );
  }

  _updateTitle(path) {
    const el = document.getElementById('topbar-title');
    if (el) el.textContent = ROUTE_TITLES[path] ?? '';
  }

  _closeMobileSidebar() {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('visible');
  }
}

export const router = new Router();
