#Code permettant de merger les 3 dataset
import pandas as pd
import unicodedata

stock = pd.read_csv('stock_clean_departemental.csv') ##Charger le fichier stock qu'on obtiens grâce aux script stock_dep.py
saa = pd.read_csv('data_SAA_clean.csv') ##Charger le fichier SAA qu'on obtiens grâce au script data_SAA_clean.py
price = pd.read_csv('seasonalStats.csv') ##Charger le fichier des prix 

saa = saa.drop(columns=['Category','Label_Original'], errors='ignore')

# la clé n'est pas forcément rigoursement égal...
price['culture_key'] = price['culture'].str.lower().str.strip()
saa['item_key'] = saa['Item_Label'].str.lower().str.strip()

price['year'] = pd.to_numeric(price['year'], errors='coerce').astype('Int64')
saa['Annee'] = pd.to_numeric(saa['Annee'], errors='coerce').astype('Int64')
stock['ANNEE'] = pd.to_numeric(stock['ANNEE'], errors='coerce').astype('Int64')

# 3. MERGE SAA & PRIX
saa_and_price = pd.merge(
    saa, 
    price, 
    how='inner', 
    left_on=['item_key','Annee'], 
    right_on=['culture_key','year']
)

saa_and_price.drop(columns=['Item_Label','item_key','year','culture_key'], inplace=True)
saa_and_price['rend_euro_par_ha'] = saa_and_price['REND'] / 10 * saa_and_price['prixMoyen']
saa_and_price['PROD'] = saa_and_price['PROD']/10 # PASSAGE A LA TONNE (On était en quintale)

def clean_key(text):
    if not isinstance(text, str): return ""
    # Enlève les accents, met en minuscule, remplace les tirets et apostrophes
    text = "".join(c for c in unicodedata.normalize('NFD', text) if unicodedata.category(c) != 'Mn')
    return text.lower().replace("-", " ").replace("'", " ").strip()

# GESTION DES RÉGIONS - ajouter les régions sachant qu on a les départements, mappaing simple(LLM pour avoir tt les couples)...
region_map = {
    'Auvergne-Rhône-Alpes': ['Ain', 'Allier', 'Ardèche', 'Cantal', 'Drôme', 'Isère', 'Loire', 'Haute-Loire', 'Puy-de-Dôme', 'Rhône', 'Savoie', 'Haute-Savoie'],
    'Bourgogne-Franche-Comté': ['Côte-d\'Or', 'Doubs', 'Jura', 'Nièvre', 'Haute-Saône', 'Saône-et-Loire', 'Yonne', 'Territoire de Belfort'],
    'Bretagne': ['Côtes-d\'Armor', 'Finistère', 'Ille-et-Vilaine', 'Morbihan'],
    'Centre-Val de Loire': ['Cher', 'Eure-et-Loir', 'Indre', 'Indre-et-Loire', 'Loir-et-Cher', 'Loiret'],
    'Corse': ['Corse-du-Sud', 'Haute-Corse'],
    'Grand Est': ['Ardennes', 'Aube', 'Marne', 'Haute-Marne', 'Meurthe-et-Moselle', 'Meuse', 'Moselle', 'Bas-Rhin', 'Haut-Rhin', 'Vosges'],
    'Hauts-de-France': ['Aisne', 'Nord', 'Oise', 'Pas-de-Calais', 'Somme'],
    'Ile-de-France': ['Paris', 'Seine-et-Marne', 'Yvelines', 'Essonne', 'Hauts-de-Seine', 'Seine-Saint-Denis', 'Val-de-Marne', 'Val-d\'Oise'],
    'Normandie': ['Calvados', 'Eure', 'Manche', 'Orne', 'Seine-Maritime'],
    'Nouvelle Aquitaine': ['Charente', 'Charente-Maritime', 'Corrèze', 'Creuse', 'Dordogne', 'Gironde', 'Landes', 'Lot-et-Garonne', 'Pyrénées-Atlantiques', 'Deux-Sèvres', 'Vienne', 'Haute-Vienne'],
    'Occitanie': ['Ariège', 'Aude', 'Aveyron', 'Gard', 'Haute-Garonne', 'Gers', 'Hérault', 'Lot', 'Lozère', 'Hautes-Pyrénées', 'Pyrénées-Orientales', 'Tarn', 'Tarn-et-Garonne'],
    'Pays de la Loire': ['Loire-Atlantique', 'Maine-et-Loire', 'Mayenne', 'Sarthe', 'Vendée'],
    'PACA': ['Alpes-de-Haute-Provence', 'Hautes-Alpes', 'Alpes-Maritimes', 'Bouches-du-Rhône', 'Var', 'Vaucluse']
}

# On applique clean_key sur le dictionnaire pour éviter que les tirets/accents fassent planter le mapping
dep_to_region = {clean_key(dep): reg for reg, deps in region_map.items() for dep in deps}

saa_and_price['dep_key'] = saa_and_price['Dep_Name'].apply(clean_key)
saa_and_price['cult_key'] = saa_and_price['culture'].apply(clean_key)
saa_and_price['NOM_REGION'] = saa_and_price['dep_key'].map(dep_to_region)

stock['dep_key'] = stock['NOM_DEPARTEMENT'].apply(clean_key)
stock['cult_key'] = stock['ESPECES'].apply(clean_key)


## Encore des prbl d'encodage dans le stock
def bypass_encoding_errors(cult):
    cult = str(cult)
    if 'tendre' in cult: return 'ble tendre'
    if 'dur' in cult: return 'ble dur'
    if 'ma' in cult and 's' in cult: return 'mais'
    if 'reales' in cult: return 'cereales autres'
    if 'gumineuses' in cult: return 'legumineuses autres'
    if 'verole' in cult: return 'feverole'
    return cult

stock['cult_key'] = stock['cult_key'].apply(bypass_encoding_errors)


name_to_code = {
    'Ile-de-France': 11, 'Centre-Val de Loire': 24, 'Bourgogne-Franche-Comté': 27,
    'Normandie': 28, 'Hauts-de-France': 32, 'Grand Est': 44, 'Pays de la Loire': 52,
    'Bretagne': 53, 'Nouvelle Aquitaine': 75, 'Occitanie': 76,
    'Auvergne-Rhône-Alpes': 84, 'PACA': 93, 'Corse': 94
}
saa_and_price['CODE_REGION'] = saa_and_price['NOM_REGION'].map(name_to_code)

df_final = pd.merge(
    saa_and_price,
    stock,
    how='left',
    left_on=['dep_key', 'Annee', 'cult_key'],
    right_on=['dep_key', 'ANNEE', 'cult_key'],
    suffixes=('', '_stock')
)

# On a des prix en été et en hiver / On crée 2 saisons...

mois_ete = [4, 5, 6, 7, 8, 9]       # Avril à Septembre inclus
mois_hiver = [10, 11, 12, 1, 2, 3]  # Octobre à Mars inclus


cond_vide = df_final['MOIS'].isna()  # (cas de la pomme de terre) / finalement on a enlevé la pomme de terre du fichier final.
cond_ete = (df_final['saison'] == 'Été (Récolte)') & (df_final['MOIS'].isin(mois_ete))
cond_hiver = (df_final['saison'] == 'Hiver (Stockage)') & (df_final['MOIS'].isin(mois_hiver)) #Hiver


df_final = df_final[cond_vide | cond_ete | cond_hiver]

cols_to_drop = [
    'ANNEE', 'NOM_REGION_stock', 'CODE_REGION_stock', 
    'ESPECES', 'cult_key', 'dep_key', 'NOM_DEPARTEMENT', 'NUMERO_DEPARTEMENT '
]
df_final.drop(columns=cols_to_drop, inplace=True, errors='ignore')

# Export
df_final.to_csv('saa_stock_price2.csv', index=False, encoding='utf-8')

print("Dimensions du dataframe final :", df_final.shape)
print(df_final[df_final['culture'] == 'Blé tendre'].head())