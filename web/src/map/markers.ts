import maplibregl, { type Map as MlMap, type Marker } from 'maplibre-gl'
import type { Lang } from '../store'
import type { CityData, Selection } from '../types'

/**
 * Area names and landmarks are HTML markers rather than map symbols:
 * MapLibre's glyph renderer cannot shape Bangla conjuncts, the browser can.
 */
export class CityMarkers {
  private areaMarkers: { slug: string; el: HTMLElement; marker: Marker; en: string; bn: string }[] = []
  private landmarkMarkers: { slug: string; el: HTMLElement; marker: Marker; en: string; bn: string }[] = []

  constructor(map: MlMap, data: CityData, onSelect: (sel: Selection) => void) {
    for (const f of data.areas.features) {
      const { slug, name_en, name_bn, featured, center } = f.properties
      const el = document.createElement('button')
      el.className = `area-label${featured ? '' : ' area-label--minor'}`
      el.type = 'button'
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        onSelect({ type: 'area', slug })
      })
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(center).addTo(map)
      this.areaMarkers.push({ slug, el, marker, en: name_en, bn: name_bn })
    }

    for (const f of data.landmarks.features) {
      const { slug, name_en, name_bn, kind } = f.properties
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'landmark-pin'
      el.dataset.kind = kind
      el.innerHTML = '<span class="landmark-pin__dot"></span><span class="landmark-pin__name"></span>'
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        onSelect({ type: 'landmark', slug })
      })
      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat(f.geometry.coordinates as [number, number])
        .addTo(map)
      this.landmarkMarkers.push({ slug, el, marker, en: name_en, bn: name_bn })
    }
  }

  setLang(lang: Lang) {
    for (const m of this.areaMarkers) {
      m.el.textContent = lang === 'bn' ? m.bn : m.en
      m.el.lang = lang
    }
    for (const m of this.landmarkMarkers) {
      const name = m.el.querySelector('.landmark-pin__name') as HTMLElement
      name.textContent = lang === 'bn' ? m.bn : m.en
      m.el.setAttribute('aria-label', m.en)
      m.el.lang = lang
    }
  }

  setVisible(kind: 'areas' | 'landmarks', visible: boolean) {
    const list = kind === 'areas' ? this.areaMarkers : this.landmarkMarkers
    for (const m of list) m.el.style.display = visible ? '' : 'none'
  }

  setSelected(sel: Selection | null) {
    for (const m of this.areaMarkers) m.el.classList.toggle('is-selected', sel?.type === 'area' && sel.slug === m.slug)
    for (const m of this.landmarkMarkers)
      m.el.classList.toggle('is-selected', sel?.type === 'landmark' && sel.slug === m.slug)
  }

  remove() {
    for (const m of [...this.areaMarkers, ...this.landmarkMarkers]) m.marker.remove()
  }
}
