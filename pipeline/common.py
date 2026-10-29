"""Shared settings and helpers for the Dhaka 3D data pipeline."""
import json
import math
import re
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
WEB_DATA = ROOT.parent / "web" / "public" / "data"
RAW = ROOT / "raw"   # large downloads, git-ignored
OUT = ROOT / "out"   # intermediate and final build products, git-ignored

# Coverage area: west, south, east, north
BBOX = (90.33, 23.70, 90.47, 23.84)
# Building tileset extent: wider than BBOX so the horizon is never empty at steep
# pitch, and still inside Microsoft's zoom-9 quadkey 132022202
TILE_BBOX = (90.27, 23.66, 90.53, 23.885)

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

# Local equirectangular projection around Dhaka (metres), good enough at city scale
LAT0 = 23.77
M_PER_DEG_LAT = 110_574.0
M_PER_DEG_LON = 111_320.0 * math.cos(math.radians(LAT0))


def to_m(lon: float, lat: float) -> tuple[float, float]:
    return (lon * M_PER_DEG_LON, lat * M_PER_DEG_LAT)


def to_deg(x: float, y: float) -> tuple[float, float]:
    return (x / M_PER_DEG_LON, y / M_PER_DEG_LAT)


def overpass(query: str) -> list[dict]:
    """Run an Overpass query, trying each mirror until one answers."""
    last_err = None
    for url in OVERPASS_URLS:
        try:
            resp = requests.post(url, data={"data": query}, timeout=180,
                                 headers={"User-Agent": "dhaka-3d-pipeline/0.1"})
            resp.raise_for_status()
            return resp.json()["elements"]
        except (requests.RequestException, ValueError) as err:
            print(f"  overpass mirror failed ({url}): {err}")
            last_err = err
    raise RuntimeError("all Overpass mirrors failed") from last_err


def norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
