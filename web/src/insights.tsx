import type { ReactNode } from 'react'
import type { TeamWindow } from './types'

export const MIN_SERIES = 3 // a spend/save claim needs at least this many series with the champion

export interface Insight {
  text: ReactNode
  evidence: string
}

/** Plain-language findings, each with the sample it rests on. */
export function insights(w: TeamWindow): Insight[] {
  const out: Insight[] = []
  const games = w.games
  const combos = Object.entries(w.side_vs_pick).sort((a, b) => b[1] - a[1])
  if (combos.length) {
    const [combo, n] = combos[0]
    const [side, pick] = combo.split('-')
    out.push({
      text: (
        <>
          Most often plays <b>{side} side</b> with <b>{pick} pick</b>
        </>
      ),
      evidence: `${n} of ${games} games`,
    })
  }
  const fpGames = Object.values(w.by_game_number).reduce((s, g) => s + g.first_pick, 0)
  if (w.first_pick_f1.length && fpGames) {
    const [champ, n] = w.first_pick_f1[0]
    out.push({ text: <>With first pick, takes <b>{champ}</b> first</>, evidence: `${n} of ${fpGames} first-pick games` })
  }
  const solid = w.spend_save.filter((s) => s.series >= MIN_SERIES)
  // Rank by how many series back the claim, not by the share alone: 7 of 10 beats 3 of 3.
  const lateUses = (s: TeamWindow['spend_save'][number]) =>
    Object.entries(s.by_game)
      .filter(([n]) => Number(n) >= 3)
      .reduce((a, [, v]) => a + v, 0)
  const spend = solid
    .filter((s) => s.g1_share >= 0.5)
    .sort((a, b) => (b.by_game['1'] ?? 0) - (a.by_game['1'] ?? 0) || b.g1_share - a.g1_share)[0]
  if (spend) {
    out.push({
      text: <>Spends <b>{spend.champ}</b> in game 1</>,
      evidence: `${spend.by_game['1'] ?? 0} of ${spend.series} series where it was played`,
    })
  }
  const save = solid
    .filter((s) => s.late_share >= 0.5)
    .sort((a, b) => lateUses(b) - lateUses(a) || b.late_share - a.late_share)[0]
  if (save) {
    out.push({ text: <>Saves <b>{save.champ}</b> for game 3+</>, evidence: `${lateUses(save)} of ${save.series} series` })
  }
  const g1 = w.by_game_number['1']
  if (g1?.banned_against.length) {
    const [champ, n] = g1.banned_against[0]
    out.push({ text: <>Opponents ban <b>{champ}</b> against them in game 1</>, evidence: `${n} of ${g1.games} games` })
  }
  const late = w.players
    .map((p) => {
      const [off, of] = Object.entries(p.offpool_by_game)
        .filter(([n]) => Number(n) >= 3)
        .reduce(([a, b], [, [x, y]]) => [a + x, b + y], [0, 0])
      return { p, off, of }
    })
    .filter((x) => x.of >= 3)
    .sort((a, b) => b.off / b.of - a.off / a.of)[0]
  if (late && late.off > 0) {
    out.push({
      text: (
        <>
          <b>{late.p.name.trim()}</b> ({late.p.role}) leaves the top-5 pool most often in game 3+
        </>
      ),
      evidence: `${late.off} of ${late.of} late games`,
    })
  }
  return out
}
