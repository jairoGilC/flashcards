import { afterEach, describe, expect, it, vi } from 'vitest'
import { fitWithin, resizeImage } from './resizeImage'

describe('fitWithin', () => {
  it('scales the longest side down to max, keeping aspect ratio', () => {
    expect(fitWithin(1600, 1200, 800)).toEqual({ width: 800, height: 600 })
    expect(fitWithin(1000, 3000, 800)).toEqual({ width: 267, height: 800 })
  })
  it('never upscales', () => {
    expect(fitWithin(400, 300, 800)).toEqual({ width: 400, height: 300 })
    expect(fitWithin(800, 800, 800)).toEqual({ width: 800, height: 800 })
  })
  it('keeps at least one pixel on very thin images', () => {
    expect(fitWithin(10_000, 2, 800)).toEqual({ width: 800, height: 1 })
  })
})

describe('resizeImage', () => {
  afterEach(() => vi.restoreAllMocks())

  function stubCanvas(encode: (type: string) => Blob | null) {
    const drawImage = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 1600, height: 900, close: vi.fn() })))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as never)
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation(function (this: HTMLCanvasElement, cb: BlobCallback, type?: string) {
        cb(encode(type ?? 'image/png'))
      })
    return { drawImage, toBlob }
  }

  it('draws at the fitted size and encodes WebP at 0.8', async () => {
    const { drawImage, toBlob } = stubCanvas((type) => new Blob(['x'], { type }))
    const out = await resizeImage(new Blob(['src'], { type: 'image/png' }))
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 800, 450)
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.8)
    expect(out.blob.type).toBe('image/webp')
    expect(out.name).toMatch(/^[\w-]+\.webp$/)
  })

  it('falls back to JPEG when the browser cannot encode WebP', async () => {
    // Older iOS Safari silently returns PNG for unsupported types.
    stubCanvas((type) => new Blob(['x'], { type: type === 'image/webp' ? 'image/png' : type }))
    const out = await resizeImage(new Blob(['src'], { type: 'image/png' }))
    expect(out.blob.type).toBe('image/jpeg')
    expect(out.name).toMatch(/\.jpg$/)
  })

  it('gives unique names', async () => {
    stubCanvas((type) => new Blob(['x'], { type }))
    const a = await resizeImage(new Blob(['src']))
    const b = await resizeImage(new Blob(['src']))
    expect(a.name).not.toBe(b.name)
  })
})
