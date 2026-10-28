/** Saves a blob through the browser's download flow (desktop) or share sheet fallback. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** File-system safe slug for exported file names; keeps Japanese characters. */
export function fileSlug(name: string): string {
  return name.trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s*·\s*/g, '-').replace(/\s+/g, '-') || 'mazo'
}
