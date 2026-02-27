import pandas as pd

input_file = "SCR-GRC-histDEP_collecte_stock_depuis_2000-C25.csv"
output_file = "stock_clean_departemental.csv"

deptToRegion = {
    "01": "84", "02": "32", "03": "84", "04": "93", "05": "93", "06": "93", "07": "84", "08": "44", "09": "76", "10": "44",
    "11": "76", "12": "76", "13": "93", "14": "28", "15": "84", "16": "75", "17": "75", "18": "24", "19": "75", "21": "27",
    "22": "53", "23": "75", "24": "75", "25": "27", "26": "84", "27": "28", "28": "24", "29": "53", "2A": "94", "2B": "94",
    "30": "76", "31": "76", "32": "76", "33": "75", "34": "76", "35": "53", "36": "24", "37": "24", "38": "84", "39": "27",
    "40": "75", "41": "24", "42": "84", "43": "84", "44": "52", "45": "24", "46": "76", "47": "75", "48": "76", "49": "52",
    "50": "28", "51": "44", "52": "44", "53": "52", "54": "44", "55": "44", "56": "53", "57": "44", "58": "27", "59": "32",
    "60": "32", "61": "28", "62": "32", "63": "84", "64": "75", "65": "76", "66": "76", "67": "44", "68": "44", "69": "84",
    "70": "27", "71": "27", "72": "52", "73": "84", "74": "84", "75": "11", "76": "28", "77": "11", "78": "11", "79": "75",
    "80": "32", "81": "76", "82": "76", "83": "93", "84": "93", "85": "52", "86": "75", "87": "75", "88": "44", "89": "27",
    "90": "27", "91": "11", "92": "11", "93": "11", "94": "11", "95": "11"
}

regionCodeToName = {
    "11": "Île-de-France",
    "24": "Centre-Val de Loire",
    "27": "Bourgogne-Franche-Comté",
    "28": "Normandie",
    "32": "Hauts-de-France",
    "44": "Grand Est",
    "52": "Pays de la Loire",
    "53": "Bretagne",
    "75": "Nouvelle-Aquitaine",
    "76": "Occitanie",
    "84": "Auvergne-Rhône-Alpes",
    "93": "Provence-Alpes-Côte d'Azur",
    "94": "Corse"
}

def clean_agricultural_data():
    print("Lecture et grand nettoyage...")
    
    # Lecture en gérant les espaces après les virgules
    try:
        df = pd.read_csv(input_file, sep=',', encoding='utf-8', skipinitialspace=True)
    except UnicodeDecodeError:
        df = pd.read_csv(input_file, sep=',', encoding='latin-1', skipinitialspace=True)

    df.columns = df.columns.str.strip()
    for col in ['ESPECES', 'NOM_DEPARTEMENT', 'NUMERO_DEPARTEMENT']:
        if col in df.columns:
            df[col] = df[col].astype(str).str.strip()

    # Formatage du Département (1 -> 01) #sinon rien s'affiche dans la carte
    if 'NUMERO_DEPARTEMENT' in df.columns:
        df['NUMERO_DEPARTEMENT'] = df['NUMERO_DEPARTEMENT'].apply(lambda x: x.zfill(2) if x.isdigit() else x)
        df['CODE_REGION'] = df['NUMERO_DEPARTEMENT'].map(deptToRegion)
        
        # MAPPING DU NOM DE REGION (On écrase la colonne d'origine !) #Encoding probleme...
        df['NOM_REGION'] = df['CODE_REGION'].map(regionCodeToName)

 
    df['STOCKS'] = pd.to_numeric(df['STOCKS'], errors='coerce').fillna(0)

    # Exportation finale
    df.to_csv(output_file, index=False, encoding='utf-8')
    print("Nettoyage terminé ! Aperçu des données :")
    print(df.head())

if __name__ == "__main__":
    clean_agricultural_data()