import { uid } from '../db/repo'

/** Target size that fits inside max×max, keeps aspect ratio and never upscales. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

async function decode(file: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      // Some formats (e.g. SVG) only decode through <img>.
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight })
  } finally {
    URL.revokeObjectURL(url)
  }
}

function encode(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.8))
}

/** Shrinks a hint image to max px and re-encodes it small enough to keep in IndexedDB. */
export async function resizeImage(file: Blob, max = 800): Promise<{ blob: Blob; name: string }> {
  const source = await decode(file)
  const { width, height } = fitWithin(source.width, source.height, max)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo procesar la imagen.')
  ctx.drawImage(source, 0, 0, width, height)
  if ('close' in source && typeof source.close === 'function') source.close()

  // Browsers that cannot encode WebP return PNG (or null) instead of failing.
  const webp = await encode(canvas, 'image/webp')
  if (webp?.type === 'image/webp') return { blob: webp, name: `${uid()}.webp` }
  const jpeg = await encode(canvas, 'image/jpeg')
  if (!jpeg) throw new Error('No se pudo procesar la imagen.')
  return { blob: jpeg, name: `${uid()}.jpg` }
}
