import { initAuth, logout } from './auth.js';
import { router } from './router.js';

async function init() {
  setupSidebarToggle();
  setupMobileCards();
  await initAuth();
  router.init();
}

/**
 * On mobile (≤767px), replaces every <table> with clean card divs.
 * DOM nodes are MOVED (not cloned) so all event listeners are preserved.
 * Cards structure:
 *   .m-card
 *     .m-card-title   ← first td content
 *     .m-card-row     ← one per middle td, with label + value
 *       .m-card-label
 *       .m-card-val
 *     .m-card-actions ← td.actions content
 */
function setupMobileCards() {
  const content = document.getElementById('page-content');
  if (!content) return;

  function convertTables() {
    if (window.innerWidth > 767) return;

    // Only target tables not yet converted
    content.querySelectorAll('table:not([data-m])').forEach(table => {
      table.dataset.m = '1';

      const headers = [...table.querySelectorAll('thead th')]
        .map(th => th.textContent.trim());

      const cards = [];

      table.querySelectorAll('tbody tr').forEach(tr => {
        const tds = [...tr.querySelectorAll(':scope > td')];
        if (!tds.length) return;

        const card = document.createElement('div');
        card.className = 'm-card';

        // ── Title: first td ──────────────────────────────
        const titleEl = document.createElement('div');
        titleEl.className = 'm-card-title';
        while (tds[0].firstChild) titleEl.appendChild(tds[0].firstChild);
        card.appendChild(titleEl);

        // ── Middle tds + actions ─────────────────────────
        for (let i = 1; i < tds.length; i++) {
          const td = tds[i];
          const isActions = td.classList.contains('actions')
            || !!td.querySelector('.td-actions, [data-action]');

          if (isActions) {
            const footer = document.createElement('div');
            footer.className = 'm-card-actions';
            while (td.firstChild) footer.appendChild(td.firstChild);
            card.appendChild(footer);
            continue;
          }

          const label = headers[i];
          if (!label) continue;

          const row = document.createElement('div');
          row.className = 'm-card-row';

          const lbl = document.createElement('span');
          lbl.className = 'm-card-label';
          lbl.textContent = label;

          const val = document.createElement('span');
          val.className = 'm-card-val';
          while (td.firstChild) val.appendChild(td.firstChild);

          row.appendChild(lbl);
          row.appendChild(val);
          card.appendChild(row);
        }

        cards.push(card);
      });

      if (!cards.length) return;

      const wrap = document.createElement('div');
      wrap.className = 'm-cards';
      cards.forEach(c => wrap.appendChild(c));

      // Replace the .table-wrap (or the table itself) with the cards div
      const target = table.closest('.table-wrap') || table;
      target.replaceWith(wrap);
    });
  }

  const observer = new MutationObserver(convertTables);
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

  document.querySelectorAll('[data-route]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      router.navigate(el.dataset.route);
    });
  });
}

init();
