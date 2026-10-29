import { useApp } from '../store'

const FLOOR_HEIGHT_M = 3.2
const BENGALI = /[ঀ-৿]/

/** Where a building's height came from; codes match pipeline/03_heights.py */
const HEIGHT_SOURCE: Record<number, string> = {
  0: 'Height checked by hand.',
  1: 'Height mapped in OpenStreetMap.',
  2: 'Height from the floor count mapped in OpenStreetMap.',
  3: 'Height estimated from the average building height of this block (GHSL satellite data).',
  4: 'Height estimated from the size of the building.',
}

export default function InfoPanel() {
  const data = useApp((s) => s.data)
  const selection = useApp((s) => s.selection)
  const select = useApp((s) => s.select)
  const lang = useApp((s) => s.lang)
  if (!data || !selection) return null

  const areaName = (slug?: string) => {
    const a = data.areas.features.find((f) => f.properties.slug === slug)?.properties
    return a ? (lang === 'bn' ? a.name_bn : a.name_en) : null
  }

  let eyebrow = ''
  let title = ''
  let titleBn = ''
  let body: React.ReactNode = null

  if (selection.type === 'area') {
    const a = data.areas.features.find((f) => f.properties.slug === selection.slug)?.properties
    if (!a) return null
    const landmarks = data.landmarks.features.filter((l) => {
      const [x, y] = l.geometry.coordinates
      const [cx, cy] = a.center
      return Math.hypot((x - cx) * 102, (y - cy) * 111) < 1.3 // km, roughly
    })
    eyebrow = a.zone
    title = a.name_en
    titleBn = a.name_bn
    body = landmarks.length ? (
      <div>
        <p className="mb-1.5 text-xs font-medium text-stone-500">Nearby landmarks</p>
        <ul className="flex flex-wrap gap-1.5">
          {landmarks.map((l) => (
            <li key={l.properties.slug}>
              <button
                type="button"
                className="rounded-full bg-amber-100/80 px-2.5 py-1 text-xs text-amber-950 hover:bg-amber-200/80"
                onClick={() => select({ type: 'landmark', slug: l.properties.slug })}
              >
                {lang === 'bn' ? l.properties.name_bn : l.properties.name_en}
              </button>
            </li>
          ))}
        </ul>
      </div>
    ) : (
      <p className="text-sm text-stone-600">Click a building to see its height.</p>
    )
  } else if (selection.type === 'landmark') {
    const l = data.landmarks.features.find((f) => f.properties.slug === selection.slug)?.properties
    if (!l) return null
    eyebrow = l.kind
    title = l.name_en
    titleBn = l.name_bn
    body = (
      <>
        <p className="text-sm leading-relaxed text-stone-700">{l.blurb}</p>
        <a
          href={l.wiki}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-sm font-medium text-amber-800 underline decoration-amber-800/30 underline-offset-2 hover:decoration-amber-800"
        >
          Read more on Wikipedia
        </a>
      </>
    )
  } else if (selection.type === 'building') {
    const total = selection.height - selection.base
    eyebrow = areaName(selection.area) ?? 'Building'
    title = selection.name || `${Math.round(total)} m tall`
    body = (
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-xs text-stone-500">Height</dt>
          <dd className="font-medium text-stone-800">{Math.round(total)} m</dd>
        </div>
        <div>
          <dt className="text-xs text-stone-500">Approx. floors</dt>
          <dd className="font-medium text-stone-800">{Math.max(1, Math.round(total / FLOOR_HEIGHT_M))}</dd>
        </div>
        <div>
          <dt className="text-xs text-stone-500">Location</dt>
          <dd className="font-medium text-stone-800">
            {selection.lngLat[1].toFixed(4)}°N, {selection.lngLat[0].toFixed(4)}°E
          </dd>
        </div>
        <p className="col-span-3 text-xs leading-relaxed text-stone-500">
          {HEIGHT_SOURCE[selection.src] ?? 'Height estimated.'}
        </p>
      </dl>
    )
  } else {
    const p = selection.place
    eyebrow = p.type === 'station' ? 'MRT Line 6' : 'Road'
    title = p.name
    titleBn = p.name_bn
  }

  return (
    <section
      aria-live="polite"
      className="panel fixed inset-x-2 top-16 z-10 rounded-2xl p-4 md:inset-x-auto md:bottom-10 md:right-4 md:top-auto md:w-[320px]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800/70">{eyebrow}</p>
          <h2
            lang={BENGALI.test(title) ? 'bn' : undefined}
            className="mt-0.5 font-display text-xl leading-tight text-stone-900"
          >
            {title}
          </h2>
          {titleBn && (
            <p lang="bn" className="font-bengali text-sm text-amber-900/70">
              {titleBn}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={() => select(null)}
          className="-mr-1 -mt-1 rounded-lg p-1.5 text-stone-500 hover:bg-stone-900/5 hover:text-stone-800"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
            <path
              fill="currentColor"
              d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L8.94 10l-4.72 4.72a.75.75 0 1 0 1.06 1.06L10 11.06l4.72 4.72a.75.75 0 1 0 1.06-1.06L11.06 10l4.72-4.72a.75.75 0 0 0-1.06-1.06L10 8.94 5.28 4.22Z"
            />
          </svg>
        </button>
      </div>
      {body && <div className="mt-3">{body}</div>}
    </section>
  )
}
