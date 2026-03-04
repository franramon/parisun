#!/usr/bin/env python3
"""
Precompute shadow data for all terraces.

For each terrace and each (azimuth, altitude) sun position,
determine if the terrace is in sun or shadow based on nearby buildings.

Fixes vs original JS version:
  - Ray direction: toward the sun (building between terrace and sun = shadow)
  - Distance: computed at actual ray-edge intersection point, not building centroid
  - Lat/lon to meters: accounts for cos(latitude) on longitude axis
  - Shadow factor: binary per sample point, averaged across terrace footprint
  - Perf: tile LRU cache, buildings grouped by tile, numpy vectorized intersection
"""

import json
import math
import os
import sys
import time
from functools import lru_cache
from pathlib import Path

import numpy as np

# ---------------------------------------------------------------------------
# Config - adjust paths to match your project layout
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).parent
PUBLIC_DIR = SCRIPT_DIR / ".." / "public"
BUILDINGS_DIR = PUBLIC_DIR / "buildings"
TERRACES_PATH = PUBLIC_DIR / "terraces-data.geojson"
OUTPUT_PATH = PUBLIC_DIR / "shadow-data.json"

AZIMUTHS = list(range(0, 360, 15))   # 24 values, degrees from north clockwise
ALTITUDES = list(range(5, 75, 5))     # 14 values, degrees above horizon

# Paris ~48.86°N
PARIS_LAT_RAD = math.radians(48.86)
DEG_TO_M_LAT = 111_000.0
DEG_TO_M_LNG = 111_000.0 * math.cos(PARIS_LAT_RAD)

# Minimum terrace dimension (m) in both axes to enable multi-point sampling
MULTIPOINT_THRESHOLD = 4.0

# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def load_terraces(path: Path) -> list[dict]:
    with open(path) as f:
        data = json.load(f)
    out = []
    for i, feat in enumerate(data["features"]):
        lng, lat = feat["geometry"]["coordinates"]
        props = feat.get("properties") or {}
        out.append({
            "id": i,
            "lng": lng,
            "lat": lat,
            "longueur": props.get("longueur") or 0,
            "largeur": props.get("largeur") or 0,
        })
    return out


def load_building_index(path: Path) -> dict:
    with open(path) as f:
        return json.load(f)


@lru_cache(maxsize=512)
def _load_tile(tile_path: str):
    p = Path(tile_path)
    if not p.exists():
        return None
    with open(p) as f:
        return json.load(f)


def get_tile_key(lng: float, lat: float, index: dict) -> str:
    b = index["bounds"]
    ts = index["tileSize"]
    x = int((lng - b["minLng"]) / ts)
    y = int((lat - b["minLat"]) / ts)
    return f"{x}_{y}"


def load_buildings_for_tile_group(
    tile_key: str, index: dict, radius: int = 1
) -> list[dict]:
    """Load buildings from tiles in a neighbourhood around tile_key."""
    cx, cy = map(int, tile_key.split("_"))
    valid = {t["key"] for t in index["tiles"]}
    buildings = []
    for dx in range(-radius, radius + 1):
        for dy in range(-radius, radius + 1):
            k = f"{cx + dx}_{cy + dy}"
            if k not in valid:
                continue
            tile = _load_tile(str(BUILDINGS_DIR / f"{k}.json"))
            if tile and "features" in tile:
                buildings.extend(tile["features"])
    return buildings


# ---------------------------------------------------------------------------
# Geometry extraction
# ---------------------------------------------------------------------------

def extract_edges(buildings: list[dict]):
    """
    Returns (edges_a, edges_b, heights):
      edges_a: (N, 2) start points [lng, lat]
      edges_b: (N, 2) end points [lng, lat]
      heights: (N,) building heights in meters
    Returns (None, None, None) if no valid edges.
    """
    a_list, b_list, h_list = [], [], []

    for bld in buildings:
        geom = bld.get("geometry")
        if not geom:
            continue
        height = ((bld.get("properties") or {}).get("height") or 0)
        if height <= 0:
            continue

        coords = geom["coordinates"]
        polygons = [coords] if geom["type"] == "Polygon" else coords

        for polygon in polygons:
            ring = polygon[0]
            for i in range(len(ring) - 1):
                a_list.append(ring[i])
                b_list.append(ring[i + 1])
                h_list.append(height)

    if not a_list:
        return None, None, None

    return (
        np.array(a_list, dtype=np.float64),
        np.array(b_list, dtype=np.float64),
        np.array(h_list, dtype=np.float64),
    )


# ---------------------------------------------------------------------------
# Shadow computation (vectorized)
# ---------------------------------------------------------------------------

def compute_shadows_for_point(
    px: float,
    py: float,
    edges_a: np.ndarray,
    edges_b: np.ndarray,
    heights: np.ndarray,
    AB: np.ndarray,
    D_all: np.ndarray,
    tan_alts: np.ndarray,
) -> np.ndarray:
    """
    Compute shadow grid for a single point.
    Returns (n_alt, n_az) array of 0/1 (1 = sun, 0 = shadow).
    """
    n_alt = len(tan_alts)
    n_az = len(AZIMUTHS)

    # Pre-filter edges by max shadow distance
    # Max shadow = height / tan(min_altitude). Use edge midpoint for distance.
    mid = (edges_a + edges_b) * 0.5
    dx_deg = mid[:, 0] - px
    dy_deg = mid[:, 1] - py
    dist_deg_sq = dx_deg ** 2 + dy_deg ** 2
    max_shadow_deg = heights / tan_alts[0] / DEG_TO_M_LAT  # conservative
    mask = dist_deg_sq < (max_shadow_deg * 1.5) ** 2

    if not np.any(mask):
        return np.ones((n_alt, n_az), dtype=np.float32)

    ea = edges_a[mask]
    ab = AB[mask]
    h = heights[mask]

    P = np.array([px, py])
    PA = ea - P  # (M, 2)
    cross_PA_AB = PA[:, 0] * ab[:, 1] - PA[:, 1] * ab[:, 0]

    grid = np.ones((n_alt, n_az), dtype=np.float32)

    for az_idx in range(n_az):
        D = D_all[az_idx]

        # Vectorized ray-segment intersection
        # Ray: P + t*D (t >= 0)
        # Segment: A + s*AB (0 <= s <= 1)
        # t = cross(PA, AB) / cross(D, AB)
        # s = cross(PA, D)  / cross(D, AB)
        cross_D_AB = D[0] * ab[:, 1] - D[1] * ab[:, 0]

        parallel = np.abs(cross_D_AB) < 1e-12
        denom = np.where(parallel, 1.0, cross_D_AB)

        t = cross_PA_AB / denom
        s = (PA[:, 0] * D[1] - PA[:, 1] * D[0]) / denom

        hit = (~parallel) & (t > 1e-9) & (s >= 0) & (s <= 1)

        if not np.any(hit):
            continue

        # Distance in meters at each hit point
        t_hit = t[hit]
        h_hit = h[hit]
        dx_m = t_hit * D[0] * DEG_TO_M_LNG
        dy_m = t_hit * D[1] * DEG_TO_M_LAT
        dist_m = np.sqrt(dx_m ** 2 + dy_m ** 2)

        # Vectorized altitude check: (n_hit, n_alt)
        shadow_len = h_hit[:, None] / tan_alts[None, :]
        in_shadow = np.any(dist_m[:, None] < shadow_len, axis=0)  # (n_alt,)
        grid[:, az_idx] = np.where(in_shadow, 0.0, 1.0)

    return grid


def compute_terrace_shadows(
    terrace: dict,
    edges_a: np.ndarray,
    edges_b: np.ndarray,
    heights: np.ndarray,
    AB: np.ndarray,
    D_all: np.ndarray,
    tan_alts: np.ndarray,
) -> list[list[int]] | None:
    """
    Returns 2D list [alt_idx][az_idx] of 0..100 (100 = full sun).
    None means no nearby buildings (always sunny).
    """
    if edges_a is None:
        return None

    lng, lat = terrace["lng"], terrace["lat"]
    longueur = terrace.get("longueur") or 0
    largeur = terrace.get("largeur") or 0

    # Sample points on the terrace footprint
    points = [(lng, lat)]
    if longueur >= MULTIPOINT_THRESHOLD and largeur >= MULTIPOINT_THRESHOLD:
        dl = (longueur / 2 * 0.6) / DEG_TO_M_LNG
        dw = (largeur / 2 * 0.6) / DEG_TO_M_LAT
        points += [
            (lng + dl, lat + dw),
            (lng + dl, lat - dw),
            (lng - dl, lat + dw),
            (lng - dl, lat - dw),
        ]

    grids = [
        compute_shadows_for_point(
            px, py, edges_a, edges_b, heights, AB, D_all, tan_alts
        )
        for px, py in points
    ]

    avg = np.mean(grids, axis=0)
    return (np.round(avg * 100)).astype(int).tolist()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    t0 = time.time()

    # Allow overriding paths via env vars
    global PUBLIC_DIR, BUILDINGS_DIR, TERRACES_PATH, OUTPUT_PATH
    if "PUBLIC_DIR" in os.environ:
        PUBLIC_DIR = Path(os.environ["PUBLIC_DIR"])
        BUILDINGS_DIR = PUBLIC_DIR / "buildings"
        TERRACES_PATH = PUBLIC_DIR / "terraces-data.geojson"
        OUTPUT_PATH = PUBLIC_DIR / "shadow-data.json"

    print("Loading terraces...")
    terraces = load_terraces(TERRACES_PATH)
    print(f"  {len(terraces)} terraces")

    print("Loading building index...")
    bindex = load_building_index(BUILDINGS_DIR / "index.json")
    print(f"  {len(bindex['tiles'])} tiles")

    print(f"Grid: {len(AZIMUTHS)} az x {len(ALTITUDES)} alt = "
          f"{len(AZIMUTHS) * len(ALTITUDES)} positions per terrace")

    # Precompute sun direction vectors and tan(altitude)
    az_rads = np.array([math.radians(a) for a in AZIMUTHS])
    D_all = np.stack([np.sin(az_rads), np.cos(az_rads)], axis=1)  # (n_az, 2)
    tan_alts = np.array([math.tan(math.radians(a)) for a in ALTITUDES])

    # Group terraces by tile key to share building data
    tile_groups: dict[str, list[dict]] = {}
    for t in terraces:
        k = get_tile_key(t["lng"], t["lat"], bindex)
        tile_groups.setdefault(k, []).append(t)

    print(f"  {len(tile_groups)} tile groups")

    results = [None] * len(terraces)
    done = 0

    for tile_key, group in tile_groups.items():
        buildings = load_buildings_for_tile_group(tile_key, bindex, radius=1)
        edges_a, edges_b, heights = extract_edges(buildings)

        # Precompute edge vectors once per group
        AB = (edges_b - edges_a) if edges_a is not None else None

        for terrace in group:
            shadows = compute_terrace_shadows(
                terrace, edges_a, edges_b, heights, AB, D_all, tan_alts
            )
            results[terrace["id"]] = {"id": terrace["id"], "shadows": shadows}
            done += 1

        if done % 1000 < len(group) or done == len(terraces):
            elapsed = time.time() - t0
            rate = done / elapsed if elapsed > 0 else 0
            eta = (len(terraces) - done) / rate if rate > 0 else 0
            print(f"  {done}/{len(terraces)} "
                  f"({done * 100 // len(terraces)}%) "
                  f"{rate:.0f} t/s  ETA {eta:.0f}s")

    output = {
        "azimuths": AZIMUTHS,
        "altitudes": ALTITUDES,
        "terraces": results,
    }

    print("Saving...")
    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f)

    size_mb = os.path.getsize(OUTPUT_PATH) / (1024 * 1024)
    total = time.time() - t0
    print(f"Done in {total:.1f}s  ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()