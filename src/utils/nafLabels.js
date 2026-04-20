// Simplified French labels for common NAF codes found in the Paris terrasses dataset.
// Falls back to a generic label when the code is unknown.

const NAF_LABELS = {
  '10.71C': 'Boulangerie',
  '10.71D': 'Pâtisserie',
  '10.82Z': 'Chocolaterie',
  '46.34Z': 'Cave à vins',
  '47.11B': 'Épicerie',
  '47.11D': 'Supérette',
  '47.19B': 'Grand magasin',
  '47.21Z': 'Primeur',
  '47.22Z': 'Boucherie',
  '47.23Z': 'Poissonnerie',
  '47.24Z': 'Boulangerie-pâtisserie',
  '47.25Z': 'Cave à vins',
  '47.26Z': 'Tabac',
  '47.29Z': 'Alimentation',
  '47.59A': 'Ameublement',
  '47.61Z': 'Librairie',
  '47.62Z': 'Presse',
  '47.71Z': 'Prêt-à-porter',
  '47.72A': 'Chaussures',
  '47.73Z': 'Pharmacie',
  '47.75Z': 'Parfumerie',
  '47.76Z': 'Fleuriste',
  '47.77Z': 'Bijouterie',
  '47.78C': 'Boutique',
  '55.10Z': 'Hôtel',
  '56.10A': 'Restaurant',
  '56.10C': 'Restauration rapide',
  '56.21Z': 'Traiteur',
  '56.30Z': 'Café · Bar',
  '64.20Z': 'Société holding',
  '68.20B': 'Location immobilière',
  '70.10Z': 'Siège social',
  '70.22Z': 'Conseil',
  '74.90B': 'Activités spécialisées',
  '82.11Z': 'Services administratifs',
  '90.01Z': 'Arts du spectacle',
  '94.99Z': 'Association',
  '96.02A': 'Coiffure',
  '96.02B': 'Soins de beauté',
};

const NAF_ICONS = {
  '56.30Z': '🍺',
  '56.10A': '🍽️',
  '56.10C': '🍔',
  '56.21Z': '🍱',
  '46.34Z': '🍷',
  '47.25Z': '🍷',
  '55.10Z': '🏨',
  '10.71C': '🥐',
  '10.71D': '🧁',
  '10.82Z': '🍫',
  '47.24Z': '🥐',
  '47.22Z': '🥩',
  '47.23Z': '🐟',
  '47.21Z': '🥬',
  '47.29Z': '🛒',
  '47.11B': '🛒',
  '47.11D': '🛒',
  '47.76Z': '💐',
  '47.73Z': '💊',
  '47.61Z': '📚',
  '47.62Z': '📰',
  '47.26Z': '🚬',
};

export function getShopIcon(naf) {
  if (!naf) return '·';
  if (NAF_ICONS[naf]) return NAF_ICONS[naf];
  const prefix = naf.slice(0, 2);
  const fallback = {
    '56': '🍽️',
    '55': '🏨',
    '46': '🍷',
    '10': '🥐',
    '11': '🍺',
    '47': '🛍️',
  };
  return fallback[prefix] || '·';
}

export function getShopLabel(naf) {
  if (!naf) return 'Commerce';
  if (NAF_LABELS[naf]) return NAF_LABELS[naf];
  // Try 2-digit prefix fallback for rarer codes
  const prefix = naf.slice(0, 2);
  const fallback = {
    '10': 'Alimentation',
    '11': 'Boissons',
    '46': 'Commerce de gros',
    '47': 'Commerce de détail',
    '55': 'Hébergement',
    '56': 'Restauration',
    '68': 'Immobilier',
    '70': 'Siège social',
    '74': 'Services',
    '77': 'Location',
    '82': 'Services',
    '90': 'Arts',
    '93': 'Sports · Loisirs',
    '94': 'Association',
    '96': 'Services personnels',
  };
  return fallback[prefix] || 'Commerce';
}
