import type { ReactNode } from 'react'
import { pct } from './fearless'
import type { Counted, TeamWindow } from './types'
import { fmtDate, record } from './shared'
import { Card, ChampCount } from './ui'

const GAME_NUMBERS = ['1', '2', '3', '4', '5']
const MIN_SERIES = 3 // a spend/save claim needs at least this many series with the champion

interface Insight {
  text: ReactNode
  evidence: string
}

/** Plain-language findings, each with the sample it rests on. */
function insights(w: TeamWindow): Insight[] {
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

function CountList({ items, of, n = 5 }: { items: Counted; of?: number; n?: number }) {
  if (!items.length) return <p className="empty">none</p>
  return (
    <ul className="count-list">
      {items.slice(0, n).map(([c, k]) => (
        <li key={c}>
          <ChampCount name={c} count={k} of={of} />
        </li>
      ))}
    </ul>
  )
}

export function ScoutView({ w, name, subject }: { w: TeamWindow; name: string; subject: 'opponent' | 'self' }) {
  const fpGames = Object.values(w.by_game_number).reduce((s, g) => s + g.first_pick, 0)
  const spend = w.spend_save.filter((s) => s.series >= MIN_SERIES && s.g1_share >= 0.5).slice(0, 8)
  const save = w.spend_save
    .filter((s) => s.series >= MIN_SERIES && s.late_share >= 0.4)
    .sort((a, b) => b.late_share - a.late_share)
    .slice(0, 8)
  return (
    <div className="scout">
      <div className="summary">
        <h2>
          {subject === 'self' ? 'Self-scout: ' : ''}
          {name}
        </h2>
        <p>
          {w.series} series ({record(w.series_won, w.series)}), {w.games} games ({record(w.games_won, w.games)}),{' '}
          {fmtDate(w.from)} - {fmtDate(w.to)} · {w.events.join(', ')}
        </p>
        {subject === 'self' && <p className="hint">What an opponent's analyst sees when they scout you.</p>}
      </div>

      <Card title="Key tendencies" hint="Each line shows the sample it rests on.">
        <ul className="insights">
          {insights(w).map((i, k) => (
            <li key={k}>
              <span>{i.text}</span>
              <span className="evidence">{i.evidence}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Draft by game number" hint="What they spend early and what shows up only as the series goes on.">
        <div className="gn-grid">
          {GAME_NUMBERS.map((n) => {
            const g = w.by_game_number[n]
            if (!g || !g.games)
              return (
                <div className="gn-col" key={n}>
                  <h4>Game {n}</h4>
                  <p className="empty">no games</p>
                </div>
              )
            return (
              <div className="gn-col" key={n}>
                <h4>Game {n}</h4>
                <p className="gn-meta">
                  {g.games} games · won {g.wins} · blue {pct(g.blue / g.games)} · first pick {pct(g.first_pick / g.games)}
                </p>
                <h5>Their picks</h5>
                <CountList items={g.picks} of={g.games} />
                <h5>Their bans</h5>
                <CountList items={g.bans} of={g.games} />
                <h5>Banned against them</h5>
                <CountList items={g.banned_against} of={g.games} n={3} />
              </div>
            )
          })}
        </div>
      </Card>

      <div className="two-col">
        <Card title="Spent in game 1" hint={`Champions in ${MIN_SERIES}+ series, first used in game 1 at least half the time.`}>
          <ul className="count-list">
            {spend.map((s) => (
              <li key={s.champ}>
                <ChampCount name={s.champ} count={s.by_game['1'] ?? 0} of={s.series} note="series where game 1 was its first use" />
              </li>
            ))}
            {!spend.length && <p className="empty">no clear game-1 spends</p>}
          </ul>
        </Card>
        <Card title="Saved for later games" hint="First used in game 2 or later; the share in game 3+ is shown.">
          <ul className="count-list">
            {save.map((s) => (
              <li key={s.champ}>
                <ChampCount
                  name={s.champ}
                  count={Object.entries(s.by_game)
                    .filter(([n]) => Number(n) >= 3)
                    .reduce((a, [, v]) => a + v, 0)}
                  of={s.series}
                  note="series where its first use was game 3 or later"
                />
              </li>
            ))}
            {!save.length && <p className="empty">nothing held back for game 3+</p>}
          </ul>
        </Card>
      </div>

      <div className="two-col">
        <Card title="First pick (F1)" hint={`${fpGames} games where they had first selection.`}>
          <CountList items={w.first_pick_f1} of={fpGames} n={6} />
        </Card>
        <Card title="Phase-1 bans" hint="Bans 1-6, split by whether they had first selection.">
          <div className="two-col tight">
            <div>
              <h5>With first pick</h5>
              <CountList items={w.phase1_bans.first} n={6} />
            </div>
            <div>
              <h5>With second pick</h5>
              <CountList items={w.phase1_bans.second} n={6} />
            </div>
          </div>
        </Card>
      </div>

      <Card title="Player pools" hint="Latest lineup. Depth = champions played 2+ times. Off-pool = games outside the player's top 5, by game number.">
        <div className="pools">
          {w.players.map((p) => (
            <div className="pool" key={p.id}>
              <h4>
                <span className="role">{p.role}</span> {p.name.trim()}
              </h4>
              <p className="gn-meta">
                {p.games} games · {p.unique} champions · depth {p.depth}
              </p>
              <ul className="count-list">
                {p.champs.slice(0, 7).map((c) => (
                  <li key={c.champ}>
                    <ChampCount name={c.champ} count={c.games} note={`won ${c.wins} of ${c.games}`} />
                    <span className="wr">{pct(c.wins / c.games)}</span>
                  </li>
                ))}
              </ul>
              <div className="offpool">
                {GAME_NUMBERS.map((n) => {
                  const v = p.offpool_by_game[n]
                  return (
                    <span key={n} className={v && v[0] / v[1] >= 0.5 ? 'hot' : ''} title={v ? `game ${n}: ${v[0]} of ${v[1]} off top 5` : `no game ${n}`}>
                      G{n} {v ? `${v[0]}/${v[1]}` : '-'}
                    </span>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
