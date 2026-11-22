import { useEffect, useState } from 'react'
import type { DataIndex, TeamProfile } from './types'

// A local build (etl/aggregate.py --with-series-log) writes data-local/ with each team's series log.
// The hosted demo only has data/ (aggregates). Prefer the local one when it exists.
let basePromise: Promise<string> | null = null

function dataBase(): Promise<string> {
  basePromise ??= fetch(`${import.meta.env.BASE_URL}data-local/index.json`, { method: 'HEAD' })
    .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? 'data-local' : 'data'))
    .catch(() => 'data')
  return basePromise
}

async function getJson<T>(path: string): Promise<T> {
  const base = await dataBase()
  const res = await fetch(`${import.meta.env.BASE_URL}${base}/${path}`)
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return (await res.json()) as T
}

const teamCache = new Map<string, Promise<TeamProfile>>()

export function loadTeam(id: string): Promise<TeamProfile> {
  let p = teamCache.get(id)
  if (!p) {
    p = getJson<TeamProfile>(`teams/${id}.json`)
    teamCache.set(id, p)
  }
  return p
}

export type Loadable<T> = { state: 'loading' } | { state: 'error'; error: string } | { state: 'ready'; value: T }

export function useIndex(): Loadable<DataIndex> {
  const [v, setV] = useState<Loadable<DataIndex>>({ state: 'loading' })
  useEffect(() => {
    getJson<DataIndex>('index.json').then(
      (value) => setV({ state: 'ready', value }),
      (e: unknown) => setV({ state: 'error', error: String(e) }),
    )
  }, [])
  return v
}

export function useTeam(id: string | null): Loadable<TeamProfile> | null {
  const [v, setV] = useState<Loadable<TeamProfile> | null>(null)
  useEffect(() => {
    if (!id) {
      setV(null)
      return
    }
    let live = true
    setV({ state: 'loading' })
    loadTeam(id).then(
      (value) => live && setV({ state: 'ready', value }),
      (e: unknown) => live && setV({ state: 'error', error: String(e) }),
    )
    return () => {
      live = false
    }
  }, [id])
  return v
}
