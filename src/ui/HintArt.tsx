import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../app/AppContext'
import { Sparkle } from './index'

/** The card's art window content: the hint image if the card has one, otherwise the deck glyph. */
/**
 * `fill` scales the image to the whole window instead of capping it at `size`; `onRatio` reports width / height
 * once loaded, and `onFail` fires when the media row is missing or the image can't be decoded.
 */
export function HintArt({
  imageId,
  fallbackGlyph,
  label = 'Pista visual',
  size = '70%',
  fill = false,
  onRatio,
  onFail,
}: {
  imageId?: string
  fallbackGlyph: string
  label?: string
  size?: string
  fill?: boolean
  onRatio?: (ratio: number) => void
  onFail?: () => void
}) {
  const { db } = useApp()
  // null = no such media row (undefined while the query is still loading).
  const media = useLiveQuery(async () => (imageId ? ((await db.media.get(imageId)) ?? null) : undefined), [db, imageId])
  const [url, setUrl] = useState<string>()

  useEffect(() => {
    if (media === null) onFail?.()
  }, [media, onFail])

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
              onError={onFail}
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
