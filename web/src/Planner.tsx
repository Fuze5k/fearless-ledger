import { useEffect, useMemo, useState } from 'react'
import {
  conflicts,
  denialTable,
  emptyPlan,
  expectedAt,
  lockedBefore,
  pct,
  remainingPools,
  takenIn,
  type Lineup,
  type PlannedGame,
  type SeriesPlan,
} from './fearless'
import { LiveDraft } from './LiveDraft'
import { loadPlan, savePlan } from './planStore'
import { ROLES, type ChampionMeta, type TeamWindow } from './types'
import { Card, ChampCount, ChampIcon } from './ui'

function ChampInput({
  value,
  onChange,
  champions,
  bad,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  champions: Set<string>
  bad?: string
  placeholder: string
}) {
  const unknown = value !== '' && !champions.has(value)
  return (
    <span className={`champ-input${bad ? ' bad' : ''}${unknown ? ' unknown' : ''}`} title={bad ?? (unknown ? 'not a champion name' : '')}>
      {value && champions.has(value) ? <ChampIcon name={value} size={22} /> : <span className="slot-dot" />}
      <input list="champion-names" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </span>
  )
}

interface Props {
  planKey: string
  us: { name: string; w: TeamWindow }
  them: { name: string; w: TeamWindow }
  champions: string[]
  meta: Record<string, ChampionMeta>
}

export function Planner({ planKey, us, them, champions, meta }: Props) {
  const [plan, setPlan] = useState<SeriesPlan>(() => loadPlan(planKey))
  const [active, setActive] = useState(0)
  const champSet = useMemo(() => new Set(champions), [champions])

  // The parent remounts this component per planKey (key={planKey}), so the initial load is the only load.
  useEffect(() => savePlan(planKey, plan), [planKey, plan])

  const games = plan.games.slice(0, plan.format)
  const game = plan.games[active]
  const locked = lockedBefore(plan, active)
  const bad = conflicts(plan, active)
  // Champions taken in this game are also unavailable for the suggestions below.
  const taken = new Set([...locked.keys(), ...ROLES.map((r) => game.us[r]), ...ROLES.map((r) => game.them[r])].filter(Boolean))
  const unavailable = takenIn(plan, active) // also excludes this game's bans: what the live draft may still log

  const update = (fn: (g: PlannedGame) => PlannedGame) =>
    setPlan((p) => ({ ...p, games: p.games.map((g, i) => (i === active ? fn(g) : g)) }))
  const setPick = (team: 'us' | 'them', role: keyof Lineup, v: string) =>
    update((g) => ({ ...g, [team]: { ...g[team], [role]: v } }))
  const setBan = (team: 'usBans' | 'themBans', i: number, v: string) =>
    update((g) => ({ ...g, [team]: g[team].map((b, k) => (k === i ? v : b)) }))

  const theirLeft = remainingPools(them.w.players, taken)
  const ourLeft = remainingPools(us.w.players, taken)
  const denial = denialTable(them.w.players, us.w.players, taken).slice(0, 12)
  const n = active + 1
  const expPicks = expectedAt(them.w, n, 'picks', unavailable)
  const expBans = expectedAt(them.w, n, 'bans', unavailable)
  const remaining = plan.format - n

  return (
    <div className="planner">
      <datalist id="champion-names">
        {champions.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div className="planner-bar">
        <label>
          Format{' '}
          <select value={plan.format} onChange={(e) => {
              const format = Number(e.target.value) as 3 | 5
              setPlan((p) => ({ ...p, format }))
              setActive((a) => Math.min(a, format - 1))
            }}>
            <option value={3}>Bo3</option>
            <option value={5}>Bo5</option>
          </select>
        </label>
        <div className="game-tabs" role="tablist">
          {games.map((g, i) => {
            const c = conflicts(plan, i).size
            return (
              <button key={i} role="tab" aria-selected={i === active} className={i === active ? 'on' : ''} onClick={() => setActive(i)}>
                Game {i + 1}
                {g.played && <span className="tag">{g.won === null ? 'played' : g.won ? 'W' : 'L'}</span>}
                {c > 0 && <span className="tag bad">{c} conflict{c > 1 ? 's' : ''}</span>}
              </button>
            )
          })}
        </div>
        <button
          className="ghost"
          onClick={() => {
            if (confirm('Clear the whole series plan?')) setPlan(emptyPlan())
          }}
        >
          Clear plan
        </button>
      </div>

      <LiveDraft
        key={active}
        game={game}
        n={active + 1}
        gamesLeftAfter={plan.format - active - 1}
        taken={unavailable}
        us={us}
        them={them}
        meta={meta}
        onChange={(g) => update(() => g)}
      />

      <div className="planner-main">
        <Card title={`Game ${n} plan`} hint="Type or pick a champion. Picks lock for the rest of the series; bans do not.">
          <div className="game-meta">
            <label>
              Our side{' '}
              <select value={game.side ?? ''} onChange={(e) => update((g) => ({ ...g, side: (e.target.value || null) as PlannedGame['side'] }))}>
                <option value="">not set</option>
                <option value="blue">blue</option>
                <option value="red">red</option>
              </select>
            </label>
            <label>
              <input type="checkbox" checked={game.played} onChange={(e) => update((g) => ({ ...g, played: e.target.checked }))} /> played
            </label>
            {game.played && (
              <label>
                Result{' '}
                <select
                  value={game.won === null ? '' : game.won ? 'w' : 'l'}
                  onChange={(e) => update((g) => ({ ...g, won: e.target.value === '' ? null : e.target.value === 'w' }))}
                >
                  <option value="">-</option>
                  <option value="w">won</option>
                  <option value="l">lost</option>
                </select>
              </label>
            )}
          </div>
          <div className="lineups">
            {(['us', 'them'] as const).map((team) => (
              <div key={team}>
                <h4>{team === 'us' ? us.name : them.name}</h4>
                {ROLES.map((r) => (
                  <div className="role-row" key={r}>
                    <span className="role">{r}</span>
                    <ChampInput
                      value={game[team][r]}
                      onChange={(v) => setPick(team, r, v)}
                      champions={champSet}
                      bad={bad.get(game[team][r])?.reason}
                      placeholder="pick"
                    />
                  </div>
                ))}
                <h5>Bans</h5>
                <div className="bans">
                  {game[team === 'us' ? 'usBans' : 'themBans'].map((b, i) => (
                    <ChampInput
                      key={i}
                      value={b}
                      onChange={(v) => setBan(team === 'us' ? 'usBans' : 'themBans', i, v)}
                      champions={champSet}
                      bad={bad.get(`ban:${b}`)?.reason}
                      placeholder="ban"
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          {bad.size > 0 && (
            <ul className="conflicts">
              {[...bad.values()].map((c) => (
                <li key={c.champ + c.reason}>
                  <b>{c.champ}</b>: {c.reason}
                </li>
              ))}
            </ul>
          )}
          <textarea placeholder="Notes for this game" value={game.note} onChange={(e) => update((g) => ({ ...g, note: e.target.value }))} />
        </Card>

        <div className="planner-side">
          <Card title={`Locked before game ${n}`} hint={`${locked.size} champions picked in earlier games.`}>
            <div className="locked">
              {[...locked.entries()].map(([c, from]) => (
                <span key={c} title={`picked in game ${from}`}>
                  <ChampIcon name={c} size={26} dim />
                </span>
              ))}
              {!locked.size && <p className="empty">nothing locked yet</p>}
            </div>
          </Card>

          <Card title={`${them.name} in game ${n}, historically`} hint="Their picks and bans at this game number, minus what is no longer available.">
            <div className="two-col tight">
              <div>
                <h5>Likely picks</h5>
                <ul className="count-list">
                  {expPicks.map((e) => (
                    <li key={e.champ}>
                      <ChampCount name={e.champ} count={e.count} of={e.of} />
                    </li>
                  ))}
                  {!expPicks.length && <p className="empty">no data for game {n}</p>}
                </ul>
              </div>
              <div>
                <h5>Usual bans</h5>
                <ul className="count-list">
                  {expBans.map((e) => (
                    <li key={e.champ}>
                      <ChampCount name={e.champ} count={e.count} of={e.of} />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Card
        title="Denial value"
        hint={`Picking a champion removes it for both teams for the remaining ${remaining} game${remaining === 1 ? '' : 's'}. Denial = share of the opponent players' games on it; cost = the same for our players. The coach decides.`}
      >
        <table className="denial">
          <thead>
            <tr>
              <th>Champion</th>
              <th>Denial</th>
              <th>Who loses it</th>
              <th>Our cost</th>
              <th>Our players on it</th>
            </tr>
          </thead>
          <tbody>
            {denial.map((d) => (
              <tr key={d.champ}>
                <td>
                  <ChampIcon name={d.champ} size={24} /> {d.champ}
                </td>
                <td>
                  <span className="bar" style={{ width: `${Math.min(100, d.denial * 300)}%` }} /> {pct(d.denial)}
                </td>
                <td className="small">
                  {d.theirs.map((t) => `${t.name.trim()} ${t.games}/${t.of}`).join(', ')}
                </td>
                <td>{d.cost ? pct(d.cost) : '-'}</td>
                <td className="small">{d.ours.map((t) => `${t.name.trim()} ${t.games}/${t.of}`).join(', ') || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="two-col">
        {[
          { title: `${them.name}: what is left`, rows: theirLeft },
          { title: `${us.name}: what is left`, rows: ourLeft },
        ].map((side) => (
          <Card key={side.title} title={side.title} hint="Top remaining champions per player; the share of their games already locked.">
            <div className="left-pools">
              {side.rows.map((r) => (
                <div key={r.player.id} className="left-row">
                  <span className="role">{r.player.role}</span>
                  <span className="pname">{r.player.name.trim()}</span>
                  <span className={`locked-share${r.lockedShare >= 0.5 ? ' hot' : ''}`} title="share of this player's games on locked champions">
                    {pct(r.lockedShare)} gone
                  </span>
                  <span className="left-champs">
                    {r.left.map((c) => (
                      <span key={c.champ} title={`${c.champ}: ${c.games} games, won ${c.wins}`}>
                        <ChampIcon name={c.champ} size={24} />
                        <small>{c.games}</small>
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
