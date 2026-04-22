// Shared data helpers — cached fetches for use in dropdowns across modules
import { db } from './firebase-config.js';
import { collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export async function getCategorias(tipo = null) {
  const q = tipo
    ? query(collection(db, 'categorias'), where('tipo', '==', tipo), orderBy('nombre'))
    : query(collection(db, 'categorias'), orderBy('nombre'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getCuentas() {
  const snap = await getDocs(query(collection(db, 'cuentas'), orderBy('nombre')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getClientes() {
  const snap = await getDocs(query(collection(db, 'clientes'), where('activo', '==', true), orderBy('nombre')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getProveedores() {
  const snap = await getDocs(query(collection(db, 'proveedores'), where('activo', '==', true), orderBy('nombre')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function categoriasOptions(cats, selected = '') {
  return `<option value="">Sin categoría</option>` +
    cats.map(c => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${c.nombre}</option>`).join('');
}

export function cuentasOptions(cuentas, selected = '') {
  return `<option value="">Seleccionar cuenta</option>` +
    cuentas.map(c => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${c.nombre}</option>`).join('');
}
