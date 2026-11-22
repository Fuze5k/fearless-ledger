import { createContext } from 'react'
import type { IconSet } from './ddragon'

export const IconContext = createContext<IconSet | null>(null)

export const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'

/** "9-5", or "9-5, 1 unresolved" when some records are tied or partial in the data. */
export const record = (won: number, lost: number, total: number) =>
  `${won}-${lost}${total > won + lost ? `, ${total - won - lost} unresolved` : ''}`
