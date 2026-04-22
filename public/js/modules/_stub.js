// Template for new modules
import { pageHeader, spinner } from '../ui.js';
import { icon } from '../icons.js';

export default {
  async init(container) {
    container.innerHTML = `
      ${pageHeader('Sección')}
      <div class="empty-state">
        ${icon('archive', 40)}
        <p>Próximamente</p>
        <p class="text-sm text-muted">Esta sección está en desarrollo.</p>
      </div>
    `;
  },
  destroy() {},
};
