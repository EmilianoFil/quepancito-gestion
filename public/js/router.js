import { spinner } from './ui.js';
import { store } from './store.js';
import { can } from './auth.js';

const ROUTES = {
  '/dashboard':    () => import('./modules/dashboard.js'),
  '/clientes':     () => import('./modules/clientes.js'),
  '/proveedores':  () => import('./modules/proveedores.js'),
  '/empleados':    () => import('./modules/empleados.js'),
  '/productos':    () => import('./modules/productos.js'),
  '/insumos':      () => import('./modules/insumos.js'),
  '/movimientos':  () => import('./modules/movimientos.js'),
  '/cuentas':      () => import('./modules/cuentas.js'),
  '/stock':        () => import('./modules/stock.js'),
  '/reportes':     () => import('./modules/reportes.js'),
  '/categorias':   () => import('./modules/categorias.js'),
  '/usuarios':     () => import('./modules/usuarios.js'),
  '/config':       () => import('./modules/config.js'),
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

    // Permission check
    const perm = ROUTE_PERMS[path];
    const user = store.state.user;
    if (perm && user && user.role !== 'admin' && !can(perm, 'read')) {
      this.navigate('/dashboard');
      return;
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
    this._closeMobileSidebar();
  }

  _updateActive(path) {
    document.querySelectorAll('[data-route]').forEach(el =>
      el.classList.toggle('active', el.dataset.route === path)
    );
  }

  _closeMobileSidebar() {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('visible');
  }
}

export const router = new Router();
