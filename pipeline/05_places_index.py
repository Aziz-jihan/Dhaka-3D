"""Build the search index and point layers for the web map.

* Landmarks: hand-curated list in data/landmarks.json, with positions snapped
  to the matching OpenStreetMap feature when one is found nearby.
* Roads: named major roads from OpenStreetMap, one entry per road name.
* Metro: MRT Line-6 track and stations from OpenStreetMap.

Run 04_areas.py first; its areas.geojson is folded into the search index.

Output (web/public/data): landmarks.geojson, metro.geojson, places.json
"""
import json
import math
from collections import defaultdict

from common import BBOX, DATA, WEB_DATA, norm, overpass, to_m, write_json

SNAP_RADIUS_M = 1500
ROAD_CLASSES = ["motorway", "trunk", "primary", "secondary"]


def dist_m(a, b):
    ax, ay = to_m(*a)
    bx, by = to_m(*b)
    return math.hypot(ax - bx, ay - by)


def bbox_q() -> str:
    w, s, e, n = BBOX
    return f"({s},{w},{n},{e})"


def element_point(el):
    if "center" in el:
        return (el["center"]["lon"], el["center"]["lat"])
    if "lon" in el:
        return (el["lon"], el["lat"])
    return None


def build_landmarks():
    landmarks = json.loads((DATA / "landmarks.json").read_text(encoding="utf-8"))
    names = sorted({n for lm in landmarks for n in lm["osm_names"]})
    # Exact-name lookups use Overpass' tag index; a case-insensitive regex times out
    union = "".join(f'nwr["{key}"="{n}"]{bbox_q()};' for n in names for key in ("name", "name:en"))
    elements = overpass(f"[out:json][timeout:120];({union});out center;")
    print(f"OSM features matching landmark names: {len(elements)}")

    by_name = defaultdict(list)
    for el in elements:
        pt = element_point(el)
        if pt:
            for key in ("name", "name:en"):
                if key in el["tags"]:
                    by_name[norm(el["tags"][key])].append(pt)

    features = []
    for lm in landmarks:
        candidates = [(dist_m(pt, lm["rough"]), pt) for n in lm["osm_names"] for pt in by_name[norm(n)]]
        candidates = [c for c in candidates if c[0] <= SNAP_RADIUS_M]
        if candidates:
            d, pt = min(candidates)
            source = "osm"
            print(f"  osm     {lm['name_en']:<45} snapped {d:5.0f} m to {pt}")
        else:
            pt = tuple(lm["rough"])
            source = "manual"
            print(f"  manual  {lm['name_en']}")
        features.append({
            "type": "Feature",
            "properties": {k: lm[k] for k in ("slug", "name_en", "name_bn", "kind", "blurb", "wiki")} | {"source": source},
            "geometry": {"type": "Point", "coordinates": [round(pt[0], 6), round(pt[1], 6)]},
        })
    return features


def build_roads():
    union = "".join(f'way["highway"="{c}"]["name"]{bbox_q()};' for c in ROAD_CLASSES)
    elements = overpass(f"[out:json][timeout:120];({union});out center tags;")
    groups = defaultdict(list)
    for el in elements:
        name = el["tags"]["name"].strip()
        pt = element_point(el)
        if pt:
            groups[name].append(pt)
    roads = []
    for name, pts in groups.items():
        if len(pts) < 2:
            continue
        xs, ys = zip(*pts)
        # Use the segment centre nearest to the mean so curved roads stay on the road
        mean = (sum(xs) / len(xs), sum(ys) / len(ys))
        centre = min(pts, key=lambda p: dist_m(p, mean))
        roads.append({
            "name": name,
            "center": [round(centre[0], 6), round(centre[1], 6)],
            "bounds": [round(min(xs), 6), round(min(ys), 6), round(max(xs), 6), round(max(ys), 6)],
        })
    print(f"named major roads: {len(roads)}")
    return roads


def build_metro():
    elements = overpass(
        f'[out:json][timeout:120];('
        f'way["railway"~"^(subway|light_rail)$"]{bbox_q()};'
        f'node["railway"="station"]["station"~"subway|light_rail"]{bbox_q()};'
        f'node["public_transport"="station"]["subway"="yes"]{bbox_q()};'
        f');out geom tags;'
    )
    features, seen = [], set()
    for el in elements:
        tags = el.get("tags", {})
        if el["type"] == "way":
            coords = [[round(p["lon"], 6), round(p["lat"], 6)] for p in el["geometry"]]
            features.append({"type": "Feature", "properties": {"kind": "track", "name": tags.get("name", "")},
                             "geometry": {"type": "LineString", "coordinates": coords}})
        elif el["type"] == "node" and tags.get("name") and tags["name"] not in seen:
            seen.add(tags["name"])
            features.append({"type": "Feature",
                             "properties": {"kind": "station", "name": tags["name"], "name_bn": tags.get("name:bn", "")},
                             "geometry": {"type": "Point", "coordinates": [round(el["lon"], 6), round(el["lat"], 6)]}})
    tracks = sum(f["properties"]["kind"] == "track" for f in features)
    print(f"metro: {tracks} track segments, {len(features) - tracks} stations")
    return features


def main():
    areas = json.loads((WEB_DATA / "areas.geojson").read_text(encoding="utf-8"))["features"]
    landmarks = build_landmarks()
    roads = build_roads()
    metro = build_metro()

    write_json(WEB_DATA / "landmarks.geojson", {"type": "FeatureCollection", "features": landmarks})
    write_json(WEB_DATA / "metro.geojson", {"type": "FeatureCollection", "features": metro})

    places = (
        [{"type": "area", "id": a["properties"]["slug"], "name": a["properties"]["name_en"],
          "name_bn": a["properties"]["name_bn"], "center": a["properties"]["center"]} for a in areas]
        + [{"type": "landmark", "id": f["properties"]["slug"], "name": f["properties"]["name_en"],
            "name_bn": f["properties"]["name_bn"], "center": f["geometry"]["coordinates"]} for f in landmarks]
        + [{"type": "road", "id": norm(r["name"]), "name": r["name"], "name_bn": "",
            "center": r["center"], "bounds": r["bounds"]} for r in roads]
        + [{"type": "station", "id": "mrt-" + norm(f["properties"]["name"]), "name": f["properties"]["name"] + " Metro Station",
            "name_bn": f["properties"]["name_bn"], "center": f["geometry"]["coordinates"]}
           for f in metro if f["properties"]["kind"] == "station"]
    )
    write_json(WEB_DATA / "places.json", places)
    print(f"wrote {len(places)} places -> {WEB_DATA / 'places.json'}")


if __name__ == "__main__":
    main()
