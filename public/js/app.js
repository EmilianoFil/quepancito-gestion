import { auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

onAuthStateChanged(auth, (user) => {
  if (user) {
    document.getElementById('loading').textContent = `Bienvenido, ${user.email}`;
  } else {
    document.getElementById('loading').textContent = 'No autenticado';
  }
});
