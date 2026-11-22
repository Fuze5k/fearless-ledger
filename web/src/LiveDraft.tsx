import { useState } from 'react'
import { applyLive, DRAFT_STEPS, hasPlan, startLive, stepAt, suggest, undoLive, type PlannedGame } from './fearless'
import type { ChampionMeta, TeamWindow } from './types'
import { Card, ChampIcon } from './ui'

interface Props {
  game: PlannedGame
  n: number
  gamesLeftAfter: number
  taken: Set<string>
  us: { name: string; w: TeamWindow }
  them: { name: string; w: TeamWindow }
  meta: Record<string, ChampionMeta>
  onChange: (g: PlannedGame) => void
}

export function LiveDraft({ game, n, gamesLeftAfter, taken, us, them, meta, onChange }: Props) {
  const [entry, setEntry] = useState('')
  const [error, setError] = useState<string | null>(null)
  const live = game.live

  const start = (weFirst: boolean) => {
    if (hasPlan(game) && !confirm(`Replace the planned picks and bans of game ${n} with the live draft?`)) return
    onChange(startLive(game, weFirst))
  }

  if (!live) {
    return (
      <Card title={`Live draft, game ${n}`} hint="Log the real draft action by action. Picks fill the lineup above, locks and pools update, and the next action gets options with their evidence.">
        <div className="live-start">
          <button onClick={() => start(true)}>Start: we have first pick</button>
          <button onClick={() => start(false)}>Start: {them.name} has first pick</button>
        </div>
      </Card>
    )
  }

  const done = live.actions.length >= DRAFT_STEPS
  const step = done ? null : stepAt(live.actions.length, live.weFirst)
  const options = step ? suggest(step, game, n, gamesLeftAfter, taken, us.w, them.w) : []

  const log = (champ: string) => {
    const name = champ.trim()
    if (!meta[name]) return setError(`"${name}" is not a champion name`)
    if (taken.has(name)) return setError(`${name} is not available in this game`)
    const next = applyLive(game, name, meta)
    if (typeof next === 'string') return setError(next)
    setError(null)
    setEntry('')
    onChange(next)
  }

  const who = (ours: boolean) => (ours ? 'Our' : 'Their')
  const title = step
    ? `${who(step.us)} ${step.type} (${step.seq}/${DRAFT_STEPS})`
    : 'Draft complete'
  const hint = !step
    ? 'Set the result above when the game ends, then move to the next game.'
    : step.type === 'ban' && !step.us
      ? `What ${them.name} usually bans in game ${n}.`
      : step.type === 'ban'
        ? `Ban what ${them.name} would likely pick: their open-role players' comfort, their game-${n} picks and what they win with.`
        : step.us
          ? `Our open-role players' comfort, ${them.name}'s record against each champion${gamesLeftAfter ? ', and how much the pick takes away from them for the rest of the series' : ''}.`
          : `What ${them.name} would likely pick next.`

  return (
    <Card title={`Live draft, game ${n}`} hint={`${live.weFirst ? 'We have' : `${them.name} has`} first pick. Options highlight; the coach decides.`} className="live">
      <ol className="draft-strip">
        {Array.from({ length: DRAFT_STEPS }, (_, i) => {
          const s = stepAt(i, live.weFirst)
          const a = live.actions[i]
          return (
            <li key={i} className={`${s.type} ${s.us ? 'us' : 'them'}${i === live.actions.length ? ' next' : ''}`} title={`${s.seq}. ${who(s.us)} ${s.type}${a ? `: ${a.champ}` : ''}`}>
              {a ? <ChampIcon name={a.champ} size={30} dim={s.type === 'ban'} /> : <span className="draft-empty">{s.type === 'ban' ? 'B' : 'P'}</span>}
            </li>
          )
        })}
      </ol>
      <div className="live-next">
        <h4>{title}</h4>
        <p className="hint">{hint}</p>
        {step && (
          <form
            className="live-entry"
            onSubmit={(e) => {
              e.preventDefault()
              log(entry)
            }}
          >
            <input list="champion-names" value={entry} placeholder={`${who(step.us).toLowerCase()} ${step.type}: champion`} onChange={(e) => setEntry(e.target.value)} aria-label="Champion for the next draft action" />
            <button type="submit">Log</button>
          </form>
        )}
        {error && <p className="error">{error}</p>}
        {options.length > 0 && (
          <ul className="options">
            {options.map((o) => (
              <li key={o.champ}>
                <button className="option" onClick={() => log(o.champ)} title={`Log ${o.champ}`}>
                  <ChampIcon name={o.champ} size={26} />
                  <span className="opt-name">{o.champ}</span>
                  <span className="evidence">{o.why.join(' · ')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {step && !options.length && <p className="empty">no data-backed options left for this action</p>}
        <div className="live-tools">
          <button className="ghost" disabled={!live.actions.length} onClick={() => onChange(undoLive(game, meta))}>
            Undo last
          </button>
          <button className="ghost" onClick={() => onChange({ ...game, live: undefined })} title="Stop logging; the lineup and bans stay">
            Stop live mode
          </button>
        </div>
      </div>
    </Card>
  )
}
