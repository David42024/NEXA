/**
 * Escala de colores para el mapa de calor.
 *
 * Interpola entre 4 puntos de color:
 *   azul (#3B82F6) -> verde (#22C55E) -> amarillo (#EAB308) -> rojo (#EF4444)
 *
 * Valor 0.0 = azul (baja intensidad / sin clientes sin MT)
 * Valor 1.0 = rojo (alta intensidad / muchos clientes sin MT)
 */

const STOPS = [
  { t: 0.0,  r: 59,  g: 130, b: 246 }, // #3B82F6 (azul)
  { t: 0.33, r: 34,  g: 197, b: 94  }, // #22C55E (verde)
  { t: 0.66, r: 234, g: 179, b: 8   }, // #EAB308 (amarillo)
  { t: 1.0,  r: 239, g: 68,  b: 68  }, // #EF4444 (rojo)
]

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t)
}

/**
 * @param {number} intensity - Valor normalizado entre 0 y 1
 * @returns {string} Color hex (#RRGGBB)
 */
export function colorScale(intensity) {
  const t = Math.max(0, Math.min(1, intensity))

  let i = 0
  for (let j = 1; j < STOPS.length; j++) {
    if (t <= STOPS[j].t) { i = j - 1; break }
    if (j === STOPS.length - 1) i = j - 1
  }

  const a = STOPS[i]
  const b = STOPS[i + 1]
  const local = (t - a.t) / (b.t - a.t)

  const r = lerp(a.r, b.r, local)
  const g = lerp(a.g, b.g, local)
  const bl = lerp(a.b, b.b, local)

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`
}

/**
 * Determina si un color es oscuro (para elegir texto blanco o negro).
 */
export function isDark(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance < 0.55
}
