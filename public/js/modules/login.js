import { login, loginWithGoogle, sendResetEmail } from '../auth.js';
import { toast, setLoading } from '../ui.js';
import { icon } from '../icons.js';

export function renderLogin(container) {
  container.innerHTML = `
    <div class="login-card">
      <div class="login-brand">
        <span class="logo-icon">🥖</span>
        <h1>QuePancito</h1>
        <p>Sistema de gestión</p>
      </div>

      <div id="login-view">
        <form class="login-form" id="login-form">
          <button type="button" class="btn-google" id="btn-google">
            ${icon('google')} Continuar con Google
          </button>

          <div class="divider">o ingresá con email</div>

          <div class="form-group">
            <label class="form-label">Email</label>
            <input type="email" class="input" id="login-email" placeholder="tu@email.com" required autocomplete="email" />
          </div>

          <div class="form-group">
            <label class="form-label">Contraseña</label>
            <div style="position:relative">
              <input type="password" class="input" id="login-password" placeholder="••••••••" required autocomplete="current-password" style="padding-right:40px" />
              <button type="button" id="toggle-pw" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);color:var(--c-text-3)">
                ${icon('eye')}
              </button>
            </div>
            <span class="forgot-link" id="forgot-link">¿Olvidaste tu contraseña?</span>
          </div>

          <button type="submit" class="btn btn-primary w-full" id="btn-login">
            Ingresar
          </button>
        </form>
      </div>

      <div id="reset-view" hidden>
        <form class="login-form" id="reset-form">
          <p class="text-sm" style="color:var(--c-text-2);margin-bottom:4px">
            Ingresá tu email y te enviamos un link para restablecer tu contraseña.
          </p>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input type="email" class="input" id="reset-email" placeholder="tu@email.com" required />
          </div>
          <button type="submit" class="btn btn-primary w-full" id="btn-reset">
            Enviar link
          </button>
          <button type="button" class="btn btn-ghost w-full" id="btn-back-login">
            Volver al login
          </button>
        </form>
      </div>
    </div>
  `;

  setupLoginHandlers(container);
}

function setupLoginHandlers(container) {
  // Google sign-in
  container.querySelector('#btn-google').addEventListener('click', async (e) => {
    setLoading(e.currentTarget, true);
    try {
      await loginWithGoogle();
    } catch (err) {
      setLoading(e.currentTarget, false);
      toast(friendlyError(err), 'error');
    }
  });

  // Email/password login
  container.querySelector('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = container.querySelector('#login-email').value.trim();
    const password = container.querySelector('#login-password').value;
    const btn = container.querySelector('#btn-login');
    setLoading(btn, true);
    try {
      await login(email, password);
    } catch (err) {
      setLoading(btn, false);
      toast(friendlyError(err), 'error');
    }
  });

  // Toggle password visibility
  let pwVisible = false;
  container.querySelector('#toggle-pw').addEventListener('click', () => {
    pwVisible = !pwVisible;
    const input = container.querySelector('#login-password');
    const btn = container.querySelector('#toggle-pw');
    input.type = pwVisible ? 'text' : 'password';
    btn.innerHTML = icon(pwVisible ? 'eyeOff' : 'eye');
  });

  // Forgot password
  container.querySelector('#forgot-link').addEventListener('click', () => {
    container.querySelector('#login-view').hidden = true;
    container.querySelector('#reset-view').hidden = false;
    const loginEmail = container.querySelector('#login-email').value;
    if (loginEmail) container.querySelector('#reset-email').value = loginEmail;
  });

  // Send reset email
  container.querySelector('#reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = container.querySelector('#reset-email').value.trim();
    const btn = container.querySelector('#btn-reset');
    setLoading(btn, true);
    try {
      await sendResetEmail(email);
      toast('Te enviamos un email con el link para restablecer tu contraseña.', 'success', 5000);
      container.querySelector('#login-view').hidden = false;
      container.querySelector('#reset-view').hidden = true;
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setLoading(btn, false);
    }
  });

  // Back to login
  container.querySelector('#btn-back-login').addEventListener('click', () => {
    container.querySelector('#login-view').hidden = false;
    container.querySelector('#reset-view').hidden = true;
  });
}

function friendlyError(err) {
  const map = {
    'auth/user-not-found':      'No existe una cuenta con ese email.',
    'auth/wrong-password':      'Contraseña incorrecta.',
    'auth/invalid-email':       'El email no es válido.',
    'auth/too-many-requests':   'Demasiados intentos. Intentá más tarde.',
    'auth/popup-closed-by-user':'Cerraste la ventana de Google antes de completar.',
    'auth/network-request-failed': 'Error de conexión. Revisá tu internet.',
    'auth/invalid-credential':  'Email o contraseña incorrectos.',
  };
  return map[err.code] || 'Ocurrió un error. Intentá de nuevo.';
}
