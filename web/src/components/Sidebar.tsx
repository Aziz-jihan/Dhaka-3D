import { useEffect, useMemo } from 'react'
import { useApp } from '../store'
import SearchBox from './SearchBox'

const ZONE_ORDER = ['Business district', 'Central', 'Midtown', 'North-east', 'Old Dhaka', 'Beyond the core']

export default function Sidebar() {
  const data = useApp((s) => s.data)
  const lang = useApp((s) => s.lang)
  const selection = useApp((s) => s.selection)
  const select = useApp((s) => s.select)
  const open = useApp((s) => s.panelOpen)
  const setOpen = useApp((s) => s.setPanelOpen)
  const touring = useApp((s) => s.tour !== null)

  const zones = useMemo(() => {
    const byZone = new Map<string, { slug: string; en: string; bn: string }[]>()
    for (const f of data?.areas.features ?? []) {
      if (!f.properties.featured) continue
      const list = byZone.get(f.properties.zone) ?? []
      list.push({ slug: f.properties.slug, en: f.properties.name_en, bn: f.properties.name_bn })
      byZone.set(f.properties.zone, list)
    }
    return ZONE_ORDER.filter((z) => byZone.has(z)).map((z) => ({ zone: z, areas: byZone.get(z)! }))
  }, [data])

  const selectedSlug = selection?.type === 'area' ? selection.slug : null

  // On phones, tuck the sheet away so the info card and the map have room
  useEffect(() => {
    if (selection && !window.matchMedia('(min-width: 768px)').matches) setOpen(false)
  }, [selection, setOpen])

  return (
    <aside
      className={`panel fixed inset-x-2 bottom-9 z-10 ${touring ? 'hidden md:flex' : 'flex'} max-h-[46vh] flex-col rounded-2xl transition-transform duration-300 md:inset-x-auto md:bottom-4 md:left-4 md:top-4 md:max-h-none md:w-[340px] ${
        open ? 'translate-y-0' : 'translate-y-[calc(100%-4.25rem)] md:translate-y-0'
      }`}
    >
      <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
        <div>
          <h1 className="font-display text-[1.65rem] leading-none text-stone-900">
            Dhaka <span className="text-amber-700">3D</span>
            <span lang="bn" className="ml-2 font-bengali text-lg text-amber-800/70">
              ঢাকা
            </span>
          </h1>
          <p className="mt-1.5 text-xs text-stone-600">Drag to move, right-drag to tilt and turn.</p>
        </div>
        <button
          type="button"
          className="rounded-lg px-2 py-1 text-xs font-medium text-amber-900/70 hover:bg-amber-900/5 md:hidden"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          {open ? 'Hide' : 'Explore'}
        </button>
      </header>

      <div className="px-4">
        <SearchBox />
      </div>

      <nav aria-label="Neighbourhoods" className="mt-3 min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {zones.map(({ zone, areas }) => (
          <section key={zone} className="mt-3 first:mt-1">
            <h2 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-900/55">
              {zone}
            </h2>
            <ul className="flex flex-wrap gap-1.5">
              {areas.map((a) => (
                <li key={a.slug}>
                  <button
                    type="button"
                    onClick={() => select({ type: 'area', slug: a.slug })}
                    className={`rounded-full px-3 py-1.5 text-[13px] transition ${
                      selectedSlug === a.slug
                        ? 'bg-amber-700 text-amber-50 shadow-sm'
                        : 'bg-white/60 text-stone-700 ring-1 ring-amber-900/10 hover:bg-white hover:text-stone-900'
                    }`}
                  >
                    {lang === 'bn' ? (
                      <span lang="bn" className="font-bengali">
                        {a.bn}
                      </span>
                    ) : (
                      a.en
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p className="mt-5 px-1 text-[11px] leading-relaxed text-stone-500">
          Area outlines are approximate: most Dhaka neighbourhoods have no official boundary.
        </p>
      </nav>
    </aside>
  )
}
