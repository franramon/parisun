# Parisun

Trouvez une terrasse ensoleillée à Paris, maintenant.

**Parisun** croise la position du soleil en temps réel, les données de bâtiments IGN BD TOPO et les ~19 000 terrasses autorisées de Paris pour vous dire, terrasse par terrasse, si elle est au soleil ou à l'ombre — à l'heure que vous choisissez.

## Fonctionnalités

- **Carte interactive** des terrasses parisiennes, colorées selon l'ensoleillement (orange = soleil, gris = ombre)
- **Calcul d'ombres précis** par lancer de rayons sur les bâtiments réels (IGN BD TOPO), pré-calculé pour chaque azimut/altitude solaire
- **Curseur date/heure** : simulez l'ensoleillement à n'importe quel moment de la journée ou de la semaine
- **Météo en temps réel** via Open-Meteo : le widget s'adapte (pluie, nuages, nuit)
- **Filtrage par zone** : la liste de droite se synchronise avec la vue de la carte
- **Recherche** par nom, adresse ou arrondissement

## Sources de données

| Données | Source |
|---|---|
| Terrasses autorisées | [opendata.paris.fr](https://opendata.paris.fr) |
| Bâtiments & hauteurs | IGN BD TOPO |
| Météo | [Open-Meteo](https://open-meteo.com) |

## Stack

- **React** + **Vite**
- **Leaflet** pour la carte
- **SunCalc** pour la position solaire
- Python (NumPy, SciPy) pour le pré-calcul des ombres

## Lancer en local

```bash
npm install
npm run dev
```

Requiert les fichiers `public/terraces-data.geojson` et `public/shadow-data_V2.json` (pré-calculé via `scripts/compute_shadows_V2.py`).
