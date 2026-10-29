import { useEffect } from 'react'
import { useApp } from '../store'
import { TOURS, bearingBetween, stopCenter } from '../tours/tours'

const FLY_MS = 4500
/** Time at each stop, while the camera slowly circles */
const DWELL_MS = 9000
const DWELL_TURN_DEG = 18

export default function TourPlayer() {
  const map = useApp((s) => s.map)
  const data = useApp((s) => s.data)
  const tour = useApp((s) => s.tour)
  const setTour = useApp((s) => s.setTour)
  const def = tour ? TOURS.find((t) => t.id === tour.id) : undefined
  const step = tour?.step ?? 0
  const playing = tour?.playing ?? false

  // Fly to the current stop
  useEffect(() => {
    if (!map || !data || !def) return
    const stop = def.stops[step]
    const center = stopCenter(stop, data)
    if (!center) return
    const next = def.stops[step + 1]
    const nextCenter = next ? stopCenter(next, data) : null
    const bearing = stop.bearing === 'next' ? (nextCenter ? bearingBetween(center, nextCenter) : map.getBearing()) : stop.bearing
    map.flyTo({ center, zoom: stop.zoom, pitch: stop.pitch, bearing, duration: FLY_MS, essential: true })
  }, [map, data, def, step])

  // While playing: circle slowly at the stop, then move on
  useEffect(() => {
    if (!map || !def || !playing) return
    let timer = 0
    const dwell = () => {
      map.easeTo({ bearing: map.getBearing() + DWELL_TURN_DEG, duration: DWELL_MS, easing: (t) => t })
      timer = window.setTimeout(() => {
        const t = useApp.getState().tour
        if (!t) return
        if (t.step < def.stops.length - 1) setTour({ ...t, step: t.step + 1 })
        else setTour({ ...t, playing: false })
      }, DWELL_MS)
    }
    if (map.isMoving()) map.once('moveend', dwell)
    else dwell()
    return () => {
      map.off('moveend', dwell)
      clearTimeout(timer)
      map.stop()
    }
  }, [map, def, step, playing, setTour])

  // Grabbing the map pauses the tour
  useEffect(() => {
    if (!map || !playing) return
    const pause = () => {
      const t = useApp.getState().tour
      if (t?.playing) setTour({ ...t, playing: false })
    }
    const events = ['mousedown', 'touchstart', 'wheel'] as const
    for (const e of events) map.on(e, pause)
    return () => {
      for (const e of events) map.off(e, pause)
    }
  }, [map, playing, setTour])

  if (!tour || !def) return null
  const stop = def.stops[step]
  const last = step === def.stops.length - 1
  const go = (s: number) => setTour({ ...tour, step: s })
  const finished = last && !playing

  return (
    <section
      aria-live="polite"
      aria-label={`Tour: ${def.title}`}
      className="panel fixed inset-x-2 bottom-9 z-20 rounded-2xl p-4 md:inset-x-auto md:bottom-6 md:left-[372px] md:w-[440px]"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800/70">
          {def.title} · {step + 1} / {def.stops.length}
        </p>
        <button
          type="button"
          aria-label="End tour"
          onClick={() => setTour(null)}
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
      <h2 className="mt-0.5 font-display text-xl leading-tight text-stone-900">{stop.title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-stone-700">{stop.text}</p>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex gap-1.5" aria-hidden>
          {def.stops.map((_, i) => (
            <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === step ? 'bg-amber-700' : 'bg-amber-900/20'}`} />
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => go(step - 1)}
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-amber-900/5 disabled:opacity-40"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => (finished ? setTour({ ...tour, step: 0, playing: true }) : setTour({ ...tour, playing: !playing }))}
            className="min-w-[4.5rem] rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-medium text-amber-50 shadow-sm hover:bg-amber-800"
          >
            {finished ? 'Replay' : playing ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            disabled={last}
            onClick={() => go(step + 1)}
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-amber-900/5 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  )
}
