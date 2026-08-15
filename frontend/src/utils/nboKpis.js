// Cálculo de los 5 KPIs estrella del Dashboard Comercial NBO.
// Fuente única de verdad: ClientProfile.jsx lo consume y Vitest lo valida.
// Los umbrales coinciden con ScoreBadge (verde >= 70, ámbar >= 50, rojo < 50).

export const PROB_GOOD = 70
export const PROB_WARN = 50
export const DATOS_URGENTE = 20
export const DATOS_WARN = 30
export const DATOS_CICLO = 30
export const MORA_ALTA = 15

/**
 * Probabilidad de cierre ajustada en vivo por el animo del cliente detectado
 * en la llamada (score -1 enojado .. +1 entusiasmado). Mueve hasta +/- 20 pts.
 */
export function applyLiveMood(basePct, score) {
  if (basePct == null) return null
  const adjusted = basePct + (score ?? 0) * 20
  return Math.max(2, Math.min(98, Math.round(adjusted)))
}

/**
 * Deriva los 5 KPIs del perfil del cliente y de la mejor recomendación NBO.
 *
 * - KPI 1 Scoring NBO:      probabilidad de aceptación de la mejor oferta.
 * - KPI 2 Ahorro Real:      monto_facturado_prom x ahorro_pct (S/ al mes).
 * - KPI 3 Hambre de datos:  dias_agotamiento_datos_promedio (< 20 = urgencia).
 * - KPI 4 Fricción:         suma conceptual n_reclamos + mora alta (>=15 días).
 * - KPI 5 Ventana:          cruce canal_mas_usado + mejor_franja_horaria_contacto.
 *
 * @param {object} profile   client.profile (estructura del seed).
 * @param {object|null} topOffer  primera recomendación de recs.recomendaciones.
 * @returns {object} KPIs calculados con su tone ('good'|'warn'|'bad'|'muted'|'accent').
 */
export function computeNboKpis(profile = {}, topOffer = null) {
  const p = profile || {}
  const fact = p.facturacion || {}
  const consumo = p.consumo || {}
  const comp = p.comportamiento || {}

  // KPI 1 — Scoring de Probabilidad NBO
  const probPct = topOffer ? Math.round(topOffer.probabilidad * 100) : null
  const probTone =
    probPct == null ? 'muted' : probPct >= PROB_GOOD ? 'good' : probPct >= PROB_WARN ? 'warn' : 'bad'

  // KPI 2 — Ahorro Real Proyectado
  const montoProm = fact.monto_facturado_prom ?? fact.monto_promedio_6m ?? 0
  const ahorroPct = topOffer?.ahorro_pct ?? 0
  const ahorroMensual = montoProm * ahorroPct
  const precioProyectado = montoProm * (1 - ahorroPct)

  // KPI 3 — Días de "Hambre de Datos" (consciente del ciclo de facturación).
  // Si los días de datos alcanzan el ciclo (30 días), el cliente NO tiene
  // hambre de datos: tiene de sobra. La urgencia real solo existe cuando los
  // datos se agotarían ANTES del fin del ciclo.
  const diasAgotamiento = consumo.dias_agotamiento_datos_promedio ?? null
  const datosCubreCiclo = diasAgotamiento != null && diasAgotamiento >= DATOS_CICLO
  const datosUrgent = diasAgotamiento != null && diasAgotamiento < DATOS_URGENTE
  const datosTone =
    diasAgotamiento == null
      ? 'muted'
      : datosCubreCiclo
      ? 'good'
      : datosUrgent
      ? 'bad'
      : 'warn'

  // Texto con urgencia real: solo se alerta si los datos se agotan antes del ciclo.
  let datosAlerta = null
  if (diasAgotamiento != null) {
    if (datosCubreCiclo) {
      datosAlerta = `Datos de sobra: alcanza para todo el mes (${diasAgotamiento} días)`
    } else if (datosUrgent) {
      datosAlerta = `Prioridad alta · Agotará sus datos en ${diasAgotamiento} días (antes del fin de ciclo)`
    } else {
      datosAlerta = `Agotará sus datos en ${diasAgotamiento} días (antes del fin de ciclo)`
    }
  }

  // KPI 4 — Semáforo de Fricción (suma conceptual de señales)
  const nReclamos = comp.n_reclamos ?? comp.reclamos_12m ?? 0
  const diasMora = fact.dias_mora_prom ?? 0
  const friccionScore = nReclamos + (diasMora >= MORA_ALTA ? 1 : 0)
  const friccionLevel = friccionScore >= 2 ? 'Riesgo alto' : friccionScore === 1 ? 'Riesgo medio' : 'Bajo'
  const friccionTone = friccionScore >= 2 ? 'bad' : friccionScore === 1 ? 'warn' : 'good'
  const friccionAlerta = friccionScore >= 2 ? 'Requiere manejo de objeciones' : null

  // KPI 5 — Ventana de Oportunidad (cuándo y por dónde atacar)
  const canal = comp.canal_mas_usado ?? comp.canal_principal ?? null
  const franja = consumo.mejor_franja_horaria_contacto ?? consumo.horario_pico ?? null

  return {
    probPct,
    probTone,
    montoProm,
    ahorroPct,
    ahorroMensual,
    precioProyectado,
    diasAgotamiento,
    datosUrgent,
    datosTone,
    datosCubreCiclo,
    datosAlerta,
    nReclamos,
    diasMora,
    friccionScore,
    friccionLevel,
    friccionTone,
    friccionAlerta,
    canal,
    franja,
  }
}
