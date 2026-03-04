#!/usr/bin/env python3
"""
Verify that shadow data matches terrace data
"""

import json
from pathlib import Path

def verify_data():
    script_dir = Path(__file__).parent

    # Load terraces
    terraces_path = script_dir / '../public/terraces-data.geojson'
    with open(terraces_path, 'r') as f:
        terraces_geojson = json.load(f)

    # Count terraces (excluding closed ones like the frontend does)
    open_terraces = []
    for feature in terraces_geojson['features']:
        props = feature.get('properties', {})
        typologie = props.get('typologie') or ''

        # Skip closed terraces
        if 'fermée' in typologie.lower() or 'fermee' in typologie.lower():
            continue

        open_terraces.append(feature)

    print(f'Open terraces in GeoJSON: {len(open_terraces)}')

    # Load shadow data
    shadow_path = script_dir / '../public/shadow-data.json'
    with open(shadow_path, 'r') as f:
        shadow_data = json.load(f)

    print(f'Terraces in shadow data: {len(shadow_data["terraces"])}')

    # Check if counts match
    if len(open_terraces) == len(shadow_data['terraces']):
        print('✅ Counts match!')
    else:
        print(f'⚠️  Counts do not match: {len(open_terraces)} terraces vs {len(shadow_data["terraces"])} shadow entries')

    # Check ID range
    shadow_ids = [t['id'] for t in shadow_data['terraces']]
    print(f'\nShadow data IDs range: {min(shadow_ids)} to {max(shadow_ids)}')
    print(f'Expected terrace IDs: 0 to {len(open_terraces) - 1}')

    # Check for gaps
    missing_ids = set(range(len(open_terraces))) - set(shadow_ids)
    if missing_ids:
        print(f'⚠️  Missing IDs: {len(missing_ids)} gaps')
        print(f'   First few: {sorted(list(missing_ids))[:10]}')
    else:
        print('✅ No gaps in ID sequence')

    # Check shadow data structure
    sample = shadow_data['terraces'][0]
    if sample['shadows']:
        print(f'\nShadow grid structure:')
        print(f'  Azimuths: {len(shadow_data["azimuths"])} values ({shadow_data["azimuths"][0]}° to {shadow_data["azimuths"][-1]}°)')
        print(f'  Altitudes: {len(shadow_data["altitudes"])} values ({shadow_data["altitudes"][0]}° to {shadow_data["altitudes"][-1]}°)')
        print(f'  Shadow matrix: {len(sample["shadows"])} rows × {len(sample["shadows"][0])} columns')

    print('\n✅ Data structure looks valid for frontend integration')

if __name__ == '__main__':
    verify_data()
