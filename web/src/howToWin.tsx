import type { ReactNode } from 'react'
import { MIN_GAMES, pct, wl, Z_SHOW, zScore } from './fearless'
import type { ChampResult, TeamWindow } from './types'

// "How to win" levers: where the team's results move away from its own average. Every lever carries its
// record and sample; it is a pointer for prep, not a cause (a champion's record includes the rest of those games).

const Z_STRONG = 2
const STRONG_MIN_GAMES = 8 // a "strong" tag needs both the distance and enough games

export type LeverKind = 'deny' | 'allow' | 'punish' | 'avoid' | 'side' | 'order' | 'series'

export interface Lever {
  kind: LeverKind
  text: ReactNode
  evidence: string
  strong: boolean
}

/** Standard score of the difference of two win rates (pooled). */
function zDiff([n1, w1]: [number, number], [n2, w2]: [number, number]): number {
  if (!n1 || !n2) return 0
  const p = (w1 + w2) / (n1 + n2)
  if (p <= 0 || p >= 1) return 0
  return (w1 / n1 - w2 / n2) / Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2))
}

function scored(rows: ChampResult[], base: number, minGames = MIN_GAMES) {
  return rows.filter((r) => r.games >= minGames).map((r) => ({ ...r, z: zScore(r.games, r.wins, base) }))
}

/** Levers against this team, or (self) the ones an opponent would find against us. */
export function howToWin(w: TeamWindow, subject: 'opponent' | 'self'): Lever[] {
  if (!w.games) return []
  const base = w.games_won / w.games
  const avg = `${subject === 'opponent' ? 'their' : 'our'} average ${pct(base)}`
  const they = subject === 'opponent' ? 'they' : 'we'
  const them = subject === 'opponent' ? 'them' : 'us'
  const out: Lever[] = []
  const lever = (kind: LeverKind, z: number, text: ReactNode, evidence: string, games: number) =>
    out.push({ kind, text, evidence, strong: games >= STRONG_MIN_GAMES && Math.abs(z) >= Z_STRONG })

  const withChamp = scored(w.results_with, base)
  for (const r of withChamp.filter((r) => r.z >= Z_SHOW).sort((a, b) => b.z - a.z).slice(0, 3)) {
    lever(
      'deny',
      r.z,
      subject === 'opponent' ? <>Take <b>{r.champ}</b> away: they are {wl(r.games, r.wins)} with it</> : <>Opponents should take <b>{r.champ}</b> from us: we are {wl(r.games, r.wins)} with it</>,
      `${r.games} games, ${avg}`,
      r.games,
    )
  }
  for (const r of withChamp.filter((r) => r.z <= -Z_SHOW && r.games >= MIN_GAMES + 1).sort((a, b) => a.z - b.z).slice(0, 2)) {
    lever(
      'allow',
      r.z,
      subject === 'opponent' ? <>Leave <b>{r.champ}</b> open: they are {wl(r.games, r.wins)} on it</> : <><b>{r.champ}</b> is a trap for us: {wl(r.games, r.wins)}</>,
      `${r.games} games, ${avg}`,
      r.games,
    )
  }
  const against = scored(w.results_against, base)
  for (const r of against.filter((r) => r.z <= -Z_SHOW).sort((a, b) => a.z - b.z).slice(0, 3)) {
    lever('punish', r.z, subject === 'opponent' ? <>Draft <b>{r.champ}</b>: they are {wl(r.games, r.wins)} against it</> : <>Opponents do well with <b>{r.champ}</b> against us: we are {wl(r.games, r.wins)}</>, `${r.games} games, ${avg}`, r.games)
  }
  for (const r of against.filter((r) => r.z >= Z_SHOW * 1.5).sort((a, b) => b.z - a.z).slice(0, 2)) {
    lever('avoid', r.z, subject === 'opponent' ? <>Think twice about <b>{r.champ}</b>: they are {wl(r.games, r.wins)} against it</> : <>We handle <b>{r.champ}</b> well: {wl(r.games, r.wins)} against it</>, `${r.games} games, ${avg}`, r.games)
  }

  const { blue, red, first_pick: fp, second_pick: sp } = w.results_by
  const sideZ = zDiff(blue, red)
  if (blue[0] >= 5 && red[0] >= 5 && Math.abs(sideZ) >= Z_SHOW) {
    const worse = sideZ > 0 ? 'red' : 'blue'
    lever(
      'side',
      sideZ,
      <>With side choice, put {them} on <b>{worse}</b> side</>,
      `blue ${wl(blue[0], blue[1])}, red ${wl(red[0], red[1])}`,
      Math.min(blue[0], red[0]),
    )
  }
  const orderZ = zDiff(fp, sp)
  if (fp[0] >= 5 && sp[0] >= 5 && Math.abs(orderZ) >= Z_SHOW) {
    const worse = orderZ > 0 ? 'second' : 'first'
    lever(
      'order',
      orderZ,
      <>{subject === 'opponent' ? 'They do worse' : 'We do worse'} with <b>{worse} pick</b></>,
      `first pick ${wl(fp[0], fp[1])}, second pick ${wl(sp[0], sp[1])}`,
      Math.min(fp[0], sp[0]),
    )
  }
  const [lost, comeback] = w.after_g1.lost_g1
  const [won, closed] = w.after_g1.won_g1
  if (lost >= 3) {
    const rate = comeback / lost
    lever(
      'series',
      0,
      <>{rate <= 0.25 ? 'Win game 1: a' : 'A'}fter losing game 1, {they} took the series {comeback} of {lost} times</>,
      won ? `after winning game 1: ${closed} of ${won}` : `no series where ${they} won game 1`,
      0,
    )
  }
  return out
}
