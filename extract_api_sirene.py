import pandas as pd

# 1. Chargement du fichier des terrasses de Paris
csv_path = '/Users/francoisramon/Desktop/Perso/unverreausoleil/resources/terrasses-autorisations.csv'
# On force le séparateur ';' suite à l'analyse de votre fichier
df_terrasses = pd.read_csv(csv_path, sep=';', dtype={'SIRET': str})

# Nettoyage des noms de colonnes et des SIRET
df_terrasses.columns = df_terrasses.columns.str.strip()
df_terrasses['SIRET'] = df_terrasses['SIRET'].str.replace(' ', '').str.zfill(14)

# 2. Chargement du stock SIRENE (Filtre Paris 75)
cols_utiles = [
    'siret', 
    'enseigne1Etablissement', 
    'denominationUsuelleEtablissement',
    'activitePrincipaleEtablissement', 
    'etatAdministratifEtablissement', 
    'codeCommuneEtablissement'
]

print("Chargement du stock SIRENE...")
df_sirene = pd.read_parquet(
    '/Users/francoisramon/Downloads/StockEtablissement_utf8.parquet', 
    columns=cols_utiles,
    filters=[
        ('codeCommuneEtablissement', '>=', '75000'),
        ('codeCommuneEtablissement', '<', '76000')
    ]
)

# Préparation du nom commercial officiel (INSEE)
df_sirene['nom_etab_officiel'] = df_sirene['enseigne1Etablissement'].fillna(df_sirene['denominationUsuelleEtablissement']).fillna("Inconnu")

# 3. Fusion (Inner join pour n'avoir que les SIRET existants)
print("Fusion des bases...")
resultat = pd.merge(df_terrasses, df_sirene, left_on='SIRET', right_on='siret', how='inner')

# 4. Typologie d'activité (Bar / Restaurant)
def categoriser(naf):
    if pd.isna(naf): return "Autre"
    n = str(naf).replace('.', '')
    if n.startswith(('5610A', '5610B', '5610C')): return "Restaurant"
    if n.startswith('5630Z'): return "Bar"
    return "Autre"

resultat['type_activite'] = resultat['activitePrincipaleEtablissement'].apply(categoriser)

# 5. Filtrage strict : OUVERTS + Bar/Resto + Mots-clés Typologie
print("Filtrage des établissements fermés et hors-sujet...")

mask = (
    (resultat['etatAdministratifEtablissement'] == 'A') & # FILTRE : Uniquement les OUVERTS (Actifs)
    resultat['type_activite'].isin(['Bar', 'Restaurant']) & 
    resultat['Typologie'].str.contains('TERRASSE|PARQUET|PLANCHER', case=False, na=False)
)

final_df = resultat[mask].copy()

# 6. Calcul de la temporalité
final_df['temporalité'] = final_df['Typologie'].apply(
    lambda x: "que_ete" if "ESTIVAL" in str(x).upper() else "toute_annee"
)

# 7. Préparation de la clé de recherche pour enrichissement futur (Maps/OSM/Yelp)
final_df['search_query'] = final_df['Nom de l\'enseigne'].fillna(final_df['nom_etab_officiel']) + " " + final_df['Numéro et voie'] + " Paris"

# 8. Exportation (Trié par Arrondissement)
output_path = '/Users/francoisramon/Desktop/Perso/unverreausoleil/terrasses_actives_toutes.csv'

cols_export = [
    'SIRET', 
    'Nom de l\'enseigne', 
    'nom_etab_officiel', 
    'search_query',
    'type_activite', 
    'temporalité', 
    'Typologie',
    'Numéro et voie', 
    'Arrondissement', 
    'geo_point_2d'
]

final_df.sort_values(by='Arrondissement').to_csv(output_path, index=False)

print(f"--- Terminé ---")
print(f"Fichier généré : {output_path}")
print(f"Nombre de lignes conservées (doublons SIRET inclus) : {len(final_df)}")
print(f"Statistiques :")
print(f"- Restaurants/Bars ouverts : {final_df['SIRET'].nunique()} établissements uniques")
print(f"- Nombre total de terrasses : {len(final_df)}")