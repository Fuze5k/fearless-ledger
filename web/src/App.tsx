import { useEffect, useMemo, useState } from 'react'
import { useIndex, useTeam, type Loadable } from './data'
import { useIcons } from './ddragon'
import { Planner } from './Planner'
import { ScoutView } from './ScoutView'
import { SeriesLog } from './SeriesLog'
import { SeriesSheet } from './SeriesSheet'
import type { ChampionMeta, DataIndex, TeamProfile, WindowKey } from './types'
import { IconContext } from './shared'

const DEFAULT_US = 'Cloud9 Kia'
const MIN_TEAM_SERIES = 5 // fewer series than this is not enough to scout
type Tab = 'scout' | 'plan' | 'sheet' | 'self' | 'log'
const PREFS = 'fearless-ledger:prefs'

interface Prefs {
  us: string | null
  them: string | null
  win: WindowKey
  tab: Tab
}

function readPrefs(): Partial<Prefs> {
  try {
    return JSON.parse(localStorage.getItem(PREFS) ?? '{}') as Partial<Prefs>
  } catch {
    return {} // no stored prefs or storage blocked: start from the defaults
  }
}

function Shell({ index }: { index: DataIndex }) {
  const stored = useMemo(readPrefs, [])
  const known = (id: string | null | undefined) => (id && index.teams.some((t) => t.id === id) ? id : null)
  const c9 = index.teams.find((t) => t.name === DEFAULT_US)?.id ?? index.teams[0].id
  const [us, setUs] = useState<string>(known(stored.us) ?? c9)
  const [them, setThem] = useState<string | null>(known(stored.them))
  const [win, setWin] = useState<WindowKey>(stored.win ?? 'recent')
  const [tab, setTab] = useState<Tab>(stored.tab ?? 'scout')

  const usTeam = useTeam(us)
  const themTeam = useTeam(them)

  // Default opponent: the team we met most often in the recent window.
  useEffect(() => {
    if (them || usTeam?.state !== 'ready') return
    const id = usTeam.value.windows.recent.opponents[0]?.id
    if (id && index.teams.some((t) => t.id === id)) setThem(id)
  }, [them, usTeam, index.teams])

  useEffect(() => {
    try {
      localStorage.setItem(PREFS, JSON.stringify({ us, them, win, tab }))
    } catch {
      // storage blocked: prefs are a convenience only
    }
  }, [us, them, win, tab])

  const leagues = useMemo(() => {
    const m = new Map<string, DataIndex['teams']>()
    for (const t of [...index.teams].filter((t) => t.series >= MIN_TEAM_SERIES).sort((a, b) => a.name.localeCompare(b.name))) {
      m.set(t.league, [...(m.get(t.league) ?? []), t])
    }
    return [...m.entries()].sort()
  }, [index.teams])
  const champions = useMemo(() => Object.keys(index.champions).sort(), [index.champions])

  const teamSelect = (value: string | null, onChange: (id: string) => void, label: string) => (
    <label>
      {label}{' '}
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {!value && <option value="">choose</option>}
        {leagues.map(([league, teams]) => (
          <optgroup key={league} label={league}>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.series})
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )

  const tabs: [Tab, string][] = [
    ['scout', 'Scout opponent'],
    ['plan', 'Series planner'],
    ['sheet', 'Series sheet'],
    ['self', 'Self-scout'],
  ]
  if (index.local) tabs.push(['log', 'Series drafts'])

  return (
    <>
      <header className="top">
        <div className="brand">
          <h1>Fearless Ledger</h1>
          <p>Fearless series prep for League of Legends coaches</p>
        </div>
        <div className="controls">
          {teamSelect(us, setUs, 'We are')}
          {teamSelect(them, setThem, 'Opponent')}
          <label>
            Window{' '}
            <select value={win} onChange={(e) => setWin(e.target.value as WindowKey)}>
              <option value="recent">last {index.recent_series} series</option>
              <option value="all">all 2025-2026</option>
            </select>
          </label>
        </div>
        <nav>
          {tabs.map(([k, label]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </nav>
      </header>
      <main className={`tab-${tab}`}>
        <Body tab={tab} win={win} windowLabel={win === 'recent' ? `last ${index.recent_series} series` : 'all 2025-2026'} us={usTeam} them={themTeam} champions={champions} meta={index.champions} />
      </main>
      <footer>
        <p>
          Match data: GRID esports data provided for the Cloud9 x JetBrains "Sky's The Limit" hackathon;{' '}
          {index.local ? 'local build with per-series drafts, not for publishing.' : 'this demo shows aggregates only.'}{' '}
          Champion icons: Riot Data Dragon.
        </p>
        <p>
          Fearless Ledger isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone
          officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties
          are trademarks or registered trademarks of Riot Games, Inc.
        </p>
      </footer>
    </>
  )
}

function Body({
  tab,
  win,
  windowLabel,
  us,
  them,
  champions,
  meta,
}: {
  tab: Tab
  win: WindowKey
  windowLabel: string
  us: Loadable<TeamProfile> | null
  them: Loadable<TeamProfile> | null
  champions: string[]
  meta: Record<string, ChampionMeta>
}) {
  const wait = (t: Loadable<TeamProfile> | null, what: string) =>
    !t ? (
      <p className="empty">Choose {what}.</p>
    ) : t.state === 'loading' ? (
      <p className="empty">Loading {what}...</p>
    ) : t.state === 'error' ? (
      <p className="error">Could not load {what}: {t.error}</p>
    ) : null

  if (tab === 'self' || tab === 'log') {
    if (us?.state !== 'ready') return wait(us, 'your team')
    if (tab === 'self') return <ScoutView w={us.value.windows[win]} name={us.value.name} subject="self" />
    const oppId = them?.state === 'ready' ? them.value.id : null
    return <SeriesLog log={us.value.series_log ?? []} opponentId={oppId} teamName={us.value.name} />
  }
  if (them?.state !== 'ready') return wait(them, 'an opponent')
  if (tab === 'scout') return <ScoutView w={them.value.windows[win]} name={them.value.name} subject="opponent" />
  if (us?.state !== 'ready') return wait(us, 'your team')
  if (tab === 'sheet')
    return (
      <SeriesSheet
        us={{ id: us.value.id, name: us.value.name, w: us.value.windows[win] }}
        them={{ id: them.value.id, name: them.value.name, w: them.value.windows[win] }}
        windowLabel={windowLabel}
      />
    )
  return (
    <Planner
      key={`${us.value.id}:${them.value.id}`}
      planKey={`${us.value.id}:${them.value.id}`}
      us={{ name: us.value.name, w: us.value.windows[win] }}
      them={{ name: them.value.name, w: them.value.windows[win] }}
      champions={champions}
      meta={meta}
    />
  )
}

export default function App() {
  const index = useIndex()
  const icons = useIcons()
  if (index.state === 'loading') return <p className="empty">Loading data...</p>
  if (index.state === 'error') return <p className="error">Could not load the data index: {index.error}</p>
  return (
    <IconContext.Provider value={icons}>
      <Shell index={index.value} />
    </IconContext.Provider>
  )
}
