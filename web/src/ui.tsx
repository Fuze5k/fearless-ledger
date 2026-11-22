import { useContext, type ReactNode } from 'react'
import { iconUrl } from './ddragon'
import { IconContext } from './shared'

export function ChampIcon({ name, size = 28, dim = false }: { name: string; size?: number; dim?: boolean }) {
  const icons = useContext(IconContext)
  const url = iconUrl(icons, name)
  const style = { width: size, height: size }
  return url ? (
    <img className={`champ-icon${dim ? ' dim' : ''}`} src={url} alt={name} title={name} style={style} loading="lazy" />
  ) : (
    <span className={`champ-icon initials${dim ? ' dim' : ''}`} title={name} style={style}>
      {name.slice(0, 2)}
    </span>
  )
}

/** A champion with its evidence: "Ezreal 7/15" - every number shows its sample. */
export function ChampCount({ name, count, of, note }: { name: string; count: number; of?: number; note?: string }) {
  return (
    <span className="champ-count" title={note}>
      <ChampIcon name={name} size={24} />
      <span className="champ-name">{name}</span>
      <span className="evidence">{of !== undefined ? `${count}/${of}` : count}</span>
    </span>
  )
}

export function Card({ title, hint, children, className = '' }: { title: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      <header>
        <h3>{title}</h3>
        {hint && <p className="hint">{hint}</p>}
      </header>
      {children}
    </section>
  )
}
