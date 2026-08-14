import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import ScoreBadge from '../ScoreBadge.jsx'

describe('ScoreBadge', () => {
  it('etiqueta el score como porcentaje de probabilidad', () => {
    render(<ScoreBadge value={75} />)
    expect(screen.getByText('75% prob.')).toBeInTheDocument()
  })

  it('verde para score >= 85 (prioridad muy alta)', () => {
    const { container } = render(<ScoreBadge value={85} />)
    expect(container.querySelector('span.bg-green-500')).toBeInTheDocument()
  })

  it('lima para score entre 70 y 84 (prioridad alta)', () => {
    const { container } = render(<ScoreBadge value={70} />)
    expect(container.querySelector('span.bg-lime-500')).toBeInTheDocument()
  })

  it('ámbar para score entre 55 y 69 (prioridad media)', () => {
    const { container } = render(<ScoreBadge value={55} />)
    expect(container.querySelector('span.bg-amber-500')).toBeInTheDocument()
  })

  it('rojo para score < 55 (prioridad baja)', () => {
    const { container } = render(<ScoreBadge value={54} />)
    expect(container.querySelector('span.bg-red-500')).toBeInTheDocument()
  })

  it('soporta escala decimal (0-1)', () => {
    render(<ScoreBadge value={0.72} scale="decimal" />)
    expect(screen.getByText('72% prob.')).toBeInTheDocument()
  })
})