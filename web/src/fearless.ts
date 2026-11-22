// Fearless series logic: what is locked, what each player has left, what a pick denies.
// Pure functions over the aggregate JSON and the coach's plan; no IO.
import { ROLES, type Counted, type PlayerPool, type Role, type TeamWindow } from './types'

export type Side = 'blue' | 'red'
export type Lineup = Record<Role, string>

export interface PlannedGame {
  side: Side | null
  us: Lineup
  them: Lineup
  usBans: string[]
  themBans: string[]
  played: boolean
  won: boolean | null
  note: string
}

export interface SeriesPlan {
  format: 3 | 5
  games: PlannedGame[]
}

export const emptyLineup = (): Lineup => ({ TOP: '', JNG: '', MID: '', BOT: '', SUP: '' })

export const emptyGame = (): PlannedGame => ({
  side: null,
  us: emptyLineup(),
  them: emptyLineup(),
  usBans: ['', '', '', '', ''],
  themBans: ['', '', '', '', ''],
  played: false,
  won: null,
  note: '',
})

export const emptyPlan = (): SeriesPlan => ({ format: 5, games: Array.from({ length: 5 }, emptyGame) })

const picksOf = (g: PlannedGame): string[] => [...ROLES.map((r) => g.us[r]), ...ROLES.map((r) => g.them[r])].filter(Boolean)

/** Champions picked by either team in games before `index` (0-based). Bans never lock under Fearless. */
export function lockedBefore(plan: SeriesPlan, index: number): Map<string, number> {
  const locked = new Map<string, number>()
  plan.games.slice(0, index).forEach((g, i) => {
    for (const c of picksOf(g)) if (!locked.has(c)) locked.set(c, i + 1)
  })
  return locked
}

export interface Conflict {
  champ: string
  reason: string
}

/** Picks in game `index` that Fearless forbids (picked earlier) or that appear twice in the same game. */
export function conflicts(plan: SeriesPlan, index: number): Map<string, Conflict> {
  const locked = lockedBefore(plan, index)
  const out = new Map<string, Conflict>()
  const seen = new Set<string>()
  for (const c of picksOf(plan.games[index])) {
    const from = locked.get(c)
    if (from) out.set(c, { champ: c, reason: `already picked in game ${from}` })
    else if (seen.has(c)) out.set(c, { champ: c, reason: 'picked twice in this game' })
    seen.add(c)
  }
  const bans = [...plan.games[index].usBans, ...plan.games[index].themBans].filter(Boolean)
  for (const c of bans) {
    if (locked.has(c)) out.set(`ban:${c}`, { champ: c, reason: `ban wasted: locked since game ${locked.get(c)}` })
  }
  return out
}

/** A player's share of their games on each champion: the comfort a Fearless lock takes away. */
export function comfort(p: PlayerPool): Map<string, number> {
  return new Map(p.champs.map((c) => [c.champ, p.games ? c.games / p.games : 0]))
}

export interface Remaining {
  player: PlayerPool
  left: { champ: string; games: number; wins: number }[]
  lockedShare: number // share of the player's games on champions that are now locked
}

/** What each player still has after the locked set, best-played first. */
export function remainingPools(players: PlayerPool[], locked: Set<string>, top = 6): Remaining[] {
  return players.map((p) => {
    const share = comfort(p)
    let lockedShare = 0
    for (const c of locked) lockedShare += share.get(c) ?? 0
    return {
      player: p,
      left: p.champs.filter((c) => !locked.has(c.champ)).slice(0, top),
      lockedShare,
    }
  })
}

export interface DenialRow {
  champ: string
  denial: number // sum over opponent players of their comfort share on the champion
  cost: number // the same for our players: what picking it ourselves uses up for later games
  theirs: { name: string; role: Role; games: number; of: number }[]
  ours: { name: string; role: Role; games: number; of: number }[]
}

/**
 * Denial value of every champion still available: picking it (by either team) removes it for the rest of the
 * series, so it takes away this much of the opponent's comfort and costs this much of ours.
 */
export function denialTable(them: PlayerPool[], us: PlayerPool[], locked: Set<string>): DenialRow[] {
  const rows = new Map<string, DenialRow>()
  const row = (champ: string) => {
    let r = rows.get(champ)
    if (!r) {
      r = { champ, denial: 0, cost: 0, theirs: [], ours: [] }
      rows.set(champ, r)
    }
    return r
  }
  for (const [players, key, list] of [
    [them, 'denial', 'theirs'],
    [us, 'cost', 'ours'],
  ] as const) {
    for (const p of players) {
      for (const c of p.champs) {
        if (locked.has(c.champ) || !p.games) continue
        const r = row(c.champ)
        r[key] += c.games / p.games
        r[list].push({ name: p.name, role: p.role, games: c.games, of: p.games })
      }
    }
  }
  return [...rows.values()].filter((r) => r.denial > 0).sort((a, b) => b.denial - a.denial || a.cost - b.cost)
}

export interface Expected {
  champ: string
  count: number
  of: number
}

/** What the opponent picked (or banned) in game `n` historically, minus what is locked now. */
export function expectedAt(w: TeamWindow, n: number, kind: 'picks' | 'bans', locked: Set<string>, top = 8): Expected[] {
  const g = w.by_game_number[String(n)]
  if (!g) return []
  return g[kind]
    .filter(([c]) => !locked.has(c))
    .slice(0, top)
    .map(([champ, count]) => ({ champ, count, of: g.games }))
}

export const topN = (c: Counted, n: number) => c.slice(0, n)

export const pct = (x: number) => `${Math.round(x * 100)}%`
