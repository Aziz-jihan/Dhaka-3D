# Dhaka 3D

An explorable 3D map of central Dhaka (Motijheel, Shahbag, Shantinagar, Badda, Gulshan, Old Dhaka and more), lit at golden hour by default.

- **web/**: the website (Vite + React + TypeScript + Tailwind + MapLibre GL JS)
- **pipeline/**: Python scripts that build the neighbourhood, landmark, metro and search data from OpenStreetMap

## Run it

```bash
cd web
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in web/dist
```

### Build the data

The small files (areas, landmarks, metro, search index) are committed in `web/public/data`. The building tileset `dhaka.pmtiles` is too big for git, so build it once before running the site:

```bash
cd pipeline
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt    # Linux/macOS: .venv/bin/pip
.venv/Scripts/python 01_download.py               # ~470 MB into pipeline/raw/
.venv/Scripts/python 02_extract_osm.py            # OSM buildings in the Dhaka extent (~5 min)
.venv/Scripts/python 03_heights.py                # heights for every building (~5 min)
.venv/Scripts/python 06_build_tiles.py            # -> web/public/data/dhaka.pmtiles
.venv/Scripts/python 04_areas.py                  # -> areas.geojson
.venv/Scripts/python 05_places_index.py           # -> landmarks.geojson, metro.geojson, places.json
```

Steps 04 and 05 query the public Overpass API and fall back across mirrors; if all are busy, try again later.

In production, upload `dhaka.pmtiles` to any host that supports HTTP range requests (e.g. Cloudflare R2) and set `VITE_BUILDINGS_URL` (see `web/.env.example`).

## How it works

| Piece | Where |
|---|---|
| 3D buildings | Own tileset `dhaka.pmtiles` (pipeline steps 01–03, 06): OSM footprints + Microsoft ML footprints OSM is missing; heights from OSM `height` / `building:levels`, else the GHSL average building height of the ~90 m block |
| Roads, water, parks | OpenFreeMap vector tiles (OpenStreetMap data, OpenMapTiles schema) |
| Golden hour / day / night lighting | `web/src/map/lighting.ts`: sun position and colour, sky, horizon haze, palette |
| Map style | `web/src/map/style.ts` |
| Neighbourhood outlines | `pipeline/04_areas.py`: OSM place nodes → Voronoi cells trimmed to 1.4 km (approximate: most areas have no official boundary) |
| Landmarks, roads, MRT Line 6 | `pipeline/05_places_index.py` + hand-curated `pipeline/data/landmarks.json` |
| Area / landmark labels | HTML markers, so Bangla conjuncts render correctly (`web/src/map/markers.ts`) |

Shareable links: the camera is kept in the URL hash (`#map=zoom/lat/lng/bearing/pitch`) and the selected area or landmark in `?place=<slug>`.

## Checklist status

### Phase 0: Setup
- [x] Node, Python, Git available (tippecanoe replaced by a pure-Python tiler: it has no Windows build and WSL needs `sudo` to install it)
- [x] `git init`, `web/` and `pipeline/` folders
- [x] Vite + React + TypeScript + Tailwind + MapLibre + PMTiles + Zustand + Fuse.js
- [x] 3D map of Dhaka on a free basemap

### Phase 1: Data pipeline
- [x] Neighbourhood polygons for every area in scope (36 of 38 centres snapped to OSM; Panthapath and Sadarghat hand-placed)
- [x] Landmarks snapped to OSM positions (16 of 20), with Bangla names, blurbs and Wikipedia links
- [x] Search index: areas, landmarks, 189 named major roads, 13 MRT stations
- [x] MRT Line 6 track and stations
- [x] Own building tileset `dhaka.pmtiles` (47 MB, zoom 13–16) covering lon 90.27–90.53, lat 23.66–23.885: 871,053 buildings
  - 732,898 OSM footprints + 138,155 Microsoft ML footprints that OSM is missing
  - heights: 660 OSM `height`, 29,149 OSM `building:levels`, 837,262 GHSL block average (±20% per building), 3,982 size-based estimate
  - Microsoft's dataset has no height estimates for Dhaka and Google Open Buildings 2.5D needs Earth Engine, so GHSL (EU JRC, free download) is the height source
- [x] `height_overrides.csv` in place (empty: add hand-checked towers as `osm_id,height_m,note`)

### Phase 2: Core 3D map
- [x] Style: water, parks, roads by class, rail, metro, area outlines, 3D buildings, road and water labels
- [x] Golden hour lighting as the default (low warm sun, amber sky and haze, warm palette, glow overlay)
- [x] Day and night variants
- [x] Hover and click buildings → highlight plus name, height, floors, area and where the height came from
- [x] Navigation, pitch and rotate, reset view, orbit
- [ ] Self-hosted glyphs (labels use HTML markers for Bangla instead)

### Phase 3: UI and interaction
- [x] Sidebar of neighbourhoods by zone → fly to and highlight
- [x] Fuzzy search with keyboard navigation
- [x] Info panel for areas (nearby landmarks), landmarks, buildings, roads and stations
- [x] Layer toggles
- [x] Bangla / English toggle
- [x] Shareable URLs
- [x] Mobile bottom sheet
- [x] Loading screen and attribution

### Phase 4: Landmarks and visuals
- [ ] glTF landmark models (deck.gl `ScenegraphLayer`)
- [ ] Animated metro train
- [ ] Guided tours
- [ ] Night window glow

### Phase 5: Performance, QA and deploy
- [x] Production build; MapLibre split into its own cached chunk
- [ ] Playwright smoke tests
- [ ] Lighthouse pass and cross-browser checks (Safari iOS, Android)
- [ ] Deploy to Cloudflare Pages + `dhaka.pmtiles` on R2 (set `VITE_BUILDINGS_URL`)

## Attribution

Map data © OpenStreetMap contributors (ODbL). Tiles by OpenFreeMap, schema © OpenMapTiles.
