import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../../app/AppContext'

/** Object URL for a blob, revoked when the blob changes or the component unmounts. */
export function useBlobUrl(blob?: Blob): string | undefined {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) {
      setUrl(undefined)
      return
    }
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

/** Object URL for a stored hint image. */
export function useMediaUrl(imageId?: string): string | undefined {
  const { db } = useApp()
  const media = useLiveQuery(() => (imageId ? db.media.get(imageId) : undefined), [db, imageId])
  const [blob, setBlob] = useState<Blob>()
  useEffect(() => setBlob(media ? new Blob([media.data], { type: media.type }) : undefined), [media])
  return useBlobUrl(blob)
}
