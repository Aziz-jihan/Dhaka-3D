import { useEffect, useRef, useState } from 'react'
import { useApp, type LayerKey } from '../store'
import { LIGHT_MODE_LABELS, type LightMode } from '../map/lighting'
import { resetView } from '../map/camera'
import { TOURS } from '../tours/tours'

const LAYER_LABELS: Record<LayerKey, string> = {
  buildings: '3D buildings',
  areas: 'Area outlines',
  landmarks: 'Landmarks',
  roads: 'Roads',
  metro: 'Metro Line 6',
}

const MODE_ICON: Record<LightMode, string> = { golden: '🌇', day: '☀️', night: '🌙' }

const btn =
  'rounded-lg px-2.5 py-1.5 text-xs font-medium transition text-stone-700 hover:bg-amber-900/5 hover:text-stone-900'

export default function MapControls() {
  const map = useApp((s) => s.map)
  const lightMode = useApp((s) => s.lightMode)
  const setLightMode = useApp((s) => s.setLightMode)
  const lang = useApp((s) => s.lang)
  const setLang = useApp((s) => s.setLang)
  const layers = useApp((s) => s.layers)
  const toggleLayer = useApp((s) => s.toggleLayer)
  const quality = useApp((s) => s.buildingQuality)
  const setQuality = useApp((s) => s.setBuildingQuality)
  const setTour = useApp((s) => s.setTour)
  const select = useApp((s) => s.select)
  const setPanelOpen = useApp((s) => s.setPanelOpen)
  const [layersOpen, setLayersOpen] = useState(false)
  const [toursOpen, setToursOpen] = useState(false)
  const [orbit, setOrbit] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const toursRef = useRef<HTMLDivElement>(null)

  const startTour = (id: string) => {
    setToursOpen(false)
    setOrbit(false)
    select(null)
    if (!window.matchMedia('(min-width: 768px)').matches) setPanelOpen(false)
    setTour({ id, step: 0, playing: true })
  }

  // Slow cinematic orbit around the current centre
  useEffect(() => {
    if (!map || !orbit) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      map.setBearing(map.getBearing() + (now - last) * 0.004)
      last = now
      frame = requestAnimationFrame(tick)
    }
    const stop = () => setOrbit(false)
    frame = requestAnimationFrame(tick)
    map.once('mousedown', stop)
    map.once('touchstart', stop)
    return () => {
      cancelAnimationFrame(frame)
      map.off('mousedown', stop)
      map.off('touchstart', stop)
    }
  }, [map, orbit])

  // Close an open menu when clicking elsewhere
  useEffect(() => {
    if (!layersOpen && !toursOpen) return
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setLayersOpen(false)
      if (!toursRef.current?.contains(e.target as Node)) setToursOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [layersOpen, toursOpen])

  return (
    <div className="fixed left-2 right-12 top-2 z-10 flex flex-wrap items-center justify-end gap-2 md:left-auto md:right-14 md:top-4">
      <div role="radiogroup" aria-label="Lighting" className="panel flex rounded-xl p-1">
        {(Object.keys(LIGHT_MODE_LABELS) as LightMode[]).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={lightMode === m}
            title={LIGHT_MODE_LABELS[m]}
            onClick={() => setLightMode(m)}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
              lightMode === m ? 'bg-amber-700 text-amber-50 shadow-sm' : 'text-stone-700 hover:bg-amber-900/5'
            }`}
          >
            <span aria-hidden>{MODE_ICON[m]}</span>
            <span className="ml-1 hidden sm:inline">{LIGHT_MODE_LABELS[m]}</span>
          </button>
        ))}
      </div>

      <div className="panel flex rounded-xl p-1">
        <button
          type="button"
          className={btn}
          onClick={() => setLang(lang === 'en' ? 'bn' : 'en')}
          title="Switch label language"
        >
          {lang === 'en' ? <span lang="bn" className="font-bengali">বাংলা</span> : 'English'}
        </button>
        <div ref={toursRef} className="relative">
          <button type="button" className={btn} aria-expanded={toursOpen} onClick={() => setToursOpen((o) => !o)}>
            Tours
          </button>
          {toursOpen && (
            <ul className="absolute right-0 top-full z-20 mt-2 w-72 rounded-xl bg-[#fff8ee] p-1.5 shadow-xl ring-1 ring-amber-900/10">
              {TOURS.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => startTour(t.id)}
                    className="w-full rounded-lg px-3 py-2 text-left hover:bg-amber-50"
                  >
                    <span className="block text-sm font-medium text-stone-800">{t.title}</span>
                    <span className="block text-xs leading-snug text-stone-500">
                      {t.blurb} {t.stops.length} stops.
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div ref={menuRef} className="relative">
          <button
            type="button"
            className={btn}
            aria-expanded={layersOpen}
            onClick={() => setLayersOpen((o) => !o)}
          >
            Layers
          </button>
          {layersOpen && (
            <div className="absolute right-0 top-full z-20 mt-2 w-52 rounded-xl bg-[#fff8ee] p-2 shadow-xl ring-1 ring-amber-900/10">
              <p className="px-2 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-900/55">
                Buildings
              </p>
              <div role="radiogroup" aria-label="Building detail" className="mb-2 flex rounded-lg bg-amber-900/5 p-0.5">
                {(['realistic', 'simple'] as const).map((q) => (
                  <button
                    key={q}
                    type="button"
                    role="radio"
                    aria-checked={quality === q}
                    onClick={() => setQuality(q)}
                    className={`flex-1 rounded-md px-2 py-1 text-xs font-medium capitalize transition ${
                      quality === q ? 'bg-amber-700 text-amber-50 shadow-sm' : 'text-stone-700 hover:bg-amber-900/5'
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>
              {(Object.keys(LAYER_LABELS) as LayerKey[]).map((k) => (
                <label
                  key={k}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-stone-700 hover:bg-amber-50"
                >
                  <input
                    type="checkbox"
                    className="accent-amber-700"
                    checked={layers[k]}
                    onChange={() => toggleLayer(k)}
                  />
                  {LAYER_LABELS[k]}
                </label>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          className={`${btn} ${orbit ? 'bg-amber-700 text-amber-50 hover:bg-amber-700 hover:text-amber-50' : ''}`}
          aria-pressed={orbit}
          onClick={() => setOrbit((o) => !o)}
          title="Slowly orbit the view"
        >
          Orbit
        </button>
        <button type="button" className={btn} onClick={() => map && resetView(map)} title="Back to the opening view">
          Reset
        </button>
      </div>
    </div>
  )
}
