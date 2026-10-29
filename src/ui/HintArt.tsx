import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../app/AppContext'
import { Sparkle } from './index'

/** The card's art window content: the hint image if the card has one, otherwise the deck glyph. */
/** `fill` scales the image to the whole window instead of capping it at `size`; `onRatio` reports width / height once loaded. */
export function HintArt({
  imageId,
  fallbackGlyph,
  label = 'Pista visual',
  size = '70%',
  fill = false,
  onRatio,
}: {
  imageId?: string
  fallbackGlyph: string
  label?: string
  size?: string
  fill?: boolean
  onRatio?: (ratio: number) => void
}) {
  const { db } = useApp()
  const media = useLiveQuery(() => (imageId ? db.media.get(imageId) : undefined), [db, imageId])
  const [url, setUrl] = useState<string>()

  useEffect(() => {
    if (!media) {
      setUrl(undefined)
      return
    }
    const u = URL.createObjectURL(new Blob([media.data], { type: media.type }))
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [media])

  return (
    <div className="hint-art">
      {url ? (
        <>
          <span className="hint-art__chip chrome">{label}</span>
          {fill ? (
            <img
              src={url}
              alt={label}
              className="hint-art__img--fill"
              onLoad={(e) => {
                const { naturalWidth: w, naturalHeight: h } = e.currentTarget
                if (w && h) onRatio?.(w / h)
              }}
            />
          ) : (
            <img src={url} alt={label} style={{ maxWidth: size, maxHeight: size }} />
          )}
        </>
      ) : (
        <span className="hint-art__glyph mincho" lang="ja" aria-hidden="true">
          {fallbackGlyph}
        </span>
      )}
      <span className="hint-art__spark hint-art__spark--a">
        <Sparkle size={16} color="var(--gold-pale)" />
      </span>
      <span className="hint-art__spark hint-art__spark--b">
        <Sparkle size={11} color="var(--gold-pale)" />
      </span>
    </div>
  )
}
