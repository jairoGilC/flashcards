import initSqlJs, { type SqlJsStatic } from 'sql.js'
// Bundled locally (and precached by the service worker) so .apkg import works offline.
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

let loading: Promise<SqlJsStatic> | undefined

export function loadSqlJs(): Promise<SqlJsStatic> {
  loading ??= initSqlJs({ locateFile: () => wasmUrl })
  return loading
}
