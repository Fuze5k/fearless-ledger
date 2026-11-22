import { createContext } from 'react'
import type { IconSet } from './ddragon'

export const IconContext = createContext<IconSet | null>(null)

export const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'

export const record = (won: number, total: number) => `${won}-${total - won}`
