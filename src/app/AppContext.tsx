import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { KotobaDB } from '../db/db'

interface AppState {
  db: KotobaDB
  /** Red decks are visible only while this is on. Lives in memory, so every launch starts hidden. */
  showRed: boolean
  setShowRed: (v: boolean) => void
}

const Ctx = createContext<AppState | null>(null)

export function AppProvider({ db, children }: { db: KotobaDB; children: ReactNode }) {
  const [showRed, setShowRed] = useState(false)
  const value = useMemo(() => ({ db, showRed, setShowRed }), [db, showRed])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp(): AppState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp outside AppProvider')
  return v
}
