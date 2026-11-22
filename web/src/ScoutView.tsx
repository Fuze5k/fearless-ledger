import { pct } from './fearless'
import { insights, MIN_SERIES } from './insights'
import type { Counted, TeamWindow } from './types'
import { fmtDate, record } from './shared'
import { Card, ChampCount } from './ui'

const GAME_NUMBERS = ['1', '2', '3', '4', '5']
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
