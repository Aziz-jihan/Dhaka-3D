import { useMemo, useState } from 'react'
import Fuse from 'fuse.js'
import { useApp } from '../store'
import type { Place } from '../types'

const TYPE_LABEL: Record<Place['type'], string> = {
  area: 'Area',
  landmark: 'Landmark',
  road: 'Road',
  station: 'Metro',
}

export default function SearchBox() {
  const data = useApp((s) => s.data)
  const select = useApp((s) => s.select)
  const lang = useApp((s) => s.lang)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)

  const fuse = useMemo(
    () =>
      new Fuse(data?.places ?? [], {
        keys: [{ name: 'name', weight: 2 }, 'name_bn'],
        threshold: 0.35,
        ignoreLocation: true,
      }),
    [data],
  )
  const results = query.trim() ? fuse.search(query.trim(), { limit: 8 }).map((r) => r.item) : []

  const choose = (p: Place) => {
    if (p.type === 'area' || p.type === 'landmark') select({ type: p.type, slug: p.id })
    else select({ type: 'place', place: p })
    setQuery('')
    setOpen(false)
    ;(document.activeElement as HTMLElement | null)?.blur()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' && results[active]) {
      choose(results[active])
    } else if (e.key === 'Escape') {
      setQuery('')
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <label className="sr-only" htmlFor="search">
        Search Dhaka
      </label>
      <div className="flex items-center gap-2 rounded-xl bg-white/70 px-3 py-2.5 ring-1 ring-amber-900/10 focus-within:ring-2 focus-within:ring-amber-600/50">
        <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-amber-900/50" aria-hidden>
          <path
            fill="currentColor"
            d="M8.5 3a5.5 5.5 0 0 1 4.38 8.82l3.65 3.65a.75.75 0 1 1-1.06 1.06l-3.65-3.65A5.5 5.5 0 1 1 8.5 3Zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"
          />
        </svg>
        <input
          id="search"
          type="search"
          autoComplete="off"
          placeholder="Search areas, landmarks, roads…"
          className="w-full bg-transparent text-sm text-stone-800 placeholder:text-stone-500 focus:outline-none"
          value={query}
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls="search-results"
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
        />
      </div>
      {open && results.length > 0 && (
        <ul
          id="search-results"
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1.5 overflow-hidden rounded-xl bg-[#fff8ee] shadow-xl ring-1 ring-amber-900/10"
        >
          {results.map((p, i) => (
            <li key={`${p.type}-${p.id}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                  i === active ? 'bg-amber-100/80' : 'hover:bg-amber-50'
                }`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(p)}
              >
                <span className="truncate text-stone-800">
                  {lang === 'bn' && p.name_bn ? <span lang="bn">{p.name_bn}</span> : p.name}
                </span>
                <span className="shrink-0 text-[11px] uppercase tracking-wide text-amber-800/70">
                  {TYPE_LABEL[p.type]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
