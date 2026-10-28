import { useCallback, useEffect, useState, type ChangeEvent } from 'react'
import { useApp } from '../../app/AppContext'
import { exportBackup, restoreBackup } from '../../io/backup'
import { downloadBlob } from '../../io/files'
import { FacetButton } from '../../ui'
import { formatBytes, plural, today } from './format'

interface Usage {
  usage: number
  quota: number
}

/** Storage usage, persistence (iOS evicts non-persisted PWAs) and full backups. */
export function VaultPanel({ refreshKey, onRestored }: { refreshKey: number; onRestored: () => void }) {
  const { db } = useApp()
  const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined
  const [usage, setUsage] = useState<Usage | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [denied, setDenied] = useState(false)
  const [pending, setPending] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)

  const refresh = useCallback(async () => {
    if (!storage) return
    try {
      const est = await storage.estimate?.()
      if (est) setUsage({ usage: est.usage ?? 0, quota: est.quota ?? 0 })
      if (storage.persisted) setPersisted(await storage.persisted())
    } catch {
      // Some browsers throw in private mode; the panel just stays without numbers.
    }
  }, [storage])

  useEffect(() => {
    void refresh()
  }, [refresh, refreshKey])

  async function askPersist() {
    const ok = await storage?.persist?.().catch(() => false)
    setPersisted(!!ok)
    setDenied(!ok)
  }

  async function doExport() {
    setBusy(true)
    setMessage(null)
    try {
      downloadBlob(await exportBackup(db), `kotoba-deck-copia-${today()}.zip`)
      setMessage({ text: 'Copia de seguridad exportada. Guárdala en Archivos, iCloud o Drive.' })
    } catch {
      setMessage({ text: 'No se pudo exportar la copia de seguridad.', error: true })
    } finally {
      setBusy(false)
    }
  }

  function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) {
      setMessage(null)
      setPending(file)
    }
  }

  async function doRestore() {
    if (!pending) return
    setBusy(true)
    try {
      const r = await restoreBackup(db, pending)
      setMessage({ text: `Copia restaurada: ${plural(r.decks, 'mazo', 'mazos')} · ${plural(r.cards, 'carta', 'cartas')}.` })
      onRestored()
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'No se pudo restaurar la copia.', error: true })
    } finally {
      setPending(null)
      setBusy(false)
    }
  }

  const pct = usage && usage.quota ? Math.min(100, Math.max(1, (usage.usage / usage.quota) * 100)) : 0

  return (
    <section className="vault" aria-labelledby="vault-title">
      <div className="vault__head">
        <h2 id="vault-title" className="chrome vault__title">
          Bóveda en este teléfono
        </h2>
        <span className="chrome vault__size">{usage ? formatBytes(usage.usage) : '—'}</span>
      </div>
      <span className="vault__bar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </span>
      <p className="vault__note">
        {!storage && 'Este navegador no informa del almacenamiento.'}
        {storage && persisted === true && 'Guardado persistente activo.'}
        {storage && persisted === false && 'Guardado persistente desactivado: el sistema podría borrar tus mazos si no abres la app en semanas.'}
        {denied && ' El navegador no lo concedió; instala la app en la pantalla de inicio y exporta copias a menudo.'}
      </p>
      {storage?.persist && persisted === false && !denied && (
        <FacetButton size="s" variant="dark" full onClick={askPersist}>
          Activar guardado persistente
        </FacetButton>
      )}

      <div className="vault__actions">
        <FacetButton size="s" variant="dark" onClick={doExport} disabled={busy}>
          Exportar copia de seguridad
        </FacetButton>
        <label className={`facet-btn facet facet-s facet-btn--dark facet-btn--s vault__restore ${busy ? 'is-disabled' : ''}`}>
          <span className="facet-btn__body facet facet-s">Restaurar copia</span>
          <input className="sr-only" type="file" accept=".zip,application/zip" onChange={pick} disabled={busy} />
        </label>
      </div>

      {pending && (
        <div className="panel vault__confirm" role="group" aria-label="Confirmar restauración">
          <p>
            Restaurar «{pending.name}» reemplazará todos tus mazos y tu progreso en este dispositivo. No se puede deshacer.
          </p>
          <div className="job__choices">
            <FacetButton size="s" variant="ruby" onClick={doRestore} disabled={busy}>
              Sí, restaurar
            </FacetButton>
            <FacetButton size="s" variant="dark" onClick={() => setPending(null)} disabled={busy}>
              Cancelar
            </FacetButton>
          </div>
        </div>
      )}

      <p className={`vault__message ${message?.error ? 'vault__message--err' : ''}`} role="status">
        {message?.text}
      </p>
    </section>
  )
}
