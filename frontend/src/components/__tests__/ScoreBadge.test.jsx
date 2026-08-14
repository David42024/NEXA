import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import ScoreBadge from '../ScoreBadge.jsx'

describe('ScoreBadge', () => {
  it('etiqueta el score como porcentaje de probabilidad', () => {
    render(<ScoreBadge value={75} />)
    expect(screen.getByText('75% prob.')).toBeInTheDocument()
  })

  it('verde para score >= 70', () => {
    const { container } = render(<ScoreBadge value={70} />)
    expect(container.querySelector('span.bg-green-500')).toBeInTheDocument()
  })

  it('ámbar para score entre 50 y 69', () => {
    const { container } = render(<ScoreBadge value={50} />)
    expect(container.querySelector('span.bg-amber-500')).toBeInTheDocument()
  })

  it('rojo para score < 50', () => {
    const { container } = render(<ScoreBadge value={49} />)
    expect(container.querySelector('span.bg-red-500')).toBeInTheDocument()
  })

  it('soporta escala decimal (0-1)', () => {
    render(<ScoreBadge value={0.72} scale="decimal" />)
    expect(screen.getByText('72% prob.')).toBeInTheDocument()
  })
})