import { useEffect, useState } from 'react'

export type RouteName = 'home' | 'review' | 'settings' | 'import' | 'editor'
export interface Route {
  name: RouteName
  params: Record<string, string>
}

const NAMES: RouteName[] = ['home', 'review', 'settings', 'import', 'editor']

// Hash routing: works from any static host path and offline without server rewrites.
export function parseRoute(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?')
  const name = (path === '' ? 'home' : path) as RouteName
  if (!NAMES.includes(name)) return { name: 'home', params: {} }
  return { name, params: Object.fromEntries(new URLSearchParams(query)) }
}

export function href(name: RouteName, params: Record<string, string> = {}): string {
  const q = new URLSearchParams(params).toString()
  return `#/${name === 'home' ? '' : name}${q ? `?${q}` : ''}`
}

export function go(name: RouteName, params?: Record<string, string>): void {
  window.location.hash = href(name, params)
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
