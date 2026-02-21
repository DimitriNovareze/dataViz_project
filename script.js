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
        csv: "saa_stock_price.csv"
    },
    visu: {
        radiusMin: 2,  // Rayon pixels (Pire rendement)
        radiusMax: 15, // Rayon pixels (Meilleur rendement)
        colors: {
            prod: d3.interpolateGreens,
            stars: ["#ffffff", "#FFD700", "#FF4500"], // Blanc -> Or -> Rouge
            mapFill: "#ececec",
            mapStroke: "white",
            noData: "#f0f0f0"
        },
        transitionDuration: 750
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

        // Premier Rendu ///////////////////////////////////////////////////////
        updateEngine();

        // Line Chart
        initChartContainer();
        updateChart();

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

    projection = d3.geoConicConformal()
        .center([2.454071, 46.279229])
        .scale(3000)
        .translate([w / 2, h / 2]);

    path = d3.geoPath().projection(projection);
    tooltip = d3.select("#tooltip");
    circleSymbol = d3.symbol().type(d3.symbolCircle);
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
const chartMargin = { top: 10, right: 30, bottom: 20, left: 50 };

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
        .transition().duration(500)
        .attr("d", line)
        .attr("stroke", STATE.chart.metric === 'rentabilite' ? "#e67e22" : 
                        isMonthly ? "#2980b9" : "#27ae60");
}
// --- RENDERERS ---------------------------------------------------------------

function renderMapLayer(data, scales) {
    const paths = g.selectAll("path.map-area")
        .data(data.features, d => d.properties.code);

    paths.join(
        // ... (enter et update restent identiques) ...
        enter => enter.append("path")
            .attr("class", "map-area")
            .attr("d", path)
            // ... reste du style ...
            .call(e => e.transition().duration(CONFIG.visu.transitionDuration)
                .attr("fill", d => getFillColor(d, data.map, scales.color))),
        
        update => update.call(u => u.transition().duration(CONFIG.visu.transitionDuration)
            .attr("d", path)
            .attr("fill", d => getFillColor(d, data.map, scales.color)))
    )
    .on("click", (e, d) => handleZoom(d))
    
    // --- MODIFICATION ICI : MOUSEMOVE ---
    .on("mousemove", (e, d) => {
        showTooltip(e, d, data.map, scales);
        
        // Mise à jour du graphique SI on change de cible
        if (STATE.chart.targetCode !== d.properties.code) {
            STATE.chart.targetCode = d.properties.code;
            STATE.chart.targetName = d.properties.nom;
            updateChart();
        }
    })
    
    // --- MODIFICATION ICI : MOUSEOUT ---
    .on("mouseout", () => {
        tooltip.classed("hidden", true);
        
        // Optionnel : Revenir à la vue nationale quand on quitte
        // STATE.chart.targetCode = null;
        // STATE.chart.targetName = "France";
        // updateChart();
    });
}
function renderSymbolsLayer(data, scales) {
    const stars = g.selectAll("path.star")
        .data(data.features, d => d.properties.code);

    stars.join(
        enter => enter.append("path")
            .attr("class", "star")
            .attr("transform", d => Utils.getCentroidStr(path, d, 0))
            .attr("d", circleSymbol.size(0)) // Départ invisible
            .style("stroke", "#333")
            .style("stroke-width", (0.2 / STATE.view.zoomLevel) + "px")
            .call(e => e.transition().duration(CONFIG.visu.transitionDuration).delay(100)
                .style("fill", d => getStarColor(d, data.map, scales.starColor))
                .attr("d", d => getStarPath(d, data.map, scales.radius))
                .attr("transform", d => Utils.getCentroidStr(path, d, 1))),
        
        update => update.call(u => u.transition().duration(CONFIG.visu.transitionDuration)
            .style("fill", d => getStarColor(d, data.map, scales.starColor))
            .style("stroke-width", (0.2 / STATE.view.zoomLevel) + "px")
            .attr("d", d => getStarPath(d, data.map, scales.radius))
            .attr("transform", d => Utils.getCentroidStr(path, d, 1))),

        exit => exit.transition().duration(200)
            .attr("transform", d => Utils.getCentroidStr(path, d, 0))
            .remove()
    );
}

function renderLegends(stats, scales) {
    // 1. Légende Couleur (Production)
    const fmtProd = stats.maxProd > 1000 ? (stats.maxProd/1000).toFixed(1)+" kT" : Math.round(stats.maxProd)+" T";
    d3.select("#legend-prod-min").text("0");
    d3.select("#legend-prod-max").text(fmtProd);

    // 2. Légende Taille (Rendement) - SVG
    const container = d3.select("#legend-size-container");
    container.html(""); // Reset

    if(stats.maxRent === 0) return;

    const legSvg = container.append("svg").attr("width", 200).attr("height", 60);
    
    // Valeurs à afficher (Min, Moyenne, Max)
    const values = [stats.minRent, (stats.minRent + stats.maxRent)/2, stats.maxRent];
    const labels = ["Min", "Moy", "Max"];
    
    // Rayons *sans* la division du zoom pour la légende (taille "base")
    // Note: Pour la légende, on veut montrer la taille relative visuelle "idéale"
    // ou la taille à l'écran. Ici on montre la taille 2px -> 15px.
    const legScale = d3.scaleSqrt()
        .domain([stats.minRent, stats.maxRent])
        .range([CONFIG.visu.radiusMin, CONFIG.visu.radiusMax]);

    let xPos = 30;
    values.forEach((val, i) => {
        const r = legScale(val);
        // Cercle ou Étoile
        legSvg.append("path")
            .attr("d", d3.symbol().type(d3.symbolStar).size(Math.PI * r * r)())
            .attr("transform", `translate(${xPos}, 30)`)
            .style("fill", scales.starColor(val))
            .style("stroke", "#333");
            
        // Texte
        legSvg.append("text")
            .attr("x", xPos)
            .attr("y", 55)
            .attr("text-anchor", "middle")
            .style("font-size", "10px")
            .style("fill", "#333")
            .text(Math.round(val));

        xPos += 60; // Espacement
    });
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
        html += `<br><span style="color:#2ecc71">█</span> Prod: ${Math.round(val.production).toLocaleString()} T`;
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
        
        // Calcul Bounding Box
        const container = document.getElementById('map-container');
        const bounds = path.bounds(feature);
        const dx = bounds[1][0] - bounds[0][0];
        const dy = bounds[1][1] - bounds[0][1];
        const x = (bounds[0][0] + bounds[1][0]) / 2;
        const y = (bounds[0][1] + bounds[1][1]) / 2;
        
        const scale = 0.9 / Math.max(dx / container.clientWidth, dy / container.clientHeight);
        STATE.view.zoomLevel = scale; // Stockage dans le STATE

        const translate = [container.clientWidth / 2 - scale * x, container.clientHeight / 2 - scale * y];

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

// Lancement de l'application
initApp();
