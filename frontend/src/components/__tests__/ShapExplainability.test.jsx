import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import ShapExplainability from '../ShapExplainability.jsx'

describe('ShapExplainability', () => {
  const shapValues = {
    elegibilidad_mt: 0.32,
    consumo_datos: 0.2,
    internet_hogar: 0.1,
    antiguedad: 0.05,
  }

  it('renderiza las 3 razones principales con sus puntos', () => {
    render(<ShapExplainability shapValues={shapValues} />)
    expect(screen.getByText('Es elegible para Movistar Total')).toBeInTheDocument()
    expect(screen.getByText('Alto consumo de datos')).toBeInTheDocument()
    expect(screen.getByText('Tiene internet en casa')).toBeInTheDocument()
    expect(screen.getByText('+32 pts')).toBeInTheDocument()
    expect(screen.getByText('+20 pts')).toBeInTheDocument()
    // La cuarta razon no debe aparecer (solo top 3)
    expect(screen.queryByText('Lleva tiempo como cliente')).not.toBeInTheDocument()
  })

  it('ordena de mayor a menor contribucion', () => {
    const { container } = render(<ShapExplainability shapValues={shapValues} />)
    const labels = [...container.querySelectorAll('span')].map((s) => s.textContent)
    const firstLabelIdx = labels.indexOf('Es elegible para Movistar Total')
    const secondLabelIdx = labels.indexOf('Alto consumo de datos')
    const thirdLabelIdx = labels.indexOf('Tiene internet en casa')
    expect(firstLabelIdx).toBeLessThan(secondLabelIdx)
    expect(secondLabelIdx).toBeLessThan(thirdLabelIdx)
  })

  it('funciona con valores vacios', () => {
    render(<ShapExplainability shapValues={{}} />)
    expect(screen.queryByText('+%')).not.toBeInTheDocument()
  })

  it('funciona cuando faltan valores (undefined)', () => {
    const { container } = render(<ShapExplainability />)
    expect(container.firstChild).toHaveClass('space-y-2.5')
  })
})