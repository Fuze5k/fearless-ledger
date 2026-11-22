// Fearless series logic: what is locked, what each player has left, what a pick denies.
// Pure functions over the aggregate JSON and the coach's plan; no IO.
import { ROLES, type ChampionMeta, type Counted, type PlayerPool, type Role, type TeamWindow } from './types'

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
  live?: LiveDraft // absent in plans saved before live mode existed
}

/** A draft logged action by action during a real game. `target` is the lineup role or ban slot it filled. */
export interface LiveDraft {
  weFirst: boolean
  actions: { champ: string; target: Role | number }[]
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

// ---- Live draft -------------------------------------------------------------------------------------------

/** Tournament draft order: F = the team with first selection, S = the other one. */
const ORDER: { type: 'ban' | 'pick'; first: boolean }[] = [
  ...[true, false, true, false, true, false].map((first) => ({ type: 'ban' as const, first })),
  ...[true, false, false, true, true, false].map((first) => ({ type: 'pick' as const, first })),
  ...[false, true, false, true].map((first) => ({ type: 'ban' as const, first })),
  ...[false, true, true, false].map((first) => ({ type: 'pick' as const, first })),
]
export const DRAFT_STEPS = ORDER.length

export interface Step {
  seq: number
  type: 'ban' | 'pick'
  us: boolean
}

export const stepAt = (i: number, weFirst: boolean): Step => ({ seq: i + 1, type: ORDER[i].type, us: ORDER[i].first === weFirst })

const openRoles = (l: Lineup) => ROLES.filter((r) => !l[r])

/** Champions no longer available in this game: locked by Fearless or already picked or banned in it. */
export function takenIn(plan: SeriesPlan, index: number): Set<string> {
  const g = plan.games[index]
  return new Set(
    [...lockedBefore(plan, index).keys(), ...picksOf(g), ...g.usBans, ...g.themBans].filter(Boolean),
  )
}

/** Log the next draft action. A pick goes to the open role the champion is played in most often. */
export function applyLive(g: PlannedGame, champ: string, meta: Record<string, ChampionMeta>): PlannedGame | string {
  const live = g.live
  if (!live) return 'live draft not started'
  if (live.actions.length >= DRAFT_STEPS) return 'draft is complete'
  const step = stepAt(live.actions.length, live.weFirst)
  if (step.type === 'pick') {
    const team = step.us ? 'us' : 'them'
    const open = openRoles(g[team])
    if (!open.length) return 'all five roles are already filled'
    const roles = meta[champ]?.roles ?? {}
    const role = open.reduce((best, r) => ((roles[r] ?? 0) > (roles[best] ?? 0) ? r : best), open[0])
    return {
      ...g,
      [team]: { ...g[team], [role]: champ },
      live: { ...live, actions: [...live.actions, { champ, target: role }] },
    }
  }
  const key = step.us ? 'usBans' : 'themBans'
  const slot = g[key].findIndex((b) => !b)
  if (slot < 0) return 'all ban slots are already filled'
  return {
    ...g,
    [key]: g[key].map((b, i) => (i === slot ? champ : b)),
    live: { ...live, actions: [...live.actions, { champ, target: slot }] },
  }
}

/** Remove the last logged action and clear the slot it filled (if the coach has not changed that slot since). */
export function undoLive(g: PlannedGame): PlannedGame {
  const live = g.live
  if (!live?.actions.length) return g
  const last = live.actions[live.actions.length - 1]
  const step = stepAt(live.actions.length - 1, live.weFirst)
  const rest = { ...live, actions: live.actions.slice(0, -1) }
  if (typeof last.target === 'number') {
    const key = step.us ? 'usBans' : 'themBans'
    return { ...g, [key]: g[key].map((b, i) => (i === last.target && b === last.champ ? '' : b)), live: rest }
  }
  const team = step.us ? 'us' : 'them'
  const role = last.target
  return { ...g, [team]: g[team][role] === last.champ ? { ...g[team], [role]: '' } : g[team], live: rest }
}

export interface Suggestion {
  champ: string
  score: number
  why: string[]
}

/**
 * Options for the next draft action, each with the evidence behind it. They highlight; the coach decides.
 * - their pick / our ban: what their players in still-open roles play, plus what they pick at this game number;
 * - their ban: what they usually ban at this game number;
 * - our pick: our open-role players' comfort plus, when games remain, how much the pick denies them later.
 */
export function suggest(
  step: Step,
  g: PlannedGame,
  n: number,
  gamesLeftAfter: number,
  taken: Set<string>,
  us: TeamWindow,
  them: TeamWindow,
  top = 8,
): Suggestion[] {
  const out = new Map<string, Suggestion>()
  const add = (champ: string, score: number, why: string) => {
    const s = out.get(champ) ?? { champ, score: 0, why: [] }
    s.score += score
    s.why.push(why)
    out.set(champ, s)
  }
  const atN = them.by_game_number[String(n)]
  if (step.type === 'ban' && !step.us) {
    for (const e of expectedAt(them, n, 'bans', taken, top)) add(e.champ, e.count / e.of, `G${n} ban ${e.count}/${e.of}`)
  } else if (!step.us || step.type === 'ban') {
    const open = new Set(openRoles(g.them))
    for (const p of them.players) {
      if (!open.has(p.role) || !p.games) continue
      for (const c of p.champs) {
        if (!taken.has(c.champ)) add(c.champ, c.games / p.games, `${p.name.trim()} ${c.games}/${p.games}`)
      }
    }
    for (const [c, k] of atN?.picks ?? []) {
      if (out.has(c)) add(c, (0.5 * k) / atN.games, `G${n} pick ${k}/${atN.games}`)
    }
  } else {
    const open = new Set(openRoles(g.us))
    for (const p of us.players) {
      if (!open.has(p.role) || !p.games) continue
      for (const c of p.champs) {
        if (!taken.has(c.champ)) add(c.champ, c.games / p.games, `${p.name.trim()} ${c.games}/${p.games}`)
      }
    }
    if (gamesLeftAfter > 0) {
      for (const d of denialTable(them.players, [], taken)) {
        if (out.has(d.champ)) add(d.champ, 0.5 * d.denial, `denies ${pct(d.denial)} of their pools`)
      }
    }
  }
  return [...out.values()].sort((a, b) => b.score - a.score).slice(0, top)
}
