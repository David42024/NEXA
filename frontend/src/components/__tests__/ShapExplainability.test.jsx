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

  it('renderiza las 3 razones principales con sus porcentajes', () => {
    render(<ShapExplainability shapValues={shapValues} />)
    expect(screen.getByText('Elegibilidad Movistar Total')).toBeInTheDocument()
    expect(screen.getByText('Consumo de datos')).toBeInTheDocument()
    expect(screen.getByText('Internet hogar')).toBeInTheDocument()
    expect(screen.getByText('+32%')).toBeInTheDocument()
    expect(screen.getByText('+20%')).toBeInTheDocument()
    // La cuarta razon no debe aparecer (solo top 3)
    expect(screen.queryByText('Antigüedad')).not.toBeInTheDocument()
  })

  it('ordena de mayor a menor contribucion', () => {
    const { container } = render(<ShapExplainability shapValues={shapValues} />)
    const labels = [...container.querySelectorAll('span')].map((s) => s.textContent)
    const firstLabelIdx = labels.indexOf('Elegibilidad Movistar Total')
    const secondLabelIdx = labels.indexOf('Consumo de datos')
    const thirdLabelIdx = labels.indexOf('Internet hogar')
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
    expect(container.querySelectorAll('.h-1.5').length).toBe(0)
  })
})
