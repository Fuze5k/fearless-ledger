import { Fragment, isValidElement, useEffect, useState, type ReactNode } from 'react'
import { denialTable, pct, type PlannedGame } from './fearless'
import { howToWin, type Lever } from './howToWin'
import { insights, type Insight } from './insights'
import { loadPlan } from './planStore'
import { fmtDate, record } from './shared'
import { ROLES, type Counted, type TeamWindow } from './types'
import { ChampIcon } from './ui'

// One printable page for the coach's desk: the opponent at a glance plus our series plan.

function Champs({ items, n, of }: { items: Counted; n: number; of: number }) {
  return (
    <span className="sheet-champs">
      {items.slice(0, n).map(([c, k]) => (
        <span key={c}>
          <ChampIcon name={c} size={18} /> {c} <small>
            {k}/{of}
          </small>
        </span>
      ))}
    </span>
  )
}

/** The visible text of an insight or lever (fragments, <b> and plain values only). */
function plainText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'bigint') return String(node)
  if (Array.isArray(node)) return node.map(plainText).join('')
  if (isValidElement<{ children?: ReactNode }>(node) && (typeof node.type === 'string' || node.type === Fragment))
    return plainText(node.props.children)
  throw new Error('An insight contains something that cannot be copied as text')
}

const result = (g: PlannedGame) => (g.played ? (g.won === null ? ' ✓' : g.won ? ' W' : ' L') : '')

function planLine(g: PlannedGame, n: number): string {
  const ours = ROLES.filter((r) => g.us[r]).map((r) => `${r} ${g.us[r]}`)
  const theirs = ROLES.filter((r) => g.them[r]).map((r) => g.them[r])
  const parts = [
    g.side ? `${g.side} side` : '',
    ours.join(', '),
    theirs.length ? `their comp: ${theirs.join(', ')}` : '',
    g.note ? `note: ${g.note}` : '',
  ].filter(Boolean)
  return `G${n}${result(g)}: ${parts.length ? parts.join(' · ') : 'nothing planned'}`
}

/** The sheet as plain text for a team chat: header, tendencies, levers, our plan; evidence in brackets. */
function sheetText(o: {
  title: string
  header: string
  tendencies: Insight[]
  levers: Lever[]
  format: number
  planned: { g: PlannedGame; n: number }[] | null
}): string {
  const items = (rows: { text: ReactNode; evidence: string }[]) =>
    rows.length ? rows.map((r) => `- ${plainText(r.text)} (${r.evidence})`) : ['- none in this window']
  return [
    o.title,
    o.header,
    '',
    'Key tendencies',
    ...items(o.tendencies),
    '',
    'How to beat them',
    ...items(o.levers),
    '',
    `Our plan (Bo${o.format})`,
    ...(o.planned ? o.planned.map(({ g, n }) => planLine(g, n)) : ['No plan saved for this matchup yet.']),
  ].join('\n')
}

type CopyState = { kind: 'idle' } | { kind: 'copied' } | { kind: 'failed'; message: string }

interface Props {
  us: { id: string; name: string; w: TeamWindow }
  them: { id: string; name: string; w: TeamWindow }
  windowLabel: string
}

export function SeriesSheet({ us, them, windowLabel }: Props) {
  const w = them.w
  const plan = loadPlan(`${us.id}:${them.id}`)
  const planned = plan.games.slice(0, plan.format).map((g, i) => ({ g, n: i + 1 }))
  const anyPlan = planned.some(({ g }) => ROLES.some((r) => g.us[r] || g.them[r]) || g.note)
  const deny = denialTable(w.players, us.w.players, new Set()).slice(0, 8)
  const tendencies = insights(w)
  const levers = howToWin(w, 'opponent').slice(0, 6)
  const title = `${us.name} vs ${them.name}`
  const header =
    `Fearless series sheet · ${them.name}: ${w.series} series (${record(w.series_won, w.series_lost, w.series)}), ` +
    `${w.games} games, ${fmtDate(w.from)} - ${fmtDate(w.to)} (${windowLabel})`

  const [copy, setCopy] = useState<CopyState>({ kind: 'idle' })
  useEffect(() => {
    if (copy.kind !== 'copied') return
    const t = window.setTimeout(() => setCopy({ kind: 'idle' }), 2000)
    return () => window.clearTimeout(t)
  }, [copy])

  const copyAsText = async () => {
    try {
      // Absent outside a secure context (plain http on a non-localhost host).
      if (!navigator.clipboard) throw new Error('the clipboard is not available on this page (it needs https)')
      const text = sheetText({ title, header, tendencies, levers, format: plan.format, planned: anyPlan ? planned : null })
      await navigator.clipboard.writeText(text)
      setCopy({ kind: 'copied' })
    } catch (e) {
      setCopy({ kind: 'failed', message: e instanceof Error ? e.message : String(e) })
    }
  }

  return (
    <div className="sheet">
      <div className="sheet-actions">
        <p className="hint">One page for the desk. Uses the plan saved in the Series planner for this matchup.</p>
        <div className="sheet-buttons">
          {copy.kind === 'failed' && <span className="error" role="alert">Copy failed: {copy.message}</span>}
          <button onClick={copyAsText}>{copy.kind === 'copied' ? 'Copied' : 'Copy as text'}</button>
          <button onClick={() => window.print()}>Print / save as PDF</button>
        </div>
      </div>
      <article className="sheet-page">
        <header className="sheet-head">
          <h2>{title}</h2>
          <p>{header}</p>
        </header>

        <div className="sheet-cols">
          <section>
            <h3>Key tendencies</h3>
            <ul className="sheet-list one">
              {tendencies.map((i, k) => (
                <li key={k}>
                  {i.text} <small>({i.evidence})</small>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3>How to beat them</h3>
            <ul className="sheet-list one">
              {levers.map((l, k) => (
                <li key={k}>
                  {l.text} <small>({l.evidence})</small>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section>
          <h3>By game number</h3>
          <table className="sheet-table">
            <thead>
              <tr>
                <th>Game</th>
                <th>Games</th>
                <th>Blue / FP</th>
                <th>Their picks</th>
                <th>Their bans</th>
                <th>Banned vs them</th>
              </tr>
            </thead>
            <tbody>
              {['1', '2', '3', '4', '5'].map((n) => {
                const g = w.by_game_number[n]
                if (!g?.games) return null
                return (
                  <tr key={n}>
                    <td>G{n}</td>
                    <td>
                      {g.games} ({g.wins}W)
                    </td>
                    <td>
                      {pct(g.blue / g.games)} / {g.drafts ? pct(g.first_pick / g.drafts) : '-'}
                    </td>
                    <td>
                      <Champs items={g.picks} n={3} of={g.games} />
                    </td>
                    <td>
                      <Champs items={g.bans} n={3} of={g.drafts} />
                    </td>
                    <td>
                      <Champs items={g.banned_against} n={2} of={g.drafts} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>

        <div className="sheet-cols">
          <section>
            <h3>Their players (games on champion)</h3>
            <table className="sheet-table">
              <tbody>
                {w.players.map((p) => (
                  <tr key={p.id}>
                    <td className="role">{p.role}</td>
                    <td>
                      {p.name.trim()} <small>depth {p.depth}</small>
                    </td>
                    <td>
                      <Champs items={p.champs.map((c) => [c.champ, c.games])} n={5} of={p.games} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section>
            <h3>Denial targets at series start</h3>
            <table className="sheet-table">
              <tbody>
                {deny.map((d) => (
                  <tr key={d.champ}>
                    <td>
                      <ChampIcon name={d.champ} size={18} /> {d.champ}
                    </td>
                    <td>{pct(d.denial)}</td>
                    <td>
                      <small>{d.theirs.map((t) => `${t.name.trim()} ${t.games}/${t.of}`).join(', ')}</small>
                    </td>
                    <td>
                      <small>{d.cost ? `our cost ${pct(d.cost)}` : ''}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        <section>
          <h3>Our plan</h3>
          {!anyPlan ? (
            <p className="empty">No plan saved for this matchup yet: fill it in the Series planner.</p>
          ) : (
            <table className="sheet-table plan">
              <thead>
                <tr>
                  <th>Game</th>
                  <th>Side</th>
                  {ROLES.map((r) => (
                    <th key={r}>{r}</th>
                  ))}
                  <th>Their comp</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {planned.map(({ g, n }) => (
                  <tr key={n}>
                    <td>
                      G{n}
                      {result(g)}
                    </td>
                    <td>{g.side ?? '-'}</td>
                    {ROLES.map((r) => (
                      <td key={r}>{g.us[r] ? <><ChampIcon name={g.us[r]} size={18} /> {g.us[r]}</> : ''}</td>
                    ))}
                    <td>
                      {ROLES.filter((r) => g.them[r]).map((r) => (
                        <ChampIcon key={r} name={g.them[r]} size={18} />
                      ))}
                    </td>
                    <td>
                      <small>{g.note}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <footer className="sheet-foot">
          Fearless Ledger · GRID esports data (hackathon license), aggregates only · Not endorsed by Riot Games.
        </footer>
      </article>
    </div>
  )
}
