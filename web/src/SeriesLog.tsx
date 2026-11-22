import type { SeriesLogEntry } from './types'
import { fmtDate } from './shared'
import { Card, ChampIcon } from './ui'

// Per-series drafts. Only in the local build (data-local/): the hosted demo ships aggregates only (GRID license).
export function SeriesLog({ log, opponentId, teamName }: { log: SeriesLogEntry[]; opponentId: string | null; teamName: string }) {
  const rows = (opponentId ? log.filter((s) => s.opponent.id === opponentId) : log).slice().reverse()
  return (
    <Card title={`${teamName}: series drafts`} hint={`${rows.length} series${opponentId ? ' against the selected opponent' : ''}, newest first. Local build only.`}>
      {!rows.length && <p className="empty">no series against this opponent in the data</p>}
      {rows.map((s) => (
        <details key={s.series_id} className="series">
          <summary>
            <span className={s.won === null ? '' : s.won ? 'win' : 'loss'}>{s.won === null ? '?' : s.won ? 'W' : 'L'}</span> {fmtDate(s.date)} vs{' '}
            <b>{s.opponent.name}</b> · {s.event} {s.stage} · {s.games.length} games
          </summary>
          {s.games.map((g) => (
            <div key={g.n} className="log-game">
              <span className="gn">
                G{g.n} {g.side} {g.won ? 'W' : 'L'} <small>{g.patch}</small>
              </span>
              <span className="draft-seq">
                {g.draft.map((a) => (
                  <span key={a.seq} className={`${a.type} ${a.us ? 'us' : 'them'}`} title={`${a.seq}. ${a.us ? teamName : s.opponent.name} ${a.type} ${a.champ}`}>
                    <ChampIcon name={a.champ} size={22} dim={a.type === 'ban'} />
                  </span>
                ))}
              </span>
            </div>
          ))}
        </details>
      ))}
    </Card>
  )
}
