import { useEffect, useState } from 'react'
import MapView from './map/MapView'
import Sidebar from './components/Sidebar'
import InfoPanel from './components/InfoPanel'
import MapControls from './components/MapControls'
import { loadCityData } from './lib/data'
import { useApp } from './store'

export default function App() {
  const setData = useApp((s) => s.setData)
  const ready = useApp((s) => s.ready)
  const lightMode = useApp((s) => s.lightMode)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadCityData().then(setData, (e: Error) => setError(e.message))
  }, [setData])

  return (
    <div className={`fixed inset-0 overflow-hidden mode-${lightMode}`}>
      <MapView />
      {/* Warm sun glow and vignette layered over the canvas */}
      <div className="atmosphere pointer-events-none absolute inset-0" aria-hidden />
      <Sidebar />
      <MapControls />
      <InfoPanel />
      <div
        className={`loading pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center transition-opacity duration-700 ${
          ready ? 'opacity-0' : 'opacity-100'
        }`}
        aria-hidden={ready}
      >
        <p className="font-display text-3xl text-amber-950">
          Dhaka <span className="text-amber-700">3D</span>
        </p>
        <p className="mt-2 text-sm text-amber-900/70">{error ?? 'Waiting for the sun to set…'}</p>
      </div>
    </div>
  )
}
