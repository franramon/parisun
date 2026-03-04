/**
 * Test script to verify shadow data integration
 * Run this with: node scripts/testShadowIntegration.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧪 Testing shadow data integration...\n');

// Load terraces
const terracesPath = path.join(__dirname, '../public/terraces-data.geojson');
const terracesGeoJSON = JSON.parse(fs.readFileSync(terracesPath, 'utf-8'));

// Simulate frontend loading (filter closed terraces and add IDs)
const terraces = [];
for (let index = 0; index < terracesGeoJSON.features.length; index++) {
  const feature = terracesGeoJSON.features[index];
  if (!feature.geometry || !feature.geometry.coordinates) continue;

  const props = feature.properties || {};
  const typologie = props.typologie || '';

  // Filter out closed terraces
  if (typologie.toLowerCase().includes('fermée') || typologie.toLowerCase().includes('fermee')) {
    continue;
  }

  const [lng, lat] = feature.geometry.coordinates;
  terraces.push({
    id: index, // Original index for shadow data lookup
    name: props.nom_enseigne || props.nom_commerce || 'Sans nom',
    lat,
    lng
  });
}

console.log(`✓ Loaded ${terraces.length} open terraces (with original IDs preserved)\n`);

// Load shadow data
const shadowPath = path.join(__dirname, '../public/shadow-data.json');
const shadowData = JSON.parse(fs.readFileSync(shadowPath, 'utf-8'));

console.log(`✓ Loaded shadow data for ${shadowData.terraces.length} terraces\n`);

// Test lookups for first few terraces
console.log('Testing shadow lookups:');
for (let i = 0; i < Math.min(5, terraces.length); i++) {
  const terrace = terraces[i];
  const shadowEntry = shadowData.terraces.find(t => t.id === terrace.id);

  if (!shadowEntry) {
    console.log(`  ❌ Terrace ${i} (id=${terrace.id}): No shadow data found`);
  } else if (!shadowEntry.shadows) {
    console.log(`  ✓ Terrace ${i} (id=${terrace.id}, ${terrace.name}): No buildings nearby (always sunny)`);
  } else {
    // Get sample shadow values
    const sampleAlt = shadowEntry.shadows[0]; // First altitude row
    const min = Math.min(...sampleAlt);
    const max = Math.max(...sampleAlt);
    const avg = sampleAlt.reduce((a, b) => a + b, 0) / sampleAlt.length;

    console.log(`  ✓ Terrace ${i} (id=${terrace.id}, ${terrace.name}):`);
    console.log(`     Shadow range: ${min}-${max}%, avg: ${avg.toFixed(1)}%`);
  }
}

console.log('\n✅ Integration test complete!');
console.log('\nSummary:');
console.log(`  - Terraces loaded: ${terraces.length}`);
console.log(`  - Shadow data entries: ${shadowData.terraces.length}`);
console.log(`  - ID mapping: ${terraces[0].id} (first terrace) maps to shadow data id ${shadowData.terraces.find(t => t.id === terraces[0].id)?.id}`);
