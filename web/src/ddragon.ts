import { useEffect, useState } from 'react'

// Champion icons from Riot's Data Dragon CDN (allowed by Riot's developer policies).
// GRID uses display names ("Wukong", "Nunu & Willump"); Data Dragon images are keyed by id ("MonkeyKing", "Nunu").
const DDRAGON = 'https://ddragon.leagueoflegends.com'

export interface IconSet {
  version: string
  idByName: Map<string, string>
}

let iconsPromise: Promise<IconSet> | null = null

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function loadIcons(): Promise<IconSet> {
  iconsPromise ??= (async () => {
    const versions = (await (await fetch(`${DDRAGON}/api/versions.json`)).json()) as string[]
    const version = versions[0]
    const champs = (await (await fetch(`${DDRAGON}/cdn/${version}/data/en_US/champion.json`)).json()) as {
      data: Record<string, { id: string; name: string }>
    }
    const idByName = new Map<string, string>()
    for (const c of Object.values(champs.data)) {
      idByName.set(norm(c.name), c.id)
      idByName.set(norm(c.id), c.id)
    }
    return { version, idByName }
  })()
  return iconsPromise
}

/** Icon set, or null while loading or when the CDN is unreachable (the UI then shows initials). */
export function useIcons(): IconSet | null {
  const [icons, setIcons] = useState<IconSet | null>(null)
  useEffect(() => {
    loadIcons().then(setIcons, (e: unknown) => console.warn('Data Dragon unavailable, showing initials:', e))
  }, [])
  return icons
}

export function iconUrl(icons: IconSet | null, name: string): string | null {
  const id = icons?.idByName.get(norm(name))
  return icons && id ? `${DDRAGON}/cdn/${icons.version}/img/champion/${id}.png` : null
}
