import { auth, db } from './firebase-config.js';
import {
  onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup,
  GoogleAuthProvider, signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { store } from './store.js';
import { toast } from './ui.js';

export async function initAuth() {
  return new Promise(resolve => {
    onAuthStateChanged(auth, async user => {
      if (user) {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          store.setUser({ uid: user.uid, email: user.email, displayName: user.displayName, ...snap.data() });
          showApp();
          const hash = window.location.hash.slice(1);
          window.location.hash = (hash && hash !== '/') ? hash : '/dashboard';
        } else {
          await signOut(auth);
          store.setUser(null);
          showLogin();
          toast('Tu cuenta no tiene acceso. Contactá al administrador.', 'error');
        }
      } else {
        store.setUser(null);
        showLogin();
      }
      resolve();
    });
  });
}

function showApp() {
  document.getElementById('auth-screen').hidden = true;
  document.getElementById('app-shell').hidden = false;
  updateNav();
}

async function showLogin() {
  document.getElementById('auth-screen').hidden = false;
  document.getElementById('app-shell').hidden = true;
  const { renderLogin } = await import('./modules/login.js');
  renderLogin(document.getElementById('auth-screen'));
}

export function updateNav() {
  const user = store.state.user;
  if (!user) return;

  // User info in sidebar
  const nameEl = document.getElementById('sidebar-user-name');
  const emailEl = document.getElementById('sidebar-user-email');
  const avatarEl = document.getElementById('sidebar-avatar');
  if (nameEl) nameEl.textContent = user.displayName || user.email;
  if (emailEl) emailEl.textContent = user.email;
  if (avatarEl) avatarEl.textContent = (user.displayName || user.email || '?')[0].toUpperCase();

  // Show/hide nav items based on permissions
  document.querySelectorAll('[data-perm]').forEach(el => {
    const perm = el.dataset.perm;
    el.hidden = !can(perm, 'read');
  });
  document.querySelectorAll('[data-admin]').forEach(el => {
    el.hidden = user.role !== 'admin';
  });
}

export function can(section, level = 'read') {
  const user = store.state.user;
  if (!user) return false;
  if (user.role === 'admin') return true;
  const perm = user.permissions?.[section] ?? 'none';
  if (level === 'read') return perm === 'read' || perm === 'write';
  if (level === 'write') return perm === 'write';
  return false;
}

export async function login(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
}

export async function logout() {
  await signOut(auth);
}

export async function sendResetEmail(email) {
  return sendPasswordResetEmail(auth, email);
}
