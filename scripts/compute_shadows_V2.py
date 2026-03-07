#!/usr/bin/env python3
"""
Precompute shadow data for all terraces — V2.

Improvements over V1:
  1. Local tangent plane projection (all geometry in meters, no cos(lat) approximation)
  2. KDTree for O(log N) edge spatial lookup instead of brute-force distance filter
  3. Point-in-polygon exclusion: terrace inside a building footprint is not
     shadowed by that building's own walls
  4. Penumbra (partial shadow) via Monte Carlo sampling of the sun disc (~0.53°)
  5. Early altitude exit: if sun clears all buildings at altitude X, it clears
     them at all higher altitudes too (shorter shadows)
  6. Same output format: {"azimuths", "altitudes", "terraces": [{id, shadows}]}
"""

import json
import math
import os
import time
from functools import lru_cache
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).parent
PUBLIC_DIR = SCRIPT_DIR / ".." / "public"
BUILDINGS_DIR = PUBLIC_DIR / "buildings"
TERRACES_PATH = PUBLIC_DIR / "terraces-data.geojson"
OUTPUT_PATH = PUBLIC_DIR / "shadow-data_V2.json"

AZIMUTHS = list(range(0, 360, 15))
ALTITUDES = list(range(5, 75, 5))   # sorted ascending

# Sun disc angular radius in degrees (~0.265°)
SUN_DISC_RADIUS = 0.265
# Number of penumbra samples:
#   0 = point-source sun, fastest (~40s for 24k terraces)
#   4 = 5 samples (center + 4 cardinal), good tradeoff (~3min)
#   8 = 9 samples (center + 8 perimeter), most precise (~6min)
PENUMBRA_SAMPLES = 0

# Local tangent plane origin (center of Paris)
ORIGIN_LNG = 2.342
ORIGIN_LAT = 48.856
_cos_lat = math.cos(math.radians(ORIGIN_LAT))
M_PER_DEG_LAT = 111_319.9
M_PER_DEG_LNG = 111_319.9 * _cos_lat


def to_meters(lng, lat):
    """Convert (lng, lat) to local (x, y) in meters."""
    return (lng - ORIGIN_LNG) * M_PER_DEG_LNG, (lat - ORIGIN_LAT) * M_PER_DEG_LAT


def to_meters_array(coords):
    """Convert (N, 2) array of [lng, lat] to [x_m, y_m]."""
    out = np.empty_like(coords)
    out[:, 0] = (coords[:, 0] - ORIGIN_LNG) * M_PER_DEG_LNG
    out[:, 1] = (coords[:, 1] - ORIGIN_LAT) * M_PER_DEG_LAT
    return out


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
        x, y = to_meters(lng, lat)
        out.append({
            "id": i,
            "lng": lng, "lat": lat,
            "x": x, "y": y,
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


def load_buildings_for_tile_group(tile_key: str, index: dict, radius: int = 1):
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
# Geometry extraction (in meters)
# ---------------------------------------------------------------------------

def extract_building_data(buildings: list[dict]):
    """
    Returns:
      edges_a:  (N, 2) edge start points in meters
      edges_b:  (N, 2) edge end points in meters
      heights:  (N,) building heights
      bld_ids:  (N,) building index for each edge
      polygons: list of (M, 2) arrays — building footprints in meters
    """
    a_list, b_list, h_list, id_list = [], [], [], []
    polygons = []

    for bld_idx, bld in enumerate(buildings):
        geom = bld.get("geometry")
        if not geom:
            continue
        height = ((bld.get("properties") or {}).get("height") or 0)
        if height <= 0:
            continue

        coords = geom["coordinates"]
        polys_raw = [coords] if geom["type"] == "Polygon" else coords

        for polygon in polys_raw:
            ring_deg = np.array(polygon[0])
            ring_m = to_meters_array(ring_deg)
            polygons.append((bld_idx, ring_m, height))

            for i in range(len(ring_m) - 1):
                a_list.append(ring_m[i])
                b_list.append(ring_m[i + 1])
                h_list.append(height)
                id_list.append(bld_idx)

    if not a_list:
        return None

    return {
        "edges_a": np.array(a_list),
        "edges_b": np.array(b_list),
        "heights": np.array(h_list),
        "bld_ids": np.array(id_list, dtype=np.int32),
        "polygons": polygons,
    }


# ---------------------------------------------------------------------------
# Point-in-polygon (winding number, vectorized per polygon)
# ---------------------------------------------------------------------------

def point_in_polygon(px, py, ring_m):
    """Winding number test. ring_m: (M, 2) closed ring in meters."""
    x = ring_m[:-1, 0] - px
    y = ring_m[:-1, 1] - py
    x1 = ring_m[1:, 0] - px
    y1 = ring_m[1:, 1] - py
    cross = x * y1 - x1 * y
    upward = (y <= 0) & (y1 > 0) & (cross > 0)
    downward = (y > 0) & (y1 <= 0) & (cross < 0)
    winding = np.sum(upward) - np.sum(downward)
    return winding != 0


def get_containing_buildings(px, py, polygons):
    """Return set of building indices whose footprint contains (px, py)."""
    result = set()
    for bld_idx, ring_m, _ in polygons:
        if point_in_polygon(px, py, ring_m):
            result.add(bld_idx)
    return result


# ---------------------------------------------------------------------------
# Penumbra sun samples
# ---------------------------------------------------------------------------

def make_sun_offsets(n_samples: int) -> list[tuple[float, float]]:
    """
    Generate angular offsets (d_azimuth, d_altitude) in degrees
    sampling the sun disc.
    """
    if n_samples <= 0:
        return [(0.0, 0.0)]
    offsets = [(0.0, 0.0)]  # center
    for i in range(n_samples):
        angle = 2 * math.pi * i / n_samples
        offsets.append((
            SUN_DISC_RADIUS * math.cos(angle),
            SUN_DISC_RADIUS * math.sin(angle),
        ))
    return offsets


# ---------------------------------------------------------------------------
# Shadow computation
# ---------------------------------------------------------------------------

def compute_shadows_for_point(
    px: float,
    py: float,
    bld_data: dict,
    edge_tree: cKDTree,
    excluded_bld_ids: set,
    sun_offsets: list,
    max_shadow_len: np.ndarray,
) -> np.ndarray:
    """
    Returns (n_alt, n_az) array of 0..100 (sun factor).
    """
    n_alt = len(ALTITUDES)
    n_az = len(AZIMUTHS)
    n_samples = len(sun_offsets)

    edges_a = bld_data["edges_a"]
    edges_b = bld_data["edges_b"]
    heights = bld_data["heights"]
    bld_ids = bld_data["bld_ids"]
    AB = bld_data["AB"]

    # Query KDTree for edges within max possible shadow distance
    # max_shadow_len[0] is for the lowest altitude (longest shadows)
    max_reach = max_shadow_len[0].max() if len(max_shadow_len[0]) > 0 else 0
    if max_reach <= 0:
        return np.ones((n_alt, n_az), dtype=np.float32)

    # Get nearby edge midpoints
    nearby_idx = edge_tree.query_ball_point([px, py], r=max_reach * 1.2)
    if not nearby_idx:
        return np.ones((n_alt, n_az), dtype=np.float32)

    idx = np.array(nearby_idx)

    # Exclude edges belonging to buildings the terrace is inside
    if excluded_bld_ids:
        keep = ~np.isin(bld_ids[idx], list(excluded_bld_ids))
        idx = idx[keep]

    if len(idx) == 0:
        return np.ones((n_alt, n_az), dtype=np.float32)

    ea = edges_a[idx]
    ab = AB[idx]
    h = heights[idx]

    P = np.array([px, py])
    PA = ea - P
    cross_PA_AB = PA[:, 0] * ab[:, 1] - PA[:, 1] * ab[:, 0]

    # Accumulator for penumbra
    sun_counts = np.zeros((n_alt, n_az), dtype=np.float32)

    for d_az, d_alt in sun_offsets:
        for az_idx, base_az in enumerate(AZIMUTHS):
            az = base_az + d_az
            az_rad = math.radians(az)
            D = np.array([math.sin(az_rad), math.cos(az_rad)])

            cross_D_AB = D[0] * ab[:, 1] - D[1] * ab[:, 0]
            parallel = np.abs(cross_D_AB) < 1e-9
            denom = np.where(parallel, 1.0, cross_D_AB)

            t = cross_PA_AB / denom
            s = (PA[:, 0] * D[1] - PA[:, 1] * D[0]) / denom
            hit = (~parallel) & (t > 0.5) & (s >= 0) & (s <= 1)
            # t > 0.5m minimum distance to avoid self-intersection noise

            if not np.any(hit):
                sun_counts[:, az_idx] += 1.0
                continue

            t_hit = t[hit]
            h_hit = h[hit]
            dist_m = np.abs(t_hit)  # t is already in meters

            # Early altitude exit: altitudes are sorted ascending,
            # so shadows get shorter. Once clear, stay clear.
            for alt_idx in range(n_alt):
                alt = ALTITUDES[alt_idx] + d_alt
                if alt <= 0:
                    # Below horizon, counts as shadow (sun_counts stays 0)
                    continue
                tan_alt = math.tan(math.radians(alt))
                shadow_len = h_hit / tan_alt
                if np.any(dist_m < shadow_len):
                    pass  # shadow, don't increment
                else:
                    # Clear at this altitude → clear at all higher altitudes
                    sun_counts[alt_idx:, az_idx] += 1.0
                    break
            # If loop completes without break, all altitudes are in shadow

    return sun_counts / n_samples


def compute_terrace_shadows(
    terrace: dict,
    bld_data: dict,
    edge_tree: cKDTree,
    sun_offsets: list,
    max_shadow_len: np.ndarray,
) -> list[list[int]] | None:
    if bld_data is None:
        return None

    px, py = terrace["x"], terrace["y"]

    # Determine which buildings contain this terrace point
    excluded = get_containing_buildings(px, py, bld_data["polygons"])

    # Sample points on terrace footprint
    longueur = terrace.get("longueur") or 0
    largeur = terrace.get("largeur") or 0
    points = [(px, py)]
    if longueur >= 4.0 and largeur >= 4.0:
        dl = longueur * 0.3
        dw = largeur * 0.3
        points += [(px+dl, py+dw), (px+dl, py-dw), (px-dl, py+dw), (px-dl, py-dw)]

    grids = [
        compute_shadows_for_point(
            qx, qy, bld_data, edge_tree, excluded, sun_offsets, max_shadow_len
        )
        for qx, qy in points
    ]

    avg = np.mean(grids, axis=0)
    return (np.round(avg * 100)).astype(int).tolist()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    t0 = time.time()

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

    sun_offsets = make_sun_offsets(PENUMBRA_SAMPLES)
    print(f"Penumbra samples: {len(sun_offsets)} per sun position")
    print(f"Grid: {len(AZIMUTHS)} az x {len(ALTITUDES)} alt = "
          f"{len(AZIMUTHS) * len(ALTITUDES)} positions per terrace")

    # Precompute max shadow length per altitude per height bucket
    # (used for KDTree radius queries)
    tan_alts = np.array([math.tan(math.radians(a)) for a in ALTITUDES])

    # Group terraces by tile
    tile_groups: dict[str, list[dict]] = {}
    for t in terraces:
        k = get_tile_key(t["lng"], t["lat"], bindex)
        tile_groups.setdefault(k, []).append(t)

    print(f"  {len(tile_groups)} tile groups")

    results = [None] * len(terraces)
    done = 0

    for tile_key, group in tile_groups.items():
        buildings = load_buildings_for_tile_group(tile_key, bindex, radius=1)
        bld_data = extract_building_data(buildings)

        if bld_data is None:
            for terrace in group:
                results[terrace["id"]] = {"id": terrace["id"], "shadows": None}
                done += 1
            continue

        # Precompute edge vectors and midpoints
        bld_data["AB"] = bld_data["edges_b"] - bld_data["edges_a"]
        midpoints = (bld_data["edges_a"] + bld_data["edges_b"]) * 0.5
        edge_tree = cKDTree(midpoints)

        # Max shadow length array: (n_alt, n_edges)
        max_shadow_len = bld_data["heights"][None, :] / tan_alts[:, None]

        for terrace in group:
            shadows = compute_terrace_shadows(
                terrace, bld_data, edge_tree, sun_offsets, max_shadow_len
            )
            results[terrace["id"]] = {"id": terrace["id"], "shadows": shadows}
            done += 1

        if done % 500 < len(group) or done == len(terraces):
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
    print(f"Done in {total:.1f}s ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()