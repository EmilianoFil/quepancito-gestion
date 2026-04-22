import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyB7L9VpjgBjuzHsU-yVnMeFoHkfXTWffFw",
  authDomain: "quepancito-gestion.firebaseapp.com",
  projectId: "quepancito-gestion",
  storageBucket: "quepancito-gestion.firebasestorage.app",
  messagingSenderId: "575756515041",
  appId: "1:575756515041:web:6d3539b5e80540bd62e9a0",
  measurementId: "G-7RDCJ5EJKG"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);
