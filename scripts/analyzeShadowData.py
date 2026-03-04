#!/usr/bin/env python3
"""
Analyze shadow data distribution to verify quality
"""

import json
import sys
from pathlib import Path
from collections import Counter

def analyze_shadow_data():
    """Analyze shadow data file"""
    script_dir = Path(__file__).parent
    shadow_file = script_dir / '../public/shadow-data.json'

    print('📊 Analyzing shadow data...\n')

    # Load data
    with open(shadow_file, 'r') as f:
        data = json.load(f)

    terraces = data['terraces']
    azimuths = data['azimuths']
    altitudes = data['altitudes']

    print(f'Total terraces: {len(terraces)}')
    print(f'Sun positions: {len(azimuths)} azimuths × {len(altitudes)} altitudes = {len(azimuths) * len(altitudes)}\n')

    # Count terraces with no shadow data (always sunny)
    no_shadow_data = sum(1 for t in terraces if t['shadows'] is None)
    print(f'Terraces with no buildings nearby (always sunny): {no_shadow_data} ({no_shadow_data/len(terraces)*100:.1f}%)\n')

    # Analyze shadow values for terraces with buildings
    terraces_with_buildings = [t for t in terraces if t['shadows'] is not None]
    print(f'Terraces with building data: {len(terraces_with_buildings)}\n')

    if len(terraces_with_buildings) == 0:
        print('⚠️  No terraces have building shadow data!')
        return

    # Sample first terrace with buildings and one sun position
    print('Sample terrace shadow values (first terrace, altitude=30°):')
    sample = terraces_with_buildings[0]['shadows']
    alt_index = altitudes.index(30) if 30 in altitudes else 0
    print(f'  Azimuth range 0-360°: {sample[alt_index]}')
    print()

    # Collect all shadow values
    all_values = []
    for terrace in terraces_with_buildings:
        for alt_row in terrace['shadows']:
            all_values.extend(alt_row)

    # Count distribution
    value_counts = Counter(all_values)
    total_values = len(all_values)

    print('Shadow value distribution:')
    print(f'  0 (full shadow):        {value_counts.get(0, 0):8d} ({value_counts.get(0, 0)/total_values*100:5.1f}%)')
    print(f'  1-29 (mostly shadow):   {sum(value_counts.get(v, 0) for v in range(1, 30)):8d} ({sum(value_counts.get(v, 0) for v in range(1, 30))/total_values*100:5.1f}%)')
    print(f'  30-69 (partial sun):    {sum(value_counts.get(v, 0) for v in range(30, 70)):8d} ({sum(value_counts.get(v, 0) for v in range(30, 70))/total_values*100:5.1f}%)')
    print(f'  70-99 (mostly sun):     {sum(value_counts.get(v, 0) for v in range(70, 100)):8d} ({sum(value_counts.get(v, 0) for v in range(70, 100))/total_values*100:5.1f}%)')
    print(f'  100 (full sun):         {value_counts.get(100, 0):8d} ({value_counts.get(100, 0)/total_values*100:5.1f}%)')
    print()

    # Check for variety
    unique_values = len(value_counts)
    print(f'Unique shadow values: {unique_values}/101 possible (0-100)')

    if value_counts.get(100, 0) / total_values > 0.9:
        print('⚠️  WARNING: Over 90% full sun - shadow calculation may not be working properly')
    elif value_counts.get(100, 0) / total_values < 0.3:
        print('✅ Good distribution - significant shadow variation detected')
    else:
        print('✓ Reasonable distribution')

    # Find a terrace with varied shadows
    print('\nSample terrace with shadow variation:')
    for i, terrace in enumerate(terraces_with_buildings[:100]):  # Check first 100
        values_in_terrace = []
        for alt_row in terrace['shadows']:
            values_in_terrace.extend(alt_row)

        min_val = min(values_in_terrace)
        max_val = max(values_in_terrace)

        if max_val - min_val > 50:  # Good variation
            avg_val = sum(values_in_terrace) / len(values_in_terrace)
            print(f'  Terrace ID {terrace["id"]}: min={min_val}, max={max_val}, avg={avg_val:.1f}')
            print(f'  → This terrace goes from {min_val}% sun to {max_val}% sun depending on time')
            break

if __name__ == '__main__':
    try:
        analyze_shadow_data()
    except Exception as e:
        print(f'❌ Error: {e}')
        import traceback
        traceback.print_exc()
        sys.exit(1)
