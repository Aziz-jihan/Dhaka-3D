"""Build approximate neighbourhood polygons for Dhaka.

Most Dhaka neighbourhoods (Shantinagar, Kawran Bazar, ...) have no official
boundary, so we take each area's centre from OpenStreetMap place nodes
(falling back to a hand-picked point), split the city into Voronoi cells
around those centres and trim every cell to a radius around its centre.

Output: web/public/data/areas.geojson
"""
import json
import math

import shapely
from shapely.geometry import MultiPoint, Point, box, mapping
from shapely.ops import voronoi_diagram

from common import (BBOX, DATA, M_PER_DEG_LAT, M_PER_DEG_LON, WEB_DATA, norm,
                    overpass, to_m, write_json)

MAX_RADIUS_M = 1400   # trim cells so edge areas don't sprawl
MATCH_RADIUS_M = 3000  # an OSM node must be this close to our rough point


def dist_m(a, b):
    ax, ay = to_m(*a)
    bx, by = to_m(*b)
    return math.hypot(ax - bx, ay - by)


def fetch_place_nodes():
    w, s, e, n = BBOX
    q = f"""[out:json][timeout:90];
node["place"~"suburb|neighbourhood|quarter|locality|city_block"]({s - 0.02},{w - 0.02},{n + 0.02},{e + 0.02});
out;"""
    return overpass(q)


def match(seed, nodes):
    for alias in seed["aliases"]:
        key = norm(alias)
        hits = []
        for el in nodes:
            tags = el.get("tags", {})
            names = {norm(tags.get(k, "")) for k in ("name", "name:en", "alt_name", "int_name")}
            if key in names:
                pt = (el["lon"], el["lat"])
                d = dist_m(pt, seed["fallback"])
                if d <= MATCH_RADIUS_M:
                    hits.append((d, pt, tags))
        if hits:
            hits.sort(key=lambda h: h[0])
            return hits[0]
    return None


def main():
    seeds = json.loads((DATA / "areas_seed.json").read_text(encoding="utf-8"))
    nodes = fetch_place_nodes()
    print(f"OSM place nodes: {len(nodes)}")

    centres = []
    for seed in seeds:
        hit = match(seed, nodes)
        if hit:
            d, pt, tags = hit
            seed["center"] = [round(pt[0], 6), round(pt[1], 6)]
            seed["source"] = "osm"
            seed["name_bn"] = tags.get("name:bn", seed["name_bn"])
            print(f"  osm      {seed['name_en']:<14} {d:6.0f} m from rough point")
        else:
            seed["center"] = seed["fallback"]
            seed["source"] = "manual"
            print(f"  manual   {seed['name_en']}")
        centres.append(Point(*to_m(*seed["center"])))

    w, s, e, n = BBOX
    frame = box(*to_m(w, s), *to_m(e, n))
    cells = voronoi_diagram(MultiPoint(centres), envelope=frame.buffer(5000))

    features = []
    for seed, centre in zip(seeds, centres):
        cell = next(c for c in cells.geoms if c.contains(centre))
        cell = cell.intersection(centre.buffer(MAX_RADIUS_M, 32)).intersection(frame)
        cell = shapely.transform(cell.simplify(10), lambda xy: xy / [M_PER_DEG_LON, M_PER_DEG_LAT])
        features.append({
            "type": "Feature",
            "id": len(features),
            "properties": {
                "slug": seed["slug"],
                "name_en": seed["name_en"],
                "name_bn": seed["name_bn"],
                "zone": seed["zone"],
                "featured": seed["featured"],
                "center": seed["center"],
                "source": seed["source"],
            },
            "geometry": mapping(cell),
        })

    write_json(WEB_DATA / "areas.geojson", {"type": "FeatureCollection", "features": features})
    print(f"wrote {len(features)} areas -> {WEB_DATA / 'areas.geojson'}")


if __name__ == "__main__":
    main()
