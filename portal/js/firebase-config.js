import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFunctions } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js';

const app = initializeApp({
  apiKey: "AIzaSyB7L9VpjgBjuzHsU-yVnMeFoHkfXTWffFw",
  authDomain: "quepancito-gestion.firebaseapp.com",
  projectId: "quepancito-gestion",
  storageBucket: "quepancito-gestion.firebasestorage.app",
  messagingSenderId: "575756515041",
  appId: "1:575756515041:web:6d3539b5e80540bd62e9a0",
});

export const db        = getFirestore(app);
export const auth      = getAuth(app);
export const functions = getFunctions(app, 'us-central1');
