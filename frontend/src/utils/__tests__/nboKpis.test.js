import { describe, it, expect } from 'vitest'
import {
  computeNboKpis,
  PROB_GOOD,
  PROB_WARN,
  DATOS_URGENTE,
  DATOS_WARN,
  MORA_ALTA,
} from '../nboKpis'

function mkProfile(overrides = {}) {
  const base = {
    facturacion: {
      monto_actual: 60,
      monto_facturado_prom: 100,
      dias_mora_prom: 0,
    },
    consumo: {
      dias_agotamiento_datos_promedio: 25,
      horario_pico: '19:00-23:00',
    },
    comportamiento: {
      n_reclamos: 0,
      canal_mas_usado: 'WhatsApp',
      canal_principal: 'Llamada',
    },
  }
  return {
    facturacion: { ...base.facturacion, ...(overrides.facturacion || {}) },
    consumo: { ...base.consumo, ...(overrides.consumo || {}) },
    comportamiento: { ...base.comportamiento, ...(overrides.comportamiento || {}) },
  }
}

function mkOffer(prob, ahorroPct) {
  return { probabilidad: prob, ahorro_pct: ahorroPct, oferta: 'Movistar Total Premium' }
}

describe('KPI 1 — Scoring de Probabilidad NBO', () => {
  it('sin recomendación devuelve null y tone muted', () => {
    const k = computeNboKpis(mkProfile())
    expect(k.probPct).toBeNull()
    expect(k.probTone).toBe('muted')
  })

  it('probabilidad 0.85 -> 85% y tone good', () => {
    const k = computeNboKpis(mkProfile(), mkOffer(0.85, 0.2))
    expect(k.probPct).toBe(85)
    expect(k.probTone).toBe('good')
  })

  it(`frontera good/warn en ${PROB_GOOD}%`, () => {
    expect(computeNboKpis(mkProfile(), mkOffer(0.7, 0.2)).probTone).toBe('good')
    expect(computeNboKpis(mkProfile(), mkOffer(0.69, 0.2)).probTone).toBe('warn')
  })

  it(`frontera warn/bad en ${PROB_WARN}%`, () => {
    expect(computeNboKpis(mkProfile(), mkOffer(0.5, 0.2)).probTone).toBe('warn')
    expect(computeNboKpis(mkProfile(), mkOffer(0.49, 0.2)).probTone).toBe('bad')
  })

  it('redondea probabilidad al entero', () => {
    expect(computeNboKpis(mkProfile(), mkOffer(0.705, 0.2)).probPct).toBe(71)
  })
})

describe('KPI 2 — Ahorro Real Proyectado', () => {
  it('ahorro = monto_facturado_prom x ahorro_pct', () => {
    const k = computeNboKpis(mkProfile({ facturacion: { monto_facturado_prom: 100 } }), mkOffer(0.8, 0.2))
    expect(k.ahorroMensual).toBeCloseTo(20)
    expect(k.precioProyectado).toBeCloseTo(80)
  })

  it('soporta descuento de hasta 50%', () => {
    const k = computeNboKpis(mkProfile({ facturacion: { monto_facturado_prom: 100 } }), mkOffer(0.8, 0.5))
    expect(k.ahorroMensual).toBeCloseTo(50)
    expect(k.precioProyectado).toBeCloseTo(50)
  })

  it('usa monto_promedio_6m como fallback si no hay monto_facturado_prom', () => {
    const profile = mkProfile({ facturacion: { monto_facturado_prom: undefined, monto_promedio_6m: 120 } })
    const k = computeNboKpis(profile, mkOffer(0.8, 0.25))
    expect(k.ahorroMensual).toBeCloseTo(30)
  })

  it('sin oferta el ahorro es 0 (nada que ofrecer aún)', () => {
    const k = computeNboKpis(mkProfile())
    expect(k.ahorroMensual).toBe(0)
    expect(k.ahorroPct).toBe(0)
  })
})

describe('KPI 3 — Días de Hambre de Datos', () => {
  it(`< ${DATOS_URGENTE} días -> urgencia, tone bad`, () => {
    const k = computeNboKpis(mkProfile({ consumo: { dias_agotamiento_datos_promedio: 15 } }))
    expect(k.datosUrgent).toBe(true)
    expect(k.datosTone).toBe('bad')
  })

  it(`19 días también es urgencia (frontera inferior)`, () => {
    const k = computeNboKpis(mkProfile({ consumo: { dias_agotamiento_datos_promedio: 19 } }))
    expect(k.datosUrgent).toBe(true)
  })

  it(`${DATOS_URGENTE}-${DATOS_WARN} días -> alerta media (warn), sin urgencia`, () => {
    expect(computeNboKpis(mkProfile({ consumo: { dias_agotamiento_datos_promedio: 20 } })).datosTone).toBe('warn')
    expect(computeNboKpis(mkProfile({ consumo: { dias_agotamiento_datos_promedio: 30 } })).datosTone).toBe('warn')
    expect(computeNboKpis(mkProfile({ consumo: { dias_agotamiento_datos_promedio: 30 } })).datosUrgent).toBe(false)
  })

  it(`> ${DATOS_WARN} días -> holgura (good)`, () => {
    expect(computeNboKpis(mkProfile({ consumo: { dias_agotamiento_datos_promedio: 31 } })).datosTone).toBe('good')
  })

  it('valor ausente -> muted y sin urgencia', () => {
    const k = computeNboKpis(mkProfile({ consumo: { dias_agotamiento_datos_promedio: undefined } }))
    expect(k.datosTone).toBe('muted')
    expect(k.datosUrgent).toBe(false)
  })
})

describe('KPI 4 — Semáforo de Fricción (suma conceptual)', () => {
  it('2 reclamos recientes -> Riesgo alto (rojo)', () => {
    const k = computeNboKpis(mkProfile({ comportamiento: { n_reclamos: 2 } }))
    expect(k.friccionScore).toBe(2)
    expect(k.friccionLevel).toBe('Riesgo alto')
    expect(k.friccionTone).toBe('bad')
    expect(k.friccionAlerta).toBeTruthy()
  })

  it('1 reclamo + mora alta (>= 15 días) -> Riesgo alto', () => {
    const k = computeNboKpis(
      mkProfile({ comportamiento: { n_reclamos: 1 }, facturacion: { dias_mora_prom: 20 } })
    )
    expect(k.friccionScore).toBe(2)
    expect(k.friccionLevel).toBe('Riesgo alto')
  })

  it('1 sola señal -> Riesgo medio (ámbar)', () => {
    const soloReclamo = computeNboKpis(mkProfile({ comportamiento: { n_reclamos: 1 } }))
    expect(soloReclamo.friccionLevel).toBe('Riesgo medio')
    expect(soloReclamo.friccionTone).toBe('warn')

    const soloMora = computeNboKpis(mkProfile({ facturacion: { dias_mora_prom: 15 } }))
    expect(soloMora.friccionLevel).toBe('Riesgo medio')
  })

  it(`mora < ${MORA_ALTA} días no suma fricción`, () => {
    const k = computeNboKpis(mkProfile({ facturacion: { dias_mora_prom: 14 } }))
    expect(k.friccionScore).toBe(0)
    expect(k.friccionLevel).toBe('Bajo')
  })

  it('sin señales -> Bajo (verde)', () => {
    const k = computeNboKpis(mkProfile())
    expect(k.friccionLevel).toBe('Bajo')
    expect(k.friccionTone).toBe('good')
    expect(k.friccionAlerta).toBeNull()
  })

  it('usa reclamos_12m como fallback si no hay n_reclamos', () => {
    const profile = mkProfile({ comportamiento: { n_reclamos: undefined, reclamos_12m: 3 } })
    const k = computeNboKpis(profile)
    expect(k.nReclamos).toBe(3)
    expect(k.friccionLevel).toBe('Riesgo alto')
  })
})

describe('KPI 5 — Ventana de Oportunidad', () => {
  it('combina canal_mas_usado con mejor_franja_horaria_contacto', () => {
    const profile = mkProfile({
      comportamiento: { canal_mas_usado: 'Llamada' },
      consumo: { mejor_franja_horaria_contacto: '08:00-12:00' },
    })
    const k = computeNboKpis(profile)
    expect(k.canal).toBe('Llamada')
    expect(k.franja).toBe('08:00-12:00')
  })

  it('fallback a canal_principal y horario_pico', () => {
    const profile = mkProfile({
      comportamiento: { canal_mas_usado: undefined, canal_principal: 'App' },
      consumo: { mejor_franja_horaria_contacto: undefined, horario_pico: '12:00-18:00' },
    })
    const k = computeNboKpis(profile)
    expect(k.canal).toBe('App')
    expect(k.franja).toBe('12:00-18:00')
  })

  it('valores ausentes -> null', () => {
    const k = computeNboKpis({})
    expect(k.canal).toBeNull()
    expect(k.franja).toBeNull()
  })
})