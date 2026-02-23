/**
 * ARCHITECTURE MODULAIRE
 * 1. CONFIG : Paramètres statiques
 * 2. STATE  : État dynamique (Filtres, Zoom)
 * 3. CORE   : Chargement et traitement des données
 * 4. ENGINE : Moteur de rendu (D3.js)
 */

// =============================================================================
// 1. CONFIGURATION
// =============================================================================
const CONFIG = {
    urls: {
        regions: "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/regions-version-simplifiee.geojson",
        depts: "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/departements-version-simplifiee.geojson",
        csv: "saa_stock_price2.csv"
    },
    visu: {
        radiusMin: 6,  // Rayon pixels (Pire rendement)
        radiusMax: 20, // Rayon pixels (Meilleur rendement)
        colors: {
            prod: d3.interpolateGreens,
            stars: ["#ffffff", "#FFD700", "#FF4500"], // Blanc -> Or -> Rouge
            mapFill: "#ececec",
            mapStroke: "white",
            noData: "#f0f0f0"
        },
        transitionDuration: 650
    },
    // Mapping Départements -> Régions
    deptToRegion: {
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
};

// =============================================================================
// 2. STATE MANAGEMENT (État de l'application)
// =============================================================================
const STATE = {
    data: [],           // Données brutes CSV
    geo: {              // Données Géographiques
        regions: null,
        depts: null
    },
    filters: {          // Filtres actifs
        culture: null,
        annee: null,
        saison: null
    },
    view: {             // État de la vue
        regionCode: null, // null = Vue Nationale
        zoomLevel: 1
    },

    table: {
        allCultures: false // Par défaut, on filtre selon la culture globale
    },

    chart: {
        metric: 'production', // 'production', 'rentabilite', ou 'stock'
        targetName: 'France',
        targetCode: null // null = France, sinon Code Région/Dept
    }
};

// =============================================================================
// 3. CORE (Chargement & Nettoyage)
// =============================================================================

const Utils = {
    parseNum: (val) => {
        if (val === undefined || val === null || val === "") return 0;
        let str = String(val);
        const clean = str.replace(/\s/g, '').replace(',', '.');
        const num = parseFloat(clean);
        return isNaN(num) ? 0 : num;
    },
    getCentroidStr: (path, d, scaleCheck) => {
        const center = path.centroid(d);
        if (isNaN(center[0])) return "translate(0,0) scale(0)";
        return scaleCheck === 0 
            ? `translate(${center[0]}, ${center[1]}) scale(0)` 
            : `translate(${center[0]}, ${center[1]})`;
    }
};
function formatProduction(tonnes, isShort = false) {
    const unit = STATE.view.prodUnit;
    
    if (unit === 'eiffel') {
        const eiffels = tonnes / 10100;
        // On affiche plus de décimales si le chiffre est tout petit
        return (eiffels < 0.1 && eiffels > 0 ? eiffels.toFixed(3) : eiffels.toFixed(1)) + " 🗼";
    } 
    else if (unit === 'pyramid') {
        const pyr = tonnes / 5750000;
        return (pyr < 0.1 && pyr > 0 ? pyr.toFixed(4) : pyr.toFixed(2)) + " 🔺";
    } 
    else {
        // Mode classique (Tonnes)
        if (isShort && tonnes >= 1000) return (tonnes / 1000).toFixed(1) + " kT";
        return Math.round(tonnes).toLocaleString() + " T";
    }
};

async function initApp() {
    try {
        // Chargement //////////////////////////////////////////////////////////
        const [csvData, regionsGeo, deptsGeo] = await Promise.all([
            d3.csv(CONFIG.urls.csv),
            d3.json(CONFIG.urls.regions),
            d3.json(CONFIG.urls.depts)
        ]);

        // Nettoyage ///////////////////////////////////////////////////////////
        STATE.data = csvData.map(d => ({
            ...d,
            Dep_Code: d.Dep_Code ? d.Dep_Code.toString().padStart(2, '0') : "00",
            Annee: Utils.parseNum(d.Annee),
            Mois: Utils.parseNum(d.MOIS),
            
            Saison: d.saison || "Annuel",
            rend_euro_par_ha: Utils.parseNum(d.rend_euro_par_ha),
            production: Utils.parseNum(d.PROD),
            stock: Utils.parseNum(d.STOCKS),
            Surface: Utils.parseNum(d.SURF),
        }));

        STATE.geo.regions = regionsGeo;
        STATE.geo.depts = deptsGeo;

        // Initialisation UI ///////////////////////////////////////////////////
        initMenus();
        initMapContainer();

          // Line Chart
        initChartContainer();
        updateChart();

        initBarChart();
        updateBarChart();


        // Premier Rendu ///////////////////////////////////////////////////////
        updateEngine();

      

    } catch (error) {
        console.error("Erreur critique:", error);
        alert("Impossible de charger les données.");
    }
}

function initMenus() {
    // Helpers pour remplir les selects
    const unique = (key) => [...new Set(STATE.data.map(d => d[key]))].sort();
    
    const setupSelect = (id, key, isNum = false) => {
        const opts = unique(key);
        if(isNum) opts.sort((a,b) => b - a);
        
        const sel = d3.select(id);
        sel.selectAll("option").data(opts).enter().append("option").text(d => d);
        
        // Sélection par défaut
        if (opts.length > 0) sel.property("value", opts[0]);
        
        // Listener
        sel.on("change", () => {
            STATE.filters[key] = isNum ? +sel.property("value") : sel.property("value");
            updateEngine();
        });

        // Set initial state
        STATE.filters[key] = isNum ? +sel.property("value") : sel.property("value");
    };

    setupSelect("#select-culture", "culture");
    setupSelect("#select-annee", "Annee", true);
    
    // Pour saison, on filtre les vides
    const saisons = [...new Set(STATE.data.map(d => d.Saison))].filter(s => s).sort();
    const selSaison = d3.select("#select-saison");
    selSaison.selectAll("option").data(saisons).enter().append("option").text(d => d);
    if(saisons.length) selSaison.property("value", saisons[0]);
    
    selSaison.on("change", () => {
        STATE.filters.saison = selSaison.property("value");
        updateEngine();
    });
    STATE.filters.saison = selSaison.property("value");

    d3.select("#btn-back").on("click", resetZoom);
    // --- NOUVEAU : Gestion du changement d'unité ---
    const selUnit = d3.select("#select-unit");
    selUnit.on("change", () => {
        STATE.view.prodUnit = selUnit.property("value");
        updateEngine(); // Relance le calcul pour mettre à jour la légende
        // Si on a un graphique affiché, on force aussi la mise à jour des labels
        updateChart(); 
    });

    // Gestion du bouton "Sans Filtres" du tableau
    const btnTableFilter = d3.select("#btn-table-filter");
    btnTableFilter.on("click", function() {
        STATE.table.allCultures = !STATE.table.allCultures;
        if (STATE.table.allCultures) {
            d3.select(this).classed("active", true).text("Sans Filtres");
        } else {
            d3.select(this).classed("active", false).text("Culture ciblée");
        }
        updateTable(); // On met à jour QUE le tableau, pas la carte entière
    });
}

// =============================================================================
// 4. ENGINE (Moteur de Rendu)
// =============================================================================

let svg, g, path, projection, tooltip, circleSymbol;

function initMapContainer() {
    const container = document.getElementById('map-container');
    const w = container.clientWidth;
    const h = container.clientHeight;

    d3.select("#map-container svg").remove();

    svg = d3.select("#map-container").append("svg")
        .attr("width", "100%").attr("height", "100%")
        .attr("viewBox", `0 0 ${w} ${h}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

    g = svg.append("g");

    // CRÉATION DES CALQUES
    g.append("path").attr("id", "map-outline"); 
    g.append("g").attr("id", "map-areas");      
    g.append("g").attr("id", "map-symbols");    

    // 👇 NOUVEAU CODE ICI 👇
    projection = d3.geoConicConformal();
    
    // fitSize demande à D3 de centrer et zoomer parfaitement la France dans l'espace (w, h)
    // On ajoute un petit padding (ex: marge de 30px) pour que ça ne touche pas les bords
    const padTop = 30;
    const padBottom = 30;
    const padLeft = 30;
    const padRight = 360; // 320px (Légende) + 20px (Marge droite) + 20px (Espace visuel)

    // On force D3 à dessiner la carte dans cette zone restreinte
    projection.fitExtent(
        [[padLeft, padTop], [w - padRight, h - padBottom]], 
        STATE.geo.regions
    );

    path = d3.geoPath().projection(projection);
    tooltip = d3.select("#tooltip");
    circleSymbol = d3.symbol().type(d3.symbolCircle);
}

// =============================================================================
// 6. TABLEAU DES MEILLEURS RENDEMENTS
// =============================================================================
function updateTable() {
    // 1. Filtre temporel de base (Année et Saison)
    let tData = STATE.data.filter(d => 
        d.Annee === STATE.filters.Annee && 
        d.Saison === STATE.filters.saison
    );

    // 2. Filtre de culture conditionnel (Bouton "Sans Filtre")
    if (!STATE.table.allCultures) {
        tData = tData.filter(d => d.culture === STATE.filters.culture);
    }

    // 3. Calcul de la moyenne par Département et par Culture
    // Cela nous donne une structure Map(Dep_Code -> Map(Culture -> Moyenne Rendement))
    const deptStats = d3.rollup(tData,
        v => d3.mean(v, d => d.rend_euro_par_ha),
        d => d.Dep_Code,
        d => d.culture
    );

    // 4. Aplatissement des données pour le tableau
    let flatData = [];
    
    // On boucle directement sur les départements
    for (const [deptCode, cultures] of deptStats.entries()) {
        
        // Recherche du nom du département dans les données géographiques
        const feature = STATE.geo.depts.features.find(f => f.properties.code === deptCode);
        // Fallback sécurisé au cas où un code n'a pas de correspondance GeoJSON
        const deptName = feature ? feature.properties.nom : `Dépt ${deptCode}`;

        for (const [culture, avgRent] of cultures.entries()) {
            if (avgRent > 0) {
                flatData.push({ 
                    departement: deptName, 
                    culture: culture, 
                    rent: avgRent 
                });
            }
        }
    }

    // 5. Tri décroissant et limitation au Top 15
    flatData.sort((a, b) => b.rent - a.rent);
    const topData = flatData.slice(0, 15);

    // 6. Rendu dans le DOM avec le pattern D3 (Join)
    const tbody = d3.select("#yield-table tbody");
    // La clé d'identification combine les 3 données pour forcer l'animation si une valeur change
    const rows = tbody.selectAll("tr").data(topData, d => d.departement + d.culture + d.rent);

    rows.join(
        enter => {
            const tr = enter.append("tr").style("opacity", 0);
            tr.append("td").text(d => d.departement).style("font-weight", "500");
            tr.append("td").text(d => d.culture);
            tr.append("td").text(d => Math.round(d.rent) + " €")
              .style("color", "#27ae60").style("font-weight", "bold");
            
            tr.transition().duration(400).style("opacity", 1);
            return tr;
        },
        update => {
            update.select("td:nth-child(1)").text(d => d.departement);
            update.select("td:nth-child(2)").text(d => d.culture);
            update.select("td:nth-child(3)").text(d => Math.round(d.rent) + " €");
            return update;
        },
        exit => exit.remove()
    );
}

// Fonction centrale qui orchestre tout
function updateEngine() {
    // 1. Filtrer les données
    const filtered = STATE.data.filter(d => 
        d.culture === STATE.filters.culture && 
        d.Annee === STATE.filters.Annee && 
        d.Saison === STATE.filters.saison   
    );

    // 2. Préparer la géométrie et les stats
    const processed = processGeoData(filtered);

    // 3. Calculer les échelles dynamiques
    const scales = calculateScales(processed.stats);

    // 4. Dessiner les couches
    renderMapLayer(processed, scales);
    renderSymbolsLayer(processed, scales);
    
    // 5. Mettre à jour les légendes
    renderLegends(processed.stats, scales);

    updateChart();
    updateBarChart();
    updateTable();
}

function processGeoData(filteredData) {
    let geoFeatures, dataMap = new Map(), maxProd = 0, maxRent = 0, minRent = Infinity;

    // 1. ÉTAPE CLÉ : Dédoublonner en moyennant les 12 lignes de chaque département
    const deptAnnualStats = d3.rollup(filteredData, 
        v => ({
            production: d3.mean(v, d => d.production), // La moyenne donne la vraie valeur annuelle
            rentabilite: d3.mean(v, d => d.rend_euro_par_ha)
        }),
        d => d.Dep_Code
    );

    if (STATE.view.regionCode === null) {
        // --- VUE NATIONALE ---
        geoFeatures = STATE.geo.regions.features;
        
        // 2. Agréger les vraies valeurs départementales par région
        const regionStats = new Map();
        for (const [deptCode, stats] of deptAnnualStats.entries()) {
            const regCode = CONFIG.deptToRegion[deptCode];
            if (!regCode) continue;

            if (!regionStats.has(regCode)) {
                regionStats.set(regCode, { prodSum: 0, rentSum: 0, count: 0 });
            }
            const r = regionStats.get(regCode);
            r.prodSum += stats.production; // Ici on peut faire une somme, les doublons sont partis !
            r.rentSum += stats.rentabilite;
            r.count += 1;
        }

        // 3. Remplir dataMap et calculer les échelles
        for (const [regCode, stats] of regionStats.entries()) {
            const rent = stats.count > 0 ? stats.rentSum / stats.count : 0;
            dataMap.set(regCode, { production: stats.prodSum, rentabilite: rent });

            if (stats.prodSum > maxProd) maxProd = stats.prodSum;
            if (rent > maxRent) maxRent = rent;
            if (rent < minRent && rent > 0) minRent = rent;
        }

    } else {
        // --- VUE DÉPARTEMENTALE ---
        geoFeatures = STATE.geo.depts.features.filter(f => 
            CONFIG.deptToRegion[f.properties.code] === STATE.view.regionCode
        );
        
        // On transfère directement les valeurs calculées à l'étape 1
        for (const [deptCode, stats] of deptAnnualStats.entries()) {
            if (CONFIG.deptToRegion[deptCode] === STATE.view.regionCode) {
                dataMap.set(deptCode, stats);
                if (stats.production > maxProd) maxProd = stats.production;
                if (stats.rentabilite > maxRent) maxRent = stats.rentabilite;
                if (stats.rentabilite < minRent && stats.rentabilite > 0) minRent = stats.rentabilite;
            }
        }
    }

    if (minRent === Infinity) minRent = 0;

    return { features: geoFeatures, map: dataMap, stats: { maxProd, maxRent, minRent } };
}

function calculateScales(stats) {
    return {
        // Couleur : Production
        color: d3.scaleSequential(CONFIG.visu.colors.prod)
            .domain([0, stats.maxProd || 1]),
        
        // Couleur Étoile : Rentabilité
        starColor: d3.scaleLinear()
            .domain([0, stats.maxRent * 0.5, stats.maxRent || 1])
            .range(CONFIG.visu.colors.stars),

        // Taille Étoile : Rentabilité (C'est ici qu'on applique votre demande)
        // Domain: du pire rendement observé (minRent) au meilleur (maxRent)
        // Range: de 2px à 15px (ajusté par le zoom pour rester lisible)
        radius: d3.scaleSqrt()
            .domain([stats.minRent, stats.maxRent || 1])
            .range([
                CONFIG.visu.radiusMin / STATE.view.zoomLevel, 
                CONFIG.visu.radiusMax / STATE.view.zoomLevel
            ])
    };
}

let chartSvg, chartG, xScale, yScale, lineGenerator, xAxis, yAxis;
const chartMargin = { top: 10, right: 30, bottom: 20, left: 70 };

function initChartContainer() {
    const container = document.getElementById('line-chart');
    const w = container.clientWidth;
    const h = container.clientHeight;
    
    // Création SVG unique
    chartSvg = d3.select("#line-chart").append("svg")
        .attr("width", "100%")
        .attr("height", "100%")
        .attr("viewBox", `0 0 ${w} ${h}`);
        
    chartG = chartSvg.append("g")
        .attr("transform", `translate(${chartMargin.left},${chartMargin.top})`);

    // Dans initChartContainer()
    xScale = d3.scaleTime().range([0, w - chartMargin.left - chartMargin.right]); // MODIFIÉ
    yScale = d3.scaleLinear().range([h - chartMargin.top - chartMargin.bottom, 0]);

    // Axes
    chartG.append("g").attr("class", "x-axis")
        .attr("transform", `translate(0, ${h - chartMargin.top - chartMargin.bottom})`);
    chartG.append("g").attr("class", "y-axis");

    // Ligne
    chartG.append("path").attr("class", "line-path");

//TOOLTIP

    const focus = chartG.append("g")
        .attr("class", "focus")
        .style("display", "none");

    // Ligne verticale
    focus.append("line")
        .attr("class", "focus-line")
        .attr("y1", 0)
        .style("stroke", "#999")
        .style("stroke-width", "1px")
        .style("stroke-dasharray", "3 3"); // Ligne en pointillés

    // Petit cercle sur la courbe
    focus.append("circle")
        .attr("class", "focus-circle")
        .attr("r", 5)
        .style("fill", "#fff")
        .style("stroke", "#333")
        .style("stroke-width", "2px");

    // Rectangle invisible par-dessus le graphique pour capter la souris
    chartG.append("rect")
        .attr("class", "overlay")
        .style("fill", "none")
        .style("pointer-events", "all");



    // Listeners sur les boutons radio
    d3.selectAll("input[name='metric']").on("change", function() {
        STATE.chart.metric = this.value;
        updateChart();
    });
}
function updateChart() {
    let historyData = STATE.data.filter(d => 
        d.culture === STATE.filters.culture && 
        d.Saison === STATE.filters.saison
    );

    let title = "France";
    if (STATE.chart.targetCode) {
        if (STATE.view.regionCode === null) { 
            historyData = historyData.filter(d => CONFIG.deptToRegion[d.Dep_Code] === STATE.chart.targetCode);
        } else {
            historyData = historyData.filter(d => d.Dep_Code === STATE.chart.targetCode);
        }
        title = STATE.chart.targetName;
    }

    // Détecte si on est sur une métrique mensuelle ou annuelle
    // (J'ai mis 'surface' ou 'stock' selon ce que vous utilisez)
    const isMonthly = (STATE.chart.metric === 'surface' || STATE.chart.metric === 'stock');

    // Agrégation chronologique
    const nested = d3.rollups(historyData, 
        v => {
            if (isMonthly) {
                // MENSUEL : On somme simplement la surface de tous les départements pour CE mois-là
                return d3.sum(v, d => d.surface || d.stock || 0); 
            } else {
                // ANNUEL : On dédoublonne d'abord par département (moyenne), puis on somme/moyenne la zone
                const parDept = d3.rollup(v,
                    leaves => ({
                        prod: d3.mean(leaves, d => d.production),
                        rent: d3.mean(leaves, d => d.rend_euro_par_ha)
                    }),
                    d => d.Dep_Code
                );

                if (STATE.chart.metric === 'production') {
                    return d3.sum(Array.from(parDept.values()), d => d.prod);
                } else {
                    return d3.mean(Array.from(parDept.values()), d => d.rent);
                }
            }
        },
        // Astuce : Création d'une vraie Date. Si c'est annuel, on cale au 1er Janvier.
        d => isMonthly ? new Date(d.Annee, (d.Mois || 1) - 1, 1) : new Date(d.Annee, 0, 1)
    ).sort((a, b) => a[0] - b[0]);

    d3.select("#chart-title").text(`${title} : Historique ${STATE.chart.metric}`);

    if (nested.length === 0) {
        chartG.select(".line-path").attr("d", null);
        return;
    }

    xScale.domain(d3.extent(nested, d => d[0]));
    yScale.domain([0, d3.max(nested, d => d[1]) * 1.1]);

    const w = document.getElementById('line-chart').clientWidth;
    xScale.range([0, w - chartMargin.left - chartMargin.right]);

    // Formatage de l'axe X : affiche les années, mais comprend les mois
    chartG.select(".x-axis").transition()
        .call(d3.axisBottom(xScale).ticks(isMonthly ? d3.timeMonth.every(6) : d3.timeYear.every(1)).tickFormat(d3.timeFormat("%Y")));
    
    chartG.select(".y-axis").transition().call(d3.axisLeft(yScale).ticks(5));

    const line = d3.line()
        .x(d => xScale(d[0]))
        .y(d => yScale(d[1]))
        .curve(d3.curveMonotoneX);

    chartG.select(".line-path")
        .datum(nested)
        .attr("d", line)
        .attr("stroke", STATE.chart.metric === 'rentabilite' ? "#e67e22" : 
                        isMonthly ? "#2980b9" : "#27ae60");

//TOOL TIP

    const innerWidth = document.getElementById('line-chart').clientWidth - chartMargin.left - chartMargin.right;
    const innerHeight = document.getElementById('line-chart').clientHeight - chartMargin.top - chartMargin.bottom;
    
    chartG.select(".overlay")
        .attr("width", innerWidth)
        .attr("height", innerHeight);
        
    chartG.select(".focus-line").attr("y2", innerHeight);

    // Outil mathématique pour trouver le point le plus proche
    const bisectDate = d3.bisector(d => d[0]).left;

    // Interactions souris
    chartG.select(".overlay")
        .on("mouseover", () => {
            if (nested.length > 0) {
                chartG.select(".focus").style("display", null);
                tooltip.classed("hidden", false);
            }
        })
        .on("mouseout", () => {
            chartG.select(".focus").style("display", "none");
            tooltip.classed("hidden", true);
        })
        .on("mousemove", (event) => {
            if (nested.length === 0) return;

            // Déduire la date pointée par la souris sur l'axe X
            const x0 = xScale.invert(d3.pointer(event)[0]);
            
            // Trouver l'index de la donnée la plus proche
            const i = bisectDate(nested, x0, 1);
            const d0 = nested[i - 1];
            const d1 = nested[i];
            
            // Choisir le point exact le plus proche (à gauche ou à droite de la souris)
            let d;
            if (!d0) d = d1;
            else if (!d1) d = d0;
            else d = x0 - d0[0] > d1[0] - x0 ? d1 : d0;

            // Déplacer la ligne verticale et le cercle
            chartG.select(".focus")
                .attr("transform", `translate(${xScale(d[0])},0)`);
            chartG.select(".focus-circle")
                .attr("cy", yScale(d[1]))
                .style("stroke", STATE.chart.metric === 'rentabilite' ? "#e67e22" : isMonthly ? "#2980b9" : "#27ae60");

            // Formatage de la date (Année simple ou Mois + Année)
            const timeStr = isMonthly 
                ? d[0].toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) 
                : d[0].getFullYear();
            
            // Formatage de la valeur affichée
            let valStr = "";
            if (STATE.chart.metric === 'rentabilite') {
                valStr = Math.round(d[1]).toLocaleString() + " €/ha";
            } else {
                valStr = Math.round(d[1]).toLocaleString() + (STATE.chart.metric === 'stock' ? " T" : " T");
            }

            // Affichage dans le HTML du tooltip (le même qu'on utilise pour la carte !)
            tooltip.html(`<div style="text-align:center;">
                            <strong>${timeStr}</strong><br/>
                            <span style="font-size:1.1em; color:#FFD700">${valStr}</span>
                          </div>`)
                .style("left", (event.pageX + 15) + "px")
                .style("top", (event.pageY - 30) + "px");
        });
}




// --- RENDERERS ---------------------------------------------------------------

function renderMapLayer(data, scales) {
    g.select("#map-outline")
        .datum({type: "FeatureCollection", features: data.features})
        .attr("class", "map-outline")
        .attr("d", path);

    const paths = g.select("#map-areas").selectAll("path.map-area")
        .data(data.features, d => d.properties.code);

    paths.join(
        // ... (enter et update restent identiques) ...
        enter => enter.append("path")
            .attr("class", "map-area")
            .attr("d", path)
            // LIGNE AJOUTÉE : On force la couleur de départ à blanc (ou couleur vide)
            .attr("fill", "#ffffff") 
            .style("opacity", 0) 
            .call(e => e.transition().duration(CONFIG.visu.transitionDuration)
                .style("opacity", 1) 
                .attr("fill", d => getFillColor(d, data.map, scales.color))),
        
        update => update
            .attr("d", path)
            .call(u => u.transition().duration(CONFIG.visu.transitionDuration)
                .attr("fill", d => getFillColor(d, data.map, scales.color))),
            
        exit => exit.remove() 
    )
    .on("click", (e, d) => handleZoom(d))
    .on("mousemove", (e, d) => {
        showTooltip(e, d, data.map, scales);
        if (STATE.chart.targetCode !== d.properties.code) {
            STATE.chart.targetCode = d.properties.code;
            STATE.chart.targetName = d.properties.nom;
            updateChart();
            updateBarChart();
        }
    })
    .on("mouseout", () => {
        tooltip.classed("hidden", true);
    });
}
function renderSymbolsLayer(data, scales) {
    // Sélection des groupes (au lieu des simples paths)
    const nodes = g.select("#map-symbols").selectAll("g.symbol-node")
        .data(data.features, d => d.properties.code);

    // ==========================================
    // 1. APPARITION (Enter)
    // ==========================================
    const nodesEnter = nodes.enter().append("g")
        .attr("class", "symbol-node")
        .attr("transform", d => Utils.getCentroidStr(path, d, 1))
        .style("opacity", 0);

    nodesEnter.call(e => e.transition().duration(CONFIG.visu.transitionDuration).style("opacity", 1));

    // Ajout du cercle dans le groupe
    nodesEnter.append("path")
        .attr("class", "star")
        .style("stroke", "#333");

    // Ajout du texte (Label) dans le groupe
    nodesEnter.append("text")
        .attr("class", "yield-label")
        .attr("text-anchor", "middle") // Centre le texte horizontalement
        .style("fill", "#111")
        .style("font-family", "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif")
        .style("font-weight", "bold")
        .style("pointer-events", "none") // Empêche le texte de bloquer le hover de la carte
        // Effet "Halo" pour garantir la lisibilité même si ça déborde sur une ligne de frontière
        .style("paint-order", "stroke")
        .style("stroke", "rgba(255, 255, 255, 0.99)")
        .style("stroke-linecap", "round")
        .style("stroke-linejoin", "round");

    // ==========================================
    // 2. MISE À JOUR (Update + Enter)
    // ==========================================
    const nodesUpdate = nodesEnter.merge(nodes);

    // Mise à jour de la position du groupe
    nodesUpdate.attr("transform", d => Utils.getCentroidStr(path, d, 1));

    // Mise à jour du cercle
    nodesUpdate.select("path.star")
        .attr("d", d => getStarPath(d, data.map, scales.radius))
        .style("stroke-width", (0.2 / STATE.view.zoomLevel) + "px")
        .call(u => u.transition().duration(CONFIG.visu.transitionDuration)
            .style("fill", d => getStarColor(d, data.map, scales.starColor))
        );

    // Mise à jour dynamique du texte
    nodesUpdate.select("text.yield-label")
        .text(d => {
            const val = data.map.get(d.properties.code);
            // On affiche uniquement si la rentabilité existe et on arrondit à l'unité
            return (val && val.rentabilite > 0) ? Math.round(val.rentabilite) : "";
        })
        // La taille du texte et du halo s'adapte à l'inverse du niveau de zoom
        .style("font-size", (10 / STATE.view.zoomLevel) + "px")
        .style("stroke-width", (1.5 / STATE.view.zoomLevel) + "px")
        .attr("dy", d => {
            const val = data.map.get(d.properties.code);
            if (!val || val.rentabilite <= 0) return 0;

            const r = scales.radius(val.rentabilite);
            const str = Math.round(val.rentabilite).toString();
            
            // Évaluation de l'espace: ~6px de large par caractère (ajusté au zoom)
            const estimatedTextWidth = str.length * (6 / STATE.view.zoomLevel);
            
            // Règle de décision : Le diamètre (r*2) est-il plus large que le texte ?
            if ((r * 2) > estimatedTextWidth + (4 / STATE.view.zoomLevel)) {
                // Rentre dans le cercle : Centrage vertical
                return "0.35em"; 
            } else {
                // Ne rentre pas : Placement sous le cercle avec une petite marge
                return (r + (12 / STATE.view.zoomLevel)); 
            }
        });

    // ==========================================
    // 3. DISPARITION (Exit)
    // ==========================================
    nodes.exit().call(ex => ex.transition().duration(200)
        .style("opacity", 0)
        .remove()
    );
}

function renderLegends(stats, scales) {
    // =========================================================
    // 1. Légende Couleur (Production) - INCHANGÉE
    // =========================================================
    const fmtProd = formatProduction(stats.maxProd, true);
    d3.select("#legend-prod-min").text("0");
    d3.select("#legend-prod-max").text(fmtProd);

    // =========================================================
    // 2. Légende Taille (Rendement) - CERCLES TANGENTS
    // =========================================================
    const container = d3.select("#legend-size-container");
    container.html(""); // Reset

    if(stats.maxRent === 0) return;

    // Dimensions adaptées pour laisser la place aux lignes et textes à droite
    const svgWidth = 150;
    const svgHeight = 70;
    const legSvg = container.append("svg").attr("width", svgWidth).attr("height", svgHeight);
    
    // ÉTAPE 1 : Tri décroissant des valeurs à afficher (Max d'abord, Min à la fin)
    const values = [stats.maxRent, (stats.minRent + stats.maxRent)/2, stats.minRent];
    
    // Échelle des rayons (taille visuelle fixe pour la légende)
    const legScale = d3.scaleSqrt()
        .domain([stats.minRent, stats.maxRent])
        .range([CONFIG.visu.radiusMin, CONFIG.visu.radiusMax]);

    // ÉTAPE 2 : Définition des repères géométriques
    const cx = 40; // Centre X des cercles (décalé à gauche)
    const bottomY = svgHeight - 10; // Point de tangence bas commun

    // Calque 1 : Les cercles
    legSvg.selectAll("circle.legend-circle")
        .data(values)
        .enter()
        .append("circle")
        .attr("class", "legend-circle")
        .attr("cx", cx)
        // Application du principe géométrique : on soustrait le rayon à la ligne de base
        .attr("cy", d => bottomY - legScale(d)) 
        .attr("r", d => legScale(d))
        // Intérieur transparent pour ne pas cacher les cercles inférieurs
        .style("fill", "transparent") 
        // On conserve la couleur de l'échelle (jaune -> orange) sur le contour
        .style("stroke", d => scales.starColor(d)) 
        .style("stroke-width", "1.5px");

    // Calque 2 : Les lignes en pointillé
    legSvg.selectAll("line.legend-line")
        .data(values)
        .enter()
        .append("line")
        .attr("class", "legend-line")
        .attr("x1", cx)
        // Départ au sommet du cercle (Ligne de base - diamètre)
        .attr("y1", d => bottomY - (legScale(d) * 2)) 
        .attr("x2", cx + CONFIG.visu.radiusMax + 15) // Déport vers la droite
        .attr("y2", d => bottomY - (legScale(d) * 2))
        .style("stroke", "#888")
        .style("stroke-dasharray", "2,2")
        .style("stroke-width", "1px");

    // Calque 3 : Les étiquettes (Textes)
    legSvg.selectAll("text.legend-text")
        .data(values)
        .enter()
        .append("text")
        .attr("class", "legend-text")
        .attr("x", cx + CONFIG.visu.radiusMax + 20) // Positionné juste après la ligne
        .attr("y", d => bottomY - (legScale(d) * 2) + 4) // +4px pour centrer le texte avec la ligne
        .text(d => Math.round(d) + " €")
        .style("font-size", "10px")
        .style("fill", "#555");
}

// --- HELPERS DE RENDU --------------------------------------------------------

function getFillColor(d, map, scale) {
    const val = map.get(d.properties.code);
    return (val && val.production > 0) ? scale(val.production) : CONFIG.visu.colors.noData;
}

function getStarColor(d, map, scale) {
    const val = map.get(d.properties.code);
    return (val && val.rentabilite > 0) ? scale(val.rentabilite) : "none";
}

function getStarPath(d, map, scale) {
    const val = map.get(d.properties.code);
    if (!val || val.rentabilite <= 0) return circleSymbol.size(0)();
    
    // size() prend une surface. Surface = Pi * r^2
    const r = scale(val.rentabilite); 
    return circleSymbol.size(Math.PI * r * r)();
}

function showTooltip(event, d, map, scales) {
    const val = map.get(d.properties.code);
    let html = `<strong>${d.properties.nom}</strong>`;
    
    if (val && (val.production > 0 || val.rentabilite > 0)) {
        // Remplacez : html += `<br><span style="color:#2ecc71">█</span> Prod: ${Math.round(val.production).toLocaleString()} T`;
        html += `<br><span style="color:#2ecc71">█</span> Prod: ${formatProduction(val.production)}`;
        html += `<br><span style="color:${scales.starColor(val.rentabilite)}">★</span> Rent: ${Math.round(val.rentabilite)} €/ha`;
    } else {
        html += `<br><em>Pas de données</em>`;
    }

    tooltip.classed("hidden", false)
        .style("left", (event.pageX + 15) + "px")
        .style("top", (event.pageY - 15) + "px")
        .html(html);
}

// =============================================================================
// 5. INTERACTIONS (Zoom)
// =============================================================================

function handleZoom(feature) {
    if (STATE.view.regionCode === null) {
        STATE.view.regionCode = feature.properties.code;
        
        // Calcul Bounding Box de la région cliquée
        const container = document.getElementById('map-container');
        const bounds = path.bounds(feature);
        const dx = bounds[1][0] - bounds[0][0]; // Largeur de la région
        const dy = bounds[1][1] - bounds[0][1]; // Hauteur de la région
        const x = (bounds[0][0] + bounds[1][0]) / 2; // Centre X de la région
        const y = (bounds[0][1] + bounds[1][1]) / 2; // Centre Y de la région
        
        // 👇 NOUVEAU : Définition de l'espace visuel RÉEL 👇
        const padRight = 360; 
        const padLeft = 30;
        const availableWidth = container.clientWidth - padRight - padLeft;
        const availableHeight = container.clientHeight - 60; // 30px haut + 30px bas

        // Nouveau centre de l'écran (décalé vers la gauche)
        const visualCenterX = padLeft + (availableWidth / 2);
        const visualCenterY = container.clientHeight / 2;

        // On calcule le zoom maximal possible pour rentrer dans l'espace RÉEL
        const scale = 0.9 / Math.max(dx / availableWidth, dy / availableHeight);
        STATE.view.zoomLevel = scale; // Stockage dans le STATE

        // Translation vers le NOUVEAU centre visuel
        const translate = [visualCenterX - scale * x, visualCenterY - scale * y];

        g.transition().duration(CONFIG.visu.transitionDuration)
            .attr("transform", `translate(${translate})scale(${scale})`)
            .on("end", updateEngine); // Redessiner les étoiles après le zoom

        d3.select("#breadcrumb").classed("hidden", false);
        d3.select("#region-title").text(feature.properties.nom);
    }
}

function resetZoom() {
    STATE.view.regionCode = null;
    STATE.view.zoomLevel = 1;
    
    g.transition().duration(CONFIG.visu.transitionDuration)
        .attr("transform", "")
        .on("end", updateEngine);
        
    d3.select("#breadcrumb").classed("hidden", true);
}



let barSvg, barG, xBarScale, yBarScale;
const barMargin = { top: 15, right: 45, bottom: 20, left: 60 };

function initBarChart() {
    const container = document.getElementById('bar-chart');
    const w = container.clientWidth;
    const h = container.clientHeight;

    barSvg = d3.select("#bar-chart").append("svg")
        .attr("width", "100%")
        .attr("height", "100%")
        .attr("viewBox", `0 0 ${w} ${h}`);

    barG = barSvg.append("g")
        .attr("transform", `translate(${barMargin.left},${barMargin.top})`);

    // Échelles
    xBarScale = d3.scaleLinear().range([0, w - barMargin.left - barMargin.right]);
    yBarScale = d3.scaleBand().range([0, h - barMargin.top - barMargin.bottom]).padding(0.2);

    // Axes
    barG.append("g").attr("class", "x-bar-axis")
        .attr("transform", `translate(0, ${h - barMargin.top - barMargin.bottom})`);
    barG.append("g").attr("class", "y-bar-axis");

    // --- 2. NOUVEAU CODE : Ajout de la légende (Label uniquement) ---
    barG.append("text")
        .attr("class", "rent-legend-label")
        .attr("x", w - barMargin.left - barMargin.right) // Placé tout à droite de la zone de données
        .attr("y", -5) // Placé juste au-dessus des barres (rendu possible par margin.top = 15)
        .attr("text-anchor", "end") // Aligné sur la droite pour ne pas déborder
        .style("font-size", "10px")
        .style("font-style", "italic")
        .style("fill", "#e67e22") // Même couleur orange que le trait et le point du lollipop
        .text("Rentabilité (€/ha)");
}


function changeCultureFromBar(nouvelleCulture) {
    if (STATE.filters.culture === nouvelleCulture) return; // Ne rien faire si c'est déjà cliqué

    // 1. Mettre à jour l'état global
    STATE.filters.culture = nouvelleCulture;

    // 2. Mettre à jour le menu déroulant (Interface)
    d3.select("#select-culture").property("value", nouvelleCulture);

    // 3. Relancer tout le calcul (Carte + Courbe + Histogramme)
    updateEngine();
}


function updateBarChart() {
    // 1. Filtrer les données (Même Année, Même Saison, mais TOUTES LES CULTURES)
    let bData = STATE.data.filter(d => 
        d.Annee === STATE.filters.Annee && 
        d.Saison === STATE.filters.saison
    );

    // 2. Filtrage Géographique (France, Région survolée, ou Dépt survolé)
    let title = "France"; 
    
    if (STATE.chart.targetCode) {
        if (STATE.view.regionCode === null) {
            bData = bData.filter(d => CONFIG.deptToRegion[d.Dep_Code] === STATE.chart.targetCode);
        } else {
            bData = bData.filter(d => d.Dep_Code === STATE.chart.targetCode);
        }
        title = STATE.chart.targetName; 
    }

    d3.select("#bar-chart-title").text(`Comparaison : ${title}`);

    // 3. Agréger la PRODUCTION ET LE RENDEMENT par Culture
    const statsCulture = d3.rollups(bData, 
        v => {
            // Dédoublonnage : moyenne par département pour la prod et le rendement
            const parDept = d3.rollup(v, 
                leaves => ({
                    prod: d3.mean(leaves, d => d.production),
                    rent: d3.mean(leaves, d => d.rend_euro_par_ha)
                }), 
                d => d.Dep_Code
            );
            
            const arr = Array.from(parDept.values());
            return {
                production: d3.sum(arr, d => d.prod),
                // Moyenne des rendements des départements
                rentabilite: arr.length > 0 ? d3.mean(arr, d => d.rent) : 0 
            };
        },
        d => d.culture
    )
    // On transforme le tableau en objets clairs pour faciliter la lecture
    .map(([culture, stats]) => ({
        culture: culture,
        production: stats.production,
        rentabilite: stats.rentabilite
    }))
    .sort((a, b) => b.production - a.production) // Tri par production
    .slice(0, 5); // Top 5

    const innerWidth = document.getElementById('bar-chart').clientWidth - barMargin.left - barMargin.right;

    // 4. Mettre à jour les échelles (X Prod, Y Culture, et X Rentabilité)
    xBarScale.domain([0, d3.max(statsCulture, d => d.production) || 1]).range([0, innerWidth]);
    yBarScale.domain(statsCulture.map(d => d.culture));

    // NOUVEAU : Échelle dédiée au rendement (indépendante de la production)
    const xRentScale = d3.scaleLinear()
        .domain([0, d3.max(statsCulture, d => d.rentabilite) || 1])
        .range([0, innerWidth]);

    // 5. Mise à jour des Axes
    barG.select(".x-bar-axis").transition().duration(500).call(
        d3.axisBottom(xBarScale).ticks(3).tickFormat(d => {
            if (d >= 1000000) return (d / 1000000).toFixed(1) + "M";
            if (d >= 1000) return (d / 1000).toFixed(1) + "k";
            return d;
        })
    );
    
    barG.select(".y-bar-axis").transition().duration(500).call(d3.axisLeft(yBarScale));
    
    barG.select(".y-bar-axis").selectAll("text")
        .style("font-size", "10px")
        .style("cursor", "pointer")
        .style("font-weight", d => d === STATE.filters.culture ? "bold" : "normal")
        .on("click", (event, d) => changeCultureFromBar(d)); 

    // 6. Dessiner les BARRES (Production)
    const bars = barG.selectAll(".bar").data(statsCulture, d => d.culture);

    bars.join(
        enter => enter.append("rect")
            .attr("class", "bar")
            .attr("y", d => yBarScale(d.culture))
            .attr("height", yBarScale.bandwidth())
            .attr("x", 0)
            .attr("width", 0)
            .attr("fill", d => d.culture === STATE.filters.culture ? "#2cca49" : "#bdc3c7")
            .style("cursor", "pointer")
            .on("click", (event, d) => changeCultureFromBar(d.culture))
            .call(e => e.transition().duration(500).attr("width", d => xBarScale(d.production))),
        
        update => update
            .on("click", (event, d) => changeCultureFromBar(d.culture))
            .call(u => u.transition().duration(500)
                .attr("y", d => yBarScale(d.culture))
                .attr("height", yBarScale.bandwidth())
                .attr("width", d => xBarScale(d.production))
                .attr("fill", d => d.culture === STATE.filters.culture ? "#2cca49" : "#bdc3c7")),
            
        exit => exit.transition().duration(300).attr("width", 0).remove()
    );

    // 7. NOUVEAU : Dessiner les LIGNES (Rendement)
    const rentLines = barG.selectAll(".rent-line").data(statsCulture, d => d.culture);

    rentLines.join(
        enter => enter.append("line")
            .attr("class", "rent-line")
            // Centrage vertical : position Y de la barre + la moitié de sa hauteur
            .attr("y1", d => yBarScale(d.culture) + yBarScale.bandwidth() / 2)
            .attr("y2", d => yBarScale(d.culture) + yBarScale.bandwidth() / 2)
            .attr("x1", 0)
            .attr("x2", 0) // Départ à 0
            .attr("stroke", "#e67e22") // Couleur Orange pour rappeler la rentabilité du graphique principal
            .attr("stroke-width", 2)
            .style("pointer-events", "none") // Les clics passent à travers pour toucher la barre
            .call(e => e.transition().duration(500).attr("x2", d => xRentScale(d.rentabilite))),
            
        update => update.call(u => u.transition().duration(500)
            .attr("y1", d => yBarScale(d.culture) + yBarScale.bandwidth() / 2)
            .attr("y2", d => yBarScale(d.culture) + yBarScale.bandwidth() / 2)
            .attr("x2", d => xRentScale(d.rentabilite))),
            
        exit => exit.transition().duration(300).attr("x2", 0).remove()
    );

    // 8. NOUVEAU : Dessiner les POINTS (Fin de la ligne de Rendement)
    const rentDots = barG.selectAll(".rent-dot").data(statsCulture, d => d.culture);

    rentDots.join(
        enter => enter.append("circle")
            .attr("class", "rent-dot")
            .attr("cy", d => yBarScale(d.culture) + yBarScale.bandwidth() / 2)
            .attr("cx", 0)
            .attr("r", 4.5) // Taille du point
            .attr("fill", "#fff") // Fond blanc
            .attr("stroke", "#e67e22") // Contour orange
            .attr("stroke-width", 2)
            .style("pointer-events", "none")
            .call(e => e.transition().duration(500).attr("cx", d => xRentScale(d.rentabilite))),
            
        update => update.call(u => u.transition().duration(500)
            .attr("cy", d => yBarScale(d.culture) + yBarScale.bandwidth() / 2)
            .attr("cx", d => xRentScale(d.rentabilite))),
            
        exit => exit.transition().duration(300).attr("cx", 0).remove()
    );

    // 9. NOUVEAU : Dessiner les LABELS DE VALEURS (À droite du point)
    const rentLabels = barG.selectAll(".rent-label-value").data(statsCulture, d => d.culture);

    rentLabels.join(
        enter => enter.append("text")
            .attr("class", "rent-label-value")
            // Centrage vertical aligné sur le point
            .attr("y", d => yBarScale(d.culture) + yBarScale.bandwidth() / 2)
            .attr("dy", "0.35em") 
            .attr("x", 0) // Départ à 0 pour l'animation d'entrée
            .style("fill", "#e67e22") // Couleur assortie au lollipop
            .style("font-size", "10px")
            .style("font-weight", "bold")
            .style("pointer-events", "none") // Les clics passent au travers
            // Arrondi à la dizaine : 456 -> 460
            .text(d => Math.round(d.rentabilite / 10) * 10) 
            .call(e => e.transition().duration(500)
                // Position finale X : position du point + 10px de marge
                .attr("x", d => xRentScale(d.rentabilite) + 10) 
            ),
            
        update => update
            // Mise à jour de la valeur textuelle si les données changent
            .text(d => Math.round(d.rentabilite / 10) * 10)
            .call(u => u.transition().duration(500)
                .attr("y", d => yBarScale(d.culture) + yBarScale.bandwidth() / 2)
                .attr("x", d => xRentScale(d.rentabilite) + 10)
            ),
            
        // Animation de sortie vers la gauche
        exit => exit.transition().duration(300).attr("x", 0).remove()
    );
}

// Lancement de l'application
initApp();
