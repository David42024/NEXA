/**
 * Normaliza un nombre geografico peruano para join entre backend, GeoJSON y datos locales.
 * - Quita tildes (NFD decomposition)
 * - Pasa a mayusculas
 * - Colapsa espacios multiples en uno solo
 *
 * Coincide con backend/app/data/peru_geography.py::normalizar()
 */
export default function normalizeNombre(nombre) {
  if (!nombre) return ''
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}
