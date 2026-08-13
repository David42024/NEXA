import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import ProbabilityRing from '../ProbabilityRing.jsx'

describe('ProbabilityRing', () => {
  it('renderiza el porcentaje correcto', () => {
    render(<ProbabilityRing value={0.72} />)
    expect(screen.getByText('72%')).toBeInTheDocument()
    expect(screen.getByText('prob.')).toBeInTheDocument()
  })

  it('redondea el valor a entero', () => {
    render(<ProbabilityRing value={0.333} />)
    expect(screen.getByText('33%')).toBeInTheDocument()
  })

  it('aplica el estado low_probability sin romperse', () => {
    const { container } = render(<ProbabilityRing value={0.25} lowProbability />)
    expect(screen.getByText('25%')).toBeInTheDocument()
    const progress = container.querySelector('circle[stroke="#F59E0B"]')
    expect(progress).toBeInTheDocument()
  })

  it('soporta valor 0 y 1 (casos limite)', () => {
    render(<ProbabilityRing value={0} />)
    expect(screen.getByText('0%')).toBeInTheDocument()
    render(<ProbabilityRing value={1} />)
    expect(screen.getByText('100%')).toBeInTheDocument()
  })
})
