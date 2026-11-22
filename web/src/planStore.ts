import { emptyPlan, type SeriesPlan } from './fearless'

// Series plans live in the coach's browser only, one per (our team, opponent) pair.
export const STORE = 'fearless-ledger:plan:'

export function loadPlan(key: string): SeriesPlan {
  try {
    const raw = localStorage.getItem(STORE + key)
    if (raw) return JSON.parse(raw) as SeriesPlan
  } catch (e) {
    console.warn('saved plan unreadable, starting empty:', e)
  }
  return emptyPlan()
}

export function savePlan(key: string, plan: SeriesPlan) {
  try {
    localStorage.setItem(STORE + key, JSON.stringify(plan))
  } catch (e) {
    console.warn('plan not saved (storage blocked):', e)
  }
}
