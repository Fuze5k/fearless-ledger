// Shapes of the aggregate JSON written by etl/aggregate.py.

export type Role = 'TOP' | 'JNG' | 'MID' | 'BOT' | 'SUP'
export const ROLES: Role[] = ['TOP', 'JNG', 'MID', 'BOT', 'SUP']

export type Counted = [string, number][]

export interface TeamIndexEntry {
  id: string
  name: string
  series: number
  league: string
  last: string
  events: string[]
}

export interface ChampionMeta {
  picks: number
  bans: number
  wins: number
  presence: number
  roles: Partial<Record<Role, number>>
}

export interface DataIndex {
  teams: TeamIndexEntry[]
  champions: Record<string, ChampionMeta>
  games: number
  recent_series: number
  local: boolean
}

export interface GameNumberStats {
  games: number // denominator for wins, blue and picks
  drafts: number // games with all 20 draft actions: denominator for first pick and bans
  wins: number
  blue: number
  first_pick: number
  picks: Counted
  bans: Counted
  banned_against: Counted
}

export interface SpendSave {
  champ: string
  series: number
  by_game: Record<string, number>
  g1_share: number
  late_share: number
}

export interface PlayerPool {
  id: string
  name: string
  role: Role
  games: number
  champs: { champ: string; games: number; wins: number }[]
  unique: number
  depth: number
  offpool_by_game: Record<string, [number, number]>
}

export interface TeamWindow {
  series: number
  games: number
  series_won: number
  series_lost: number // the rest are tied or partial records
  games_won: number
  from: string | null
  to: string | null
  events: string[]
  opponents: { id: string; name: string; series: number }[]
  by_game_number: Record<string, GameNumberStats>
  first_pick_f1: Counted
  phase1_bans: { first: Counted; second: Counted }
  side_vs_pick: Record<string, number>
  picks_by_slot: Record<string, Counted>
  spend_save: SpendSave[]
  players: PlayerPool[]
  results_with: ChampResult[] // the team's games and wins with a champion in its own lineup
  results_against: ChampResult[] // the team's games and wins with a champion in the enemy lineup
  results_by: Record<'blue' | 'red' | 'first_pick' | 'second_pick', [number, number]> // [games, wins]
  after_g1: Record<'won_g1' | 'lost_g1', [number, number]> // [series, series won]
}

export interface ChampResult {
  champ: string
  games: number
  wins: number
}

export interface SeriesLogGame {
  n: number
  side: 'blue' | 'red'
  won: boolean
  patch: string | null
  draft: { seq: number; type: 'ban' | 'pick'; us: boolean; champ: string }[]
  lineup: { name: string; role: Role; champ: string }[]
  opp_lineup: { name: string; role: Role; champ: string }[]
}

export interface SeriesLogEntry {
  series_id: string
  date: string
  event: string
  stage: string
  opponent: { id: string; name: string }
  won: boolean | null
  games: SeriesLogGame[]
}

export type WindowKey = 'recent' | 'all'

export interface TeamProfile {
  id: string
  name: string
  windows: Record<WindowKey, TeamWindow>
  series_log?: SeriesLogEntry[]
}
