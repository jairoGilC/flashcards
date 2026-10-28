import { describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { AppProvider, useApp } from './AppContext'
import { KotobaDB } from '../db/db'

function Probe() {
  const { showRed, setShowRed } = useApp()
  return <button onClick={() => setShowRed(!showRed)}>{showRed ? 'visible' : 'oculto'}</button>
}

describe('showRed session flag', () => {
  it('starts hidden on every mount (app launch) and is not persisted', async () => {
    const db = new KotobaDB('session-test')
    const first = render(<AppProvider db={db}><Probe /></AppProvider>)
    expect(screen.getByRole('button')).toHaveTextContent('oculto')
    await act(async () => screen.getByRole('button').click())
    expect(screen.getByRole('button')).toHaveTextContent('visible')
    first.unmount()

    render(<AppProvider db={db}><Probe /></AppProvider>)
    expect(screen.getByRole('button')).toHaveTextContent('oculto')
    expect(await db.settings.get('showRed')).toBeUndefined()
    db.close()
  })
})
