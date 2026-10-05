import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { TriState } from './controls'

function Harness({ initial = null }: { initial?: boolean | null }) {
  const [v, setV] = useState<boolean | null>(initial)
  return (
    <>
      <TriState label="Fuel" value={v} onChange={setV} />
      <output data-testid="v">{String(v)}</output>
    </>
  )
}

describe('TriState (burnout capture control)', () => {
  it('starts unanswered — neither chip selected', () => {
    render(<Harness />)
    expect(screen.getByTestId('v')).toHaveTextContent('null')
    expect(screen.getByTestId('tri-yes')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('tri-no')).toHaveAttribute('aria-pressed', 'false')
  })
  it('selects true / false, and tapping the selected chip clears back to null', async () => {
    const u = userEvent.setup()
    render(<Harness />)
    await u.click(screen.getByTestId('tri-no'))
    expect(screen.getByTestId('v')).toHaveTextContent('false')
    await u.click(screen.getByTestId('tri-yes'))
    expect(screen.getByTestId('v')).toHaveTextContent('true')
    await u.click(screen.getByTestId('tri-yes'))
    expect(screen.getByTestId('v')).toHaveTextContent('null')
  })
})
