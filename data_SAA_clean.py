import pandas as pd

# 1. Définition du dictionnaire de correspondance (Mapping)
mapping = {
    # --- 1. LES CÉRÉALES (Regroupements via Totaux) ---
    "Total blé tendre (01 + 02)": "Blé tendre",
    "Total blé dur (04 + 05)": "Blé dur",
    "Total orge et escourgeon (08 + 09)": "Orge",
    "Total avoine (11 + 12)": "Avoine",
    "Total maïs grain et maïs semence (16 + 17 )": "Maïs", 
    "Total riz (24 + 25)": "Riz",
    
    # --- 2. LES CÉRÉALES (Lignes uniques) ---
    "Seigle": "Seigle",
    "Triticale": "Triticale",
    "Sorgho grain": "Sorgho",
    "Mélanges de céréales": "Mélanges de céréales (Méteil)",
    "Autres céréales non mélangées": "Autres céréales",

    # --- 3. LES OLÉAGINEUX ---
    "Total colza grain et navette (29 + 30)": "Colza",
    "Tournesol": "Tournesol",
    "Soja": "Soja",
    "Lin oléagineux": "Lin",
    "Autres oléagineux (hors chanvre)": "Autres oléagineux",

    # --- 4. LES PROTÉAGINEUX ET LÉGUMES SECS ---
    "Pois protéagineux": "Pois protéagineux",
    "Féveroles et fèves": "Féveroles",
    "Lupin doux": "Lupin",
    "Lentilles (y compris semences)": "Lentilles",
    "Pois chiches (y compris semences)": "Pois chiches",
    "Haricots secs (y compris semences)": "Haricots secs",
    "Mélange de pois": "Mélange de pois",
    "Légumes à cosse d'origine tropicale": "Légumes tropicaux",
    "Autres protéagineux": "Autres protéagineux",

    # --- 5. POMMES DE TERRE ---
    "Pommes de terre (01 + … + 05)": "Pommes de terre", 

    # --- 6. AUTRES ---
    "PAILLES": "Pailles",

    # --- 7. GRANDS TOTAUX ---
    "Total céréales (sauf riz) (03 + 06 + 07 + 10 + 13 + 18 + ... + 22)": "TOTAL Céréales (sauf riz)",
    "Total toutes céréales (23 + 26)": "TOTAL Toutes Céréales (avec riz)",
    "Total oléagineux (31 + … + 35)": "TOTAL Oléagineux",
    "Total protéagineux et légumes secs cultivés pour leur graine (37 + … + 45)": "TOTAL Protéagineux"
}

def clean_cop_data(input_csv):
    df = pd.read_csv(input_csv)

    # Filtrage sur les catégories COP ou PDT. On se restreint car trop de données (Notre objectif étant de jouer avec plusieurs jeu de données, la cotation des culutres et les stock )


    df_filtered = df[df['Category'].isin(['COP', 'PDT'])].copy()



    df_filtered['Dep_Code'] = df_filtered['Dep_Code'].astype(str).str.lstrip('0')
 
    # Application du mapping
    df_filtered['Label_Original'] = df_filtered['Item_Label']
    df_filtered = df_filtered[df_filtered['Item_Label'].isin(mapping.keys())]
    df_filtered['Item_Label'] = df_filtered['Item_Label'].map(mapping)

    # 3. Exportation vers le fichier final
    df_filtered.to_csv('data_SAA_clean.csv', index=False, encoding='utf-8-sig')
    print("Fichier data_COP_clean.csv généré avec succès.")

# Lancement du script
clean_cop_data('SAA_clean_3.csv')