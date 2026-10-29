"""Give every building in the tileset extent a height.

Height for each OpenStreetMap building, first rule that applies:
  1. data/height_overrides.csv (hand-checked towers)
  2. OSM `height` tag
  3. OSM `building:levels` x 3.2 m
  4. GHSL average net building height of the ~90 m cell the building sits in,
     varied a little per building so blocks don't come out flat-topped
  5. an estimate from footprint size (cells GHSL sees as unbuilt)

Microsoft ML footprints that no OSM building covers are added as extra
buildings (heights from rules 4-5), so areas OSM mappers have not reached
still get a skyline.

Output: out/buildings.geojsonl with h (height m), b (base m), src, name, name_bn
"""
import csv
import gzip
import json
import re

import numpy as np
import rasterio
import rasterio.windows
import shapely
import shapely.geometry

from common import DATA, M_PER_DEG_LAT, M_PER_DEG_LON, OUT, RAW, TILE_BBOX

FLOOR_M = 3.2
MIN_H, MAX_H = 3.0, 250.0
OSM_COVER_MIN = 0.3   # an ML footprint this covered by OSM buildings is a duplicate
ML_MIN_AREA_M2 = 12   # drop tiny ML artefacts
SHED_M2 = 30          # footprints this small are sheds and kiosks whatever the area's height
SHED_MAX_H = 4.5
GHSL_JITTER = 0.2     # +/- share of the cell height, deterministic per building

# Height source codes kept in the tiles (short, to keep tiles small)
SRC_OVERRIDE, SRC_OSM_HEIGHT, SRC_OSM_LEVELS, SRC_GHSL, SRC_ESTIMATE = range(5)


def parse_metres(value: str | None) -> float | None:
    """'12', '12 m', '12.5m', '40 ft', '40\'' -> metres"""
    if not value:
        return None
    m = re.match(r"\s*([0-9]+(?:[.,][0-9]+)?)\s*(m|meters?|metres?|ft|feet|')?\s*$", value.lower())
    if not m:
        return None
    num = float(m.group(1).replace(",", "."))
    return num * 0.3048 if m.group(2) in ("ft", "feet", "'") else num


def parse_levels(value: str | None) -> float | None:
    if not value:
        return None
    m = re.match(r"\s*([0-9]+(?:\.[0-9]+)?)", value)
    return float(m.group(1)) if m else None


def estimate_from_footprint(area_m2: float) -> float:
    """Typical Dhaka stock: small plots are 1-3 storeys, mid plots 5-6 storey walk-ups."""
    if area_m2 < 40:
        return 4.0
    if area_m2 < 120:
        return 9.0
    if area_m2 < 400:
        return 16.0
    return 13.0  # very large footprints are mostly factories, sheds and markets


def to_metres(geoms):
    """Local metric projection for area and overlap maths."""
    return shapely.transform(geoms, lambda xy: xy * [M_PER_DEG_LON, M_PER_DEG_LAT])


def load_overrides() -> dict[str, float]:
    path = DATA / "height_overrides.csv"
    if not path.exists():
        return {}
    with open(path, encoding="utf-8") as fh:
        rows = csv.DictReader(line for line in fh if not line.startswith("#"))
        return {r["osm_id"].strip(): float(r["height_m"]) for r in rows if r.get("osm_id")}


def load_osm():
    props, geoms = [], []
    with open(OUT / "osm_buildings.geojsonl", encoding="utf-8") as fh:
        for line in fh:
            f = json.loads(line)
            props.append(f["properties"])
            geoms.append(shapely.geometry.shape(f["geometry"]))
    return props, shapely.make_valid(np.array(geoms, dtype=object))


def load_ml():
    w, s, e, n = TILE_BBOX
    geoms = []
    for path in sorted((RAW / "ms").glob("*.geojsonl.gz")):
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            for line in fh:
                f = json.loads(line)
                lon, lat = f["geometry"]["coordinates"][0][0]
                if w <= lon <= e and s <= lat <= n:
                    geoms.append(shapely.geometry.shape(f["geometry"]))
    return shapely.make_valid(np.array(geoms, dtype=object))


def sample_ghsl(points) -> np.ndarray:
    """GHSL net building height (m) at each point; 0 where GHSL sees nothing built."""
    tif = next((RAW / "ghsl").glob("*.tif"))
    coords = shapely.get_coordinates(points)
    with rasterio.open(tif) as src:
        # Read just the extent once and index it, much faster than src.sample per point
        window = rasterio.windows.from_bounds(*TILE_BBOX, transform=src.transform).round_offsets().round_lengths()
        grid = src.read(1, window=window).astype(float)
        inv = ~src.window_transform(window)
    cols, rows = inv * (coords[:, 0], coords[:, 1])
    rows = np.clip(np.floor(rows).astype(int), 0, grid.shape[0] - 1)
    cols = np.clip(np.floor(cols).astype(int), 0, grid.shape[1] - 1)
    return np.nan_to_num(grid[rows, cols], nan=0.0)


def ghsl_heights(cell_h: np.ndarray, area_m2: np.ndarray, seed_ids: np.ndarray) -> np.ndarray:
    """Turn cell averages into per-building heights."""
    rng = np.random.default_rng(seed_ids)  # same input -> same city every build
    jitter = 1 + GHSL_JITTER * (2 * rng.random(len(cell_h)) - 1)
    h = cell_h * jitter
    return np.where(area_m2 < SHED_M2, np.minimum(h, SHED_MAX_H), h)


def polygonal(geom):
    """Keep only polygon parts (make_valid can return collections)."""
    if geom.geom_type in ("Polygon", "MultiPolygon"):
        return geom
    parts = [g for g in getattr(geom, "geoms", []) if g.geom_type == "Polygon"]
    return shapely.geometry.MultiPolygon(parts) if parts else None


def main():
    overrides = load_overrides()
    osm_props, osm_geoms = load_osm()
    print(f"OSM buildings: {len(osm_props):,}")
    ml_geoms = load_ml()
    print(f"ML footprints in extent: {len(ml_geoms):,}")

    osm_m = to_metres(osm_geoms)
    ml_m = to_metres(ml_geoms)
    osm_area = shapely.area(osm_m)
    ml_area = shapely.area(ml_m)

    # How much of each ML footprint OSM already covers, to find ML-only buildings
    osm_idx, ml_idx = shapely.STRtree(ml_m).query(osm_m, predicate="intersects")
    overlap = shapely.area(shapely.intersection(osm_m[osm_idx], ml_m[ml_idx]))
    ml_covered = np.zeros(len(ml_geoms))
    np.add.at(ml_covered, ml_idx, overlap)
    ml_only = np.flatnonzero((ml_covered < OSM_COVER_MIN * ml_area) & (ml_area >= ML_MIN_AREA_M2))
    print(f"ML footprints missing from OSM: {len(ml_only):,}")

    osm_cell = sample_ghsl(shapely.point_on_surface(osm_geoms))
    osm_ghsl = ghsl_heights(osm_cell, osm_area, 1)
    ml_cell = sample_ghsl(shapely.point_on_surface(ml_geoms[ml_only]))
    ml_ghsl = ghsl_heights(ml_cell, ml_area[ml_only], 2)

    counts = np.zeros(5, dtype=int)
    ml_added = 0
    OUT.mkdir(exist_ok=True)
    with open(OUT / "buildings.geojsonl", "w", encoding="utf-8") as fh:

        def emit(geom, h, b, src, name="", name_bn=""):
            h = float(np.clip(h, MIN_H, MAX_H))
            b = float(np.clip(b, 0, h - 1))
            props = {"h": round(h, 1), "b": round(b, 1), "src": src}
            if name:
                props["name"] = name
            if name_bn:
                props["name_bn"] = name_bn
            fh.write(json.dumps({"type": "Feature", "properties": props,
                                 "geometry": shapely.geometry.mapping(geom)}, ensure_ascii=False) + "\n")
            counts[src] += 1

        for i, p in enumerate(osm_props):
            geom = polygonal(osm_geoms[i])
            if geom is None:
                continue
            base = parse_metres(p.get("min_height")) or (parse_levels(p.get("building:min_level")) or 0) * FLOOR_M
            if p["osm_id"] in overrides:
                h, src = overrides[p["osm_id"]], SRC_OVERRIDE
            elif (h := parse_metres(p.get("height"))) is not None:
                src = SRC_OSM_HEIGHT
            elif (lv := parse_levels(p.get("building:levels"))) is not None:
                h, src = lv * FLOOR_M, SRC_OSM_LEVELS  # levels count from the ground
            elif osm_cell[i] > 0:
                h, src = osm_ghsl[i], SRC_GHSL
            else:
                h, src = estimate_from_footprint(osm_area[i]), SRC_ESTIMATE
            emit(geom, h, base, src, p.get("name", ""), p.get("name:bn", ""))

        for k, j in enumerate(ml_only):
            geom = polygonal(ml_geoms[j])
            if geom is None:
                continue
            if ml_cell[k] > 0:
                emit(geom, ml_ghsl[k], 0, SRC_GHSL)
            else:
                emit(geom, estimate_from_footprint(ml_area[j]), 0, SRC_ESTIMATE)
            ml_added += 1

    labels = ["override", "OSM height", "OSM levels", "GHSL area height", "footprint estimate"]
    for label, c in zip(labels, counts):
        print(f"  {label:<20} {c:>9,}")
    print(f"wrote {counts.sum():,} buildings ({ml_added:,} footprints from Microsoft) -> {OUT / 'buildings.geojsonl'}")


if __name__ == "__main__":
    main()
