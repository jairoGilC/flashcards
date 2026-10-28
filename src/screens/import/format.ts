export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  if (mb >= 1) return `${Math.round(mb)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export function today(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}
