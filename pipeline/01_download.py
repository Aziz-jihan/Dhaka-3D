"""Download the raw inputs for the building tileset into pipeline/raw/.

* OpenStreetMap extract for Bangladesh (Geofabrik)
* Microsoft Global ML Building Footprints for the zoom-9 quadkeys that cover
  the building tileset extent (fills footprints OSM is missing; it has no
  height estimates for Dhaka)
* GHSL average net building height (EU JRC, 2018, ~90 m grid), the height
  source for buildings OSM gives no height or levels for

Files that already exist are skipped, so re-running is cheap.
"""
import csv
import io
import math
import zipfile

import requests

from common import RAW, TILE_BBOX

GEOFABRIK_PBF = "https://download.geofabrik.de/asia/bangladesh-latest.osm.pbf"
MS_LINKS = "https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv"
MS_REGION = "Bangladesh"
QUADKEY_ZOOM = 9
GHSL_PRODUCT = "GHS_BUILT_H_ANBH_E2018_GLOBE_R2023A_4326_3ss_V1_0"
GHSL_TILES = ("https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_BUILT_H_GLOBE_R2023A/"
              "GHS_BUILT_H_ANBH_E2018_GLOBE_R2023A_4326_3ss/V1-0/tiles")


def quadkey(lon: float, lat: float, z: int) -> str:
    x = int((lon + 180) / 360 * 2**z)
    s = math.sin(math.radians(lat))
    y = int((0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * 2**z)
    return "".join(str(((x >> i) & 1) + 2 * ((y >> i) & 1)) for i in range(z - 1, -1, -1))


def bbox_quadkeys() -> set[str]:
    w, s, e, n = TILE_BBOX
    return {quadkey(lon, lat, QUADKEY_ZOOM) for lon in (w, e) for lat in (s, n)}


def download(url: str, dest) -> None:
    if dest.exists():
        print(f"  have     {dest.name}")
        return
    print(f"  fetching {url}")
    tmp = dest.with_suffix(dest.suffix + ".part")
    with requests.get(url, stream=True, timeout=120) as resp:
        resp.raise_for_status()
        total = int(resp.headers.get("content-length", 0))
        done = 0
        with open(tmp, "wb") as fh:
            for chunk in resp.iter_content(chunk_size=1 << 20):
                fh.write(chunk)
                done += len(chunk)
                if total and done % (25 << 20) < (1 << 20):
                    print(f"           {done / total:5.0%} of {total / 1e6:.0f} MB")
    tmp.rename(dest)


def main():
    RAW.mkdir(exist_ok=True)
    download(GEOFABRIK_PBF, RAW / "bangladesh-latest.osm.pbf")

    wanted = bbox_quadkeys()
    links = requests.get(MS_LINKS, timeout=120).text
    rows = [r for r in csv.DictReader(io.StringIO(links)) if r["Location"] == MS_REGION and r["QuadKey"] in wanted]
    missing = wanted - {r["QuadKey"] for r in rows}
    if missing:
        print(f"  no Microsoft data for quadkeys {sorted(missing)}")
    ms_dir = RAW / "ms"
    ms_dir.mkdir(exist_ok=True)
    for r in rows:
        download(r["Url"], ms_dir / f"{r['QuadKey']}.geojsonl.gz")

    ghsl_dir = RAW / "ghsl"
    ghsl_dir.mkdir(exist_ok=True)
    for tile in ghsl_tiles():
        zip_path = ghsl_dir / f"{tile}.zip"
        download(f"{GHSL_TILES}/{GHSL_PRODUCT}_{tile}.zip", zip_path)
        with zipfile.ZipFile(zip_path) as zf:
            for name in zf.namelist():
                if name.endswith(".tif") and not (ghsl_dir / name).exists():
                    zf.extract(name, ghsl_dir)


def ghsl_tiles() -> set[str]:
    """GHSL 4326 tiles are 10x10 degrees, rows counted from 90N, columns from 180W."""
    w, s, e, n = TILE_BBOX
    return {f"R{int((90 - lat) // 10) + 1}_C{int((lon + 180) // 10) + 1}" for lon in (w, e) for lat in (s, n)}


if __name__ == "__main__":
    main()
