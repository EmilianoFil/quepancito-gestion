import { initAuth, logout, updateNav } from './auth.js';
import { router } from './router.js';
import { icon } from './icons.js';

async function init() {
  setupSidebarToggle();
  await initAuth();
  router.init();
}

function setupSidebarToggle() {
  document.getElementById('menu-toggle')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebar-overlay').classList.toggle('visible');
  });

  document.getElementById('sidebar-overlay')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('visible');
  });

  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    await logout();
  });

  // Nav links
  document.querySelectorAll('[data-route]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      router.navigate(el.dataset.route);
    });
  });
}

init();
