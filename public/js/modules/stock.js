import { pageHeader } from '../ui.js';
import { icon } from '../icons.js';

const LABELS = {
  clientes: 'Clientes', proveedores: 'Proveedores', empleados: 'Empleados',
  productos: 'Productos', insumos: 'Insumos', movimientos: 'Movimientos',
  cuentas: 'Cuentas', stock: 'Stock', reportes: 'Reportes',
  categorias: 'Categorías', config: 'Configuración'
};

export default {
  async init(container) {
    const key = 'stock';
    container.innerHTML = `
      ${pageHeader(LABELS[key] || key)}
      <div class="empty-state">
        ${icon('archive', 40)}
        <p>Próximamente</p>
        <p class="text-sm text-muted">Esta sección está en desarrollo.</p>
      </div>
    `;
  },
  destroy() {},
};
