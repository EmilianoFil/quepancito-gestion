import { initAuth, logout, updateNav } from './auth.js';
import { router } from './router.js';
import { icon } from './icons.js';

async function init() {
  setupSidebarToggle();
  setupMobileTableLabels();
  await initAuth();
  router.init();
}

/**
 * On mobile, tables are transformed to labeled card stacks via CSS.
 * This function reads column headers from <thead> and injects:
 *   - data-label="Header text" on each <td> (except first col and actions)
 *   - <span class="td-val"> wrapping the td content (for flex layout)
 * Runs automatically via MutationObserver whenever page content changes.
 */
function setupMobileTableLabels() {
  const content = document.getElementById('page-content');
  if (!content) return;

  function applyLabels() {
    content.querySelectorAll('table').forEach(table => {
      const headers = [...table.querySelectorAll('thead th')]
        .map(th => th.textContent.trim());

      table.querySelectorAll('tbody tr').forEach(tr => {
        [...tr.querySelectorAll('td')].forEach((td, i) => {
          // Skip: first column (title), actions, already processed
          if (i === 0 || td.classList.contains('actions')) return;
          if (td.querySelector('.td-val')) return; // already done

          const label = headers[i];
          if (!label) return;

          td.dataset.label = label;

          // Wrap existing content in .td-val so ::before + value flex correctly
          const wrap = document.createElement('span');
          wrap.className = 'td-val';
          while (td.firstChild) wrap.appendChild(td.firstChild);
          td.appendChild(wrap);
        });
      });
    });
  }

  // Re-run whenever the page content changes (navigation, Firestore updates)
  const observer = new MutationObserver(applyLabels);
  observer.observe(content, { childList: true, subtree: true });
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
