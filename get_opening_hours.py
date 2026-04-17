import pandas as pd
import requests
import time

def query_overpass(lat, lon, radius=30):
    # Liste des serveurs miroirs pour éviter les 504
    endpoints = [
        "https://overpass.openstreetmap.fr/api/interpreter",
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter"
    ]
    
    query = f"""
    [out:json][timeout:15];
    node["amenity"~"restaurant|bar|cafe|pub"](around:{radius},{lat},{lon});
    out body;
    """
    
    for url in endpoints:
        try:
            print(f"    Essai sur serveur : {url.split('/')[2]}...", end=" ")
            resp = requests.get(url, params={'data': query}, timeout=15)
            if resp.status_code == 200:
                print("Succès !")
                return resp.json().get('elements', [])
            else:
                print(f"Erreur {resp.status_code}")
        except Exception as e:
            print(f"Échec connexion")
    return None

def debug_test_4_terrasses():
    df = pd.read_csv('/Users/francoisramon/Desktop/Perso/unverreausoleil/terrasses_actives_toutes.csv')
    test_samples = df.sample(4, random_state=42)
    
    print(f"--- DÉBUT DU DEBUG SUR 4 ÉTABLISSEMENTS ---\n")
    
    for _, row in test_samples.iterrows():
        print(f"CIBLE : {row['Nom de l'enseigne']} | {row['Numéro et voie']}")
        
        coords = str(row['geo_point_2d']).split(',')
        lat, lon = float(coords[0]), float(coords[1])
        
        elements = query_overpass(lat, lon)
        
        if elements:
            print(f"    Nombre d'objets trouvés dans le rayon : {len(elements)}")
            for i, el in enumerate(elements):
                tags = el.get('tags', {})
                name = tags.get('name', 'N/A')
                hours = tags.get('opening_hours', 'NON RENSEIGNÉ')
                cuisine = tags.get('cuisine', 'N/A')
                
                print(f"    [{i+1}] Nom OSM : {name}")
                print(f"        Cuisine : {cuisine}")
                print(f"        Horaires : {hours}")
        else:
            print("    AUCUN RÉSULTAT trouvé sur aucun serveur.")
        
        print("-" * 50)
        time.sleep(2) # Politesse API

if __name__ == "__main__":
    debug_test_4_terrasses()