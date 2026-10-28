import { FacetButton, Icon } from '../../ui'
import { plural } from './format'

export type JobStatus = 'opening' | 'ask' | 'saving' | 'done' | 'error'

export interface Job {
  key: number
  fileName: string
  status: JobStatus
  deckName?: string
  existingName?: string
  cards?: number
  images?: number
  error?: string
}

const STEP: Partial<Record<JobStatus, string>> = { opening: 'Abriendo…', saving: 'Guardando…' }

export function JobCard({ job, onChoose }: { job: Job; onChoose: (mode: 'merge' | 'replace') => void }) {
  const step = STEP[job.status]
  return (
    <li className={`panel job job--${job.status}`}>
      <div className="job__row">
        {job.status === 'done' && (
          <span className="job__diamond job__diamond--ok">
            <Icon name="check" size={13} />
          </span>
        )}
        {job.status === 'error' && (
          <span className="job__diamond job__diamond--err">
            <Icon name="close" size={13} />
          </span>
        )}
        <span className="job__text">
          <span className="job__name">{job.fileName}</span>
          {job.status === 'done' && (
            <span className="job__detail">
              {plural(job.cards ?? 0, 'carta', 'cartas')} · {plural(job.images ?? 0, 'imagen', 'imágenes')} · ¡listo!
            </span>
          )}
          {job.status === 'error' && <span className="job__detail job__detail--err">{job.error}</span>}
          {step && <span className="job__detail">{step}</span>}
        </span>
      </div>
      {step && <span className="job__bar" role="progressbar" aria-label={`${step} ${job.fileName}`} />}
      {job.status === 'ask' && (
        <div className="job__ask">
          <p className="job__detail">
            Ya tienes el mazo «{job.existingName}».{' '}
            {job.deckName !== job.existingName && <>Este sobre lo llama «{job.deckName}». </>}
            ¿Qué hacemos con {plural(job.cards ?? 0, 'carta', 'cartas')}?
          </p>
          <div className="job__choices">
            <FacetButton size="s" highlight onClick={() => onChoose('merge')}>
              Combinar y conservar progreso
            </FacetButton>
            <FacetButton size="s" variant="dark" onClick={() => onChoose('replace')}>
              Reemplazar
            </FacetButton>
          </div>
        </div>
      )}
    </li>
  )
}
