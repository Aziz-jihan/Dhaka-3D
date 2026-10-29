"""Extract OpenStreetMap buildings inside the tileset extent.

Reads raw/bangladesh-latest.osm.pbf, assembles building ways and multipolygon
relations into areas, keeps those inside TILE_BBOX and writes them with their
height-related tags to out/osm_buildings.geojsonl (one feature per line).
"""
import json

import osmium
import shapely
import shapely.geometry

from common import OUT, RAW, TILE_BBOX

KEEP_TAGS = ("building", "height", "min_height", "building:levels", "building:min_level", "name", "name:bn")


def main():
    w, s, e, n = TILE_BBOX
    wkb = osmium.geom.WKBFactory()
    OUT.mkdir(exist_ok=True)
    kept = seen = 0

    with open(OUT / "osm_buildings.geojsonl", "w", encoding="utf-8") as fh:
        processor = (
            osmium.FileProcessor(RAW / "bangladesh-latest.osm.pbf")
            .with_areas(osmium.filter.KeyFilter("building"))
            .with_filter(osmium.filter.KeyFilter("building"))
        )
        for obj in processor:
            if not obj.is_area():
                continue
            seen += 1
            # Cheap reject on the first node before building the full geometry
            ring = next(iter(obj.outer_rings()), None)
            first = next(iter(ring), None) if ring is not None else None
            if first is None or not (w <= first.lon <= e and s <= first.lat <= n):
                continue
            try:
                geom = shapely.from_wkb(wkb.create_multipolygon(obj))
            except (osmium.InvalidLocationError, RuntimeError, shapely.errors.GEOSException):
                continue
            tags = {k: obj.tags[k] for k in KEEP_TAGS if k in obj.tags}
            # Areas from ways have even ids, from relations odd ids
            osm_id = f"{'w' if obj.from_way() else 'r'}{obj.orig_id()}"
            geom = geom.geoms[0] if len(geom.geoms) == 1 else geom
            fh.write(json.dumps({
                "type": "Feature",
                "properties": {"osm_id": osm_id, **tags},
                "geometry": shapely.geometry.mapping(geom),
            }, ensure_ascii=False) + "\n")
            kept += 1
            if kept % 50_000 == 0:
                print(f"  {kept:,} buildings kept ({seen:,} scanned)")

    print(f"kept {kept:,} of {seen:,} OSM buildings -> {OUT / 'osm_buildings.geojsonl'}")


if __name__ == "__main__":
    main()
