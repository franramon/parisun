#!/usr/bin/env python3
"""
Script to precompute shadow data for all terraces
Python version - uses the same shadow calculation logic as the frontend
"""

import json
import math
import os
from pathlib import Path
from collections import defaultdict

# ============================================================================
# SHADOW CALCULATION FUNCTIONS (TRANSLATED FROM FRONTEND)
# ============================================================================

def line_segments_intersect(p1, p2, p3, p4):
    """Check if two line segments intersect"""
    x1, y1 = p1
    x2, y2 = p2
    x3, y3 = p3
    x4, y4 = p4

    denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1)
    if denom == 0:
        return False  # Parallel

    ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom
    ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom

    return 0 <= ua <= 1 and 0 <= ub <= 1


def ray_intersects_building(terrace_point, sun_vector, building, sun_altitude):
    """Check if a ray from sun intersects with a building polygon"""
    if not building.get('geometry') or sun_altitude <= 0:
        return False

    building_height = building.get('properties', {}).get('height', 0)
    if building_height <= 0:
        return False

    # Calculate ray end point (extended far enough)
    ray_length = 0.01  # ~1km in degrees
    ray_end = [
        terrace_point[0] + sun_vector[0] * ray_length,
        terrace_point[1] + sun_vector[1] * ray_length
    ]

    # Check all building polygons
    coordinates = building['geometry']['coordinates']
    polygons = [coordinates] if building['geometry']['type'] == 'Polygon' else coordinates

    for polygon in polygons:
        ring = polygon[0]  # Outer ring

        # Check if ray intersects building footprint
        for i in range(len(ring) - 1):
            if line_segments_intersect(terrace_point, ray_end, ring[i], ring[i + 1]):
                # Ray intersects building footprint
                # Calculate distance to building
                building_center = [
                    sum(coord[0] for coord in ring) / len(ring),
                    sum(coord[1] for coord in ring) / len(ring)
                ]

                dx = building_center[0] - terrace_point[0]
                dy = building_center[1] - terrace_point[1]
                distance_deg = math.sqrt(dx * dx + dy * dy)
                distance_meters = distance_deg * 111000  # Rough conversion

                # Calculate shadow length based on sun altitude and building height
                sun_altitude_rad = math.radians(sun_altitude)
                shadow_length = building_height / math.tan(sun_altitude_rad)

                # If terrace is within shadow length, it's in shadow
                if distance_meters < shadow_length:
                    return True

    return False


def create_building_index(buildings, grid_size=0.01):
    """Create a spatial index for buildings (simple grid-based)"""
    index = defaultdict(list)

    for building in buildings:
        if not building.get('geometry'):
            continue

        # Get building bounding box
        coords = building['geometry']['coordinates']
        if building['geometry']['type'] == 'Polygon':
            all_coords = coords[0]
        else:
            all_coords = []
            for poly in coords:
                all_coords.extend(poly[0])

        lngs = [c[0] for c in all_coords]
        lats = [c[1] for c in all_coords]

        min_lng = min(lngs)
        max_lng = max(lngs)
        min_lat = min(lats)
        max_lat = max(lats)

        # Add building to all grid cells it overlaps
        min_grid_x = int(math.floor(min_lng / grid_size))
        max_grid_x = int(math.floor(max_lng / grid_size))
        min_grid_y = int(math.floor(min_lat / grid_size))
        max_grid_y = int(math.floor(max_lat / grid_size))

        for x in range(min_grid_x, max_grid_x + 1):
            for y in range(min_grid_y, max_grid_y + 1):
                key = f"{x},{y}"
                index[key].append(building)

    return {'index': index, 'gridSize': grid_size}


def get_nearby_buildings(spatial_index, lng, lat, radius=3):
    """Get nearby buildings from spatial index"""
    index = spatial_index['index']
    grid_size = spatial_index['gridSize']
    buildings = set()

    center_x = int(math.floor(lng / grid_size))
    center_y = int(math.floor(lat / grid_size))

    for dx in range(-radius, radius + 1):
        for dy in range(-radius, radius + 1):
            key = f"{center_x + dx},{center_y + dy}"
            cell_buildings = index.get(key, [])
            for b in cell_buildings:
                # Use id() to create unique identifier for set
                buildings.add(id(b))

    # Convert back to list of actual building objects
    result = []
    seen_ids = set()
    for dx in range(-radius, radius + 1):
        for dy in range(-radius, radius + 1):
            key = f"{center_x + dx},{center_y + dy}"
            for b in index.get(key, []):
                bid = id(b)
                if bid not in seen_ids:
                    seen_ids.add(bid)
                    result.append(b)

    return result


def is_in_shadow(terrace, sun_position, building_index):
    """Calculate if a terrace is in shadow"""
    if sun_position['altitude'] <= 0:
        return True  # Sun is down

    terrace_point = [terrace['lng'], terrace['lat']]

    # Calculate sun direction vector (2D projection)
    azimuth_rad = math.radians(sun_position['azimuth'])
    sun_vector = [
        math.sin(azimuth_rad),  # East-West
        math.cos(azimuth_rad)   # North-South
    ]

    # Get nearby buildings
    nearby_buildings = get_nearby_buildings(
        building_index,
        terrace['lng'],
        terrace['lat'],
        5  # Search radius
    )

    # Check if any building casts a shadow on this terrace
    for building in nearby_buildings:
        if ray_intersects_building(terrace_point, sun_vector, building, sun_position['altitude']):
            return True

    return False


def calculate_shadow_factor(terrace, sun_position, building_index):
    """Calculate shadow factor (0 = full shadow, 1 = full sun)"""
    if sun_position['altitude'] <= 0:
        return 0

    in_shadow = is_in_shadow(terrace, sun_position, building_index)

    if not in_shadow:
        return 1.0  # Full sun

    # Partial shadow based on sun altitude
    altitude_factor = min(1, sun_position['altitude'] / 45)

    return altitude_factor * 0.3  # In shadow, but not completely dark


# ============================================================================
# BUILDING LOADING
# ============================================================================

def load_building_index():
    """Load building index"""
    script_dir = Path(__file__).parent
    index_path = script_dir / '../public/buildings/index.json'

    with open(index_path, 'r') as f:
        return json.load(f)


def load_building_tile(tile_key):
    """Load a specific building tile"""
    try:
        script_dir = Path(__file__).parent
        tile_path = script_dir / f'../public/buildings/{tile_key}.json'

        if not tile_path.exists():
            return {'type': 'FeatureCollection', 'features': []}

        with open(tile_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading tile {tile_key}: {e}")
        return {'type': 'FeatureCollection', 'features': []}


def get_tile_key(lng, lat, index):
    """Get tile key for coordinates"""
    bounds = index['bounds']
    tile_size = index['tileSize']

    x = int(math.floor((lng - bounds['minLng']) / tile_size))
    y = int(math.floor((lat - bounds['minLat']) / tile_size))

    return f"{x}_{y}"


def is_valid_tile(tile_key, index):
    """Check if tile is valid"""
    return any(t['key'] == tile_key for t in index['tiles'])


def get_buildings_near(lng, lat, index, radius=1):
    """Load buildings near a terrace"""
    center_key = get_tile_key(lng, lat, index)
    if not center_key:
        return []

    center_x, center_y = map(int, center_key.split('_'))
    buildings = []

    for dx in range(-radius, radius + 1):
        for dy in range(-radius, radius + 1):
            tile_key = f"{center_x + dx}_{center_y + dy}"

            if is_valid_tile(tile_key, index):
                tile = load_building_tile(tile_key)
                if tile and tile.get('features'):
                    buildings.extend(tile['features'])

    return buildings


# ============================================================================
# MAIN PRECOMPUTATION
# ============================================================================

def precompute_all_shadows():
    """Main precomputation function"""
    print('🏗️  Starting shadow precomputation (Python version)...\n')

    # Load terraces
    print('📍 Loading terraces...')
    script_dir = Path(__file__).parent
    terraces_path = script_dir / '../public/terraces-data.geojson'

    with open(terraces_path, 'r') as f:
        terraces_geojson = json.load(f)

    terraces = []
    for index, feature in enumerate(terraces_geojson['features']):
        props = feature.get('properties', {})
        lng, lat = feature['geometry']['coordinates']

        terraces.append({
            'id': index,
            'name': props.get('nom_enseigne') or props.get('nom_commerce') or 'Sans nom',
            'lng': lng,
            'lat': lat
        })

    print(f'✓ Loaded {len(terraces)} terraces\n')

    # Load building index
    print('🏢 Loading building index...')
    building_index_data = load_building_index()
    print(f'✓ Building index loaded ({len(building_index_data["tiles"])} tiles)\n')

    # Define sun position grid
    azimuths = list(range(0, 360, 15))
    altitudes = list(range(5, 71, 5))

    print(f'📊 Computing for {len(azimuths)} azimuths × {len(altitudes)} altitudes = {len(azimuths) * len(altitudes)} positions\n')

    # Result structure
    shadow_data = {
        'azimuths': azimuths,
        'altitudes': altitudes,
        'terraces': []
    }

    # Process terraces in batches
    batch_size = 100

    for i in range(0, len(terraces), batch_size):
        batch = terraces[i:min(i + batch_size, len(terraces))]

        print(f'Processing terraces {i + 1}-{min(i + batch_size, len(terraces))} of {len(terraces)}...')

        for terrace in batch:
            # Load buildings near this terrace
            buildings = get_buildings_near(terrace['lng'], terrace['lat'], building_index_data, 1)

            if len(buildings) == 0:
                # No buildings nearby - always sunny
                shadow_data['terraces'].append({
                    'id': terrace['id'],
                    'shadows': None
                })
                continue

            # Create spatial index for these buildings
            spatial_index = create_building_index(buildings)

            # Compute shadow factor for each sun position
            shadows = []

            for altitude in altitudes:
                alt_row = []
                for azimuth in azimuths:
                    sun_position = {'azimuth': azimuth, 'altitude': altitude}
                    shadow_factor = calculate_shadow_factor(terrace, sun_position, spatial_index)
                    # Store as 0-100 integer
                    alt_row.append(round(shadow_factor * 100))
                shadows.append(alt_row)

            shadow_data['terraces'].append({
                'id': terrace['id'],
                'shadows': shadows
            })

        # Progress update
        progress = round((min(i + batch_size, len(terraces)) / len(terraces)) * 100)
        print(f'  Progress: {progress}%')

    # Save results
    print('\n💾 Saving shadow data...')
    output_path = script_dir / '../public/shadow-data.json'

    with open(output_path, 'w') as f:
        json.dump(shadow_data, f)

    file_size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f'✓ Shadow data saved to shadow-data.json ({file_size_mb:.2f} MB)')

    print('\n✅ Precomputation complete!')


if __name__ == '__main__':
    try:
        precompute_all_shadows()
    except Exception as e:
        print(f'❌ Error during precomputation: {e}')
        import traceback
        traceback.print_exc()
        exit(1)
