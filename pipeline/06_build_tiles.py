"""Cut out/buildings.geojsonl into vector tiles and pack them as dhaka.pmtiles.

A pure-Python stand-in for tippecanoe (which has no Windows build): for the
city-sized extent here it finishes in minutes and needs no WSL or Docker.

Per zoom level small buildings are dropped and outlines simplified, so the
low-zoom tiles that cover many square kilometres stay light.

Output: web/public/data/dhaka.pmtiles (layer "buildings": h, b, src, name)
"""
import gzip
import json
import math
import os
import pickle
import time
from multiprocessing import Pool

import numpy as np
import mapbox_vector_tile
import shapely
import shapely.geometry
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import Writer

from common import M_PER_DEG_LAT, M_PER_DEG_LON, OUT, TILE_BBOX, WEB_DATA

MIN_ZOOM, MAX_ZOOM = 13, 16
EXTENT = 4096
BUFFER_PX = 16
LAYER = "buildings"
# (min footprint m², or at least this tall) to appear at a zoom; z15+ keeps everything
ZOOM_FILTER = {13: (120, 20), 14: (40, 12)}
CACHE = OUT / "buildings.pkl"

# Filled in each worker by _init
_G = {}


def lonlat_to_world(xy):
    """lon/lat -> Web Mercator in [0, 1] world units (y down)."""
    x = (xy[:, 0] + 180.0) / 360.0
    s = np.sin(np.radians(xy[:, 1]))
    y = 0.5 - np.log((1 + s) / (1 - s)) / (4 * math.pi)
    return np.column_stack([x, y])


def world_tile_range(z):
    w, s, e, n = TILE_BBOX
    corners = lonlat_to_world(np.array([[w, n], [e, s]])) * 2**z
    (x0, y0), (x1, y1) = np.floor(corners).astype(int)
    return range(x0, x1 + 1), range(y0, y1 + 1)


def prepare():
    """Parse the GeoJSON once into a compact cache the worker processes load."""
    geoms, h, b, src, names = [], [], [], [], []
    with open(OUT / "buildings.geojsonl", encoding="utf-8") as fh:
        for line in fh:
            f = json.loads(line)
            p = f["properties"]
            geoms.append(shapely.geometry.shape(f["geometry"]))
            h.append(p["h"])
            b.append(p["b"])
            src.append(p["src"])
            names.append(p.get("name", ""))
    geoms = np.array(geoms, dtype=object)
    area = shapely.area(shapely.transform(geoms, lambda xy: xy * [M_PER_DEG_LON, M_PER_DEG_LAT]))
    world = shapely.transform(geoms, lonlat_to_world)
    with open(CACHE, "wb") as fh:
        pickle.dump({"wkb": shapely.to_wkb(world), "h": np.array(h), "b": np.array(b),
                     "src": np.array(src, dtype=np.int8), "name": names, "area": area}, fh)
    return len(geoms)


def _init():
    with open(CACHE, "rb") as fh:
        d = pickle.load(fh)
    d["geom"] = shapely.from_wkb(d.pop("wkb"))
    d["tree"] = shapely.STRtree(d["geom"])
    _G.update(d)


def build_tile(zxy):
    z, x, y = zxy
    scale = 2**z
    pad = BUFFER_PX / EXTENT
    box = ((x - pad) / scale, (y - pad) / scale, (x + 1 + pad) / scale, (y + 1 + pad) / scale)
    idx = _G["tree"].query(shapely.box(*box))
    if z in ZOOM_FILTER:
        min_area, min_h = ZOOM_FILTER[z]
        idx = idx[(_G["area"][idx] >= min_area) | (_G["h"][idx] >= min_h)]
    if len(idx) == 0:
        return None
    idx.sort()

    geoms = shapely.clip_by_rect(_G["geom"][idx], *box)
    # world units -> tile pixels (y already points down)
    geoms = shapely.transform(geoms, lambda xy: (xy * scale - [x, y]) * EXTENT)
    if z < MAX_ZOOM:
        geoms = shapely.simplify(geoms, 0.5, preserve_topology=True)
    keep = ~shapely.is_empty(geoms) & (shapely.area(geoms) > 0.5)

    features = []
    for i, g in zip(idx[keep], geoms[keep]):
        props = {"h": float(_G["h"][i]), "b": float(_G["b"][i]), "src": int(_G["src"][i])}
        if _G["name"][i]:
            props["name"] = _G["name"][i]
        features.append({"geometry": g, "properties": props, "id": int(i) + 1})
    if not features:
        return None
    data = mapbox_vector_tile.encode(
        {"name": LAYER, "features": features},
        default_options={"extents": EXTENT, "y_coord_down": True},
    )
    return zxy_to_tileid(z, x, y), gzip.compress(data, 6)


def main():
    t0 = time.time()
    print(f"prepared {prepare():,} buildings ({time.time() - t0:.0f}s)")

    jobs = [(z, x, y) for z in range(MIN_ZOOM, MAX_ZOOM + 1)
            for xs, ys in [world_tile_range(z)] for x in xs for y in ys]
    print(f"{len(jobs):,} tiles to build on {os.cpu_count()} cores")

    tiles = []
    with Pool(initializer=_init) as pool:
        for n, result in enumerate(pool.imap_unordered(build_tile, jobs, chunksize=4), 1):
            if result:
                tiles.append(result)
            if n % 500 == 0:
                print(f"  {n:,}/{len(jobs):,} ({time.time() - t0:.0f}s)")
    tiles.sort()

    w, s, e, n = TILE_BBOX
    out = WEB_DATA / "dhaka.pmtiles"
    with open(out, "wb") as fh:
        writer = Writer(fh)
        for tileid, data in tiles:
            writer.write_tile(tileid, data)
        writer.finalize(
            {
                "tile_type": TileType.MVT,
                "tile_compression": Compression.GZIP,
                "min_zoom": MIN_ZOOM,
                "max_zoom": MAX_ZOOM,
                "min_lon_e7": int(w * 1e7),
                "min_lat_e7": int(s * 1e7),
                "max_lon_e7": int(e * 1e7),
                "max_lat_e7": int(n * 1e7),
                "center_zoom": 14,
                "center_lon_e7": int(90.4035 * 1e7),
                "center_lat_e7": int(23.7445 * 1e7),
            },
            {
                "name": "Dhaka 3D buildings",
                "attribution": "© OpenStreetMap contributors; Microsoft Global ML Building Footprints; GHSL (EU JRC)",
                "vector_layers": [{
                    "id": LAYER,
                    "fields": {"h": "Number", "b": "Number", "src": "Number", "name": "String"},
                    "minzoom": MIN_ZOOM,
                    "maxzoom": MAX_ZOOM,
                }],
            },
        )
    size = out.stat().st_size / 1e6
    print(f"wrote {len(tiles):,} tiles, {size:.1f} MB -> {out} ({time.time() - t0:.0f}s)")


if __name__ == "__main__":
    main()
