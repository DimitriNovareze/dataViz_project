// CONFIG – static parameters
const CONFIG = {
    urls: {
        regions: "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/regions-version-simplifiee.geojson",
        depts: "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/departements-version-simplifiee.geojson",
        csv: "saa_stock_price2.csv"
    },
    visu: {
        radiusMin: 6,
        radiusMax: 20,
        colors: {
            prod: d3.interpolateGreens,
            stars: ["#ffffff", "#FFD700", "#FF4500"],
            mapFill: "#ececec",
            mapStroke: "white",
            noData: "#f0f0f0"
        },
        transitionDuration: 650
    },
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

// STATE – dynamic application state
const STATE = {
    data: [],
    geo: { regions: null, depts: null },
    filters: { culture: null, annee: null, saison: null },
    view: { regionCode: null, zoomLevel: 1 },
    table: { allCultures: false },
    chart: { metric: 'production', targetName: 'France', targetCode: null }
};

// UTILS
const Utils = {
    parseNum(val) {
        if (val === undefined || val === null || val === "") return 0;
        const num = parseFloat(String(val).replace(/\s/g, '').replace(',', '.'));
        return isNaN(num) ? 0 : num;
    },
    getCentroidStr(path, d, scaleCheck) {
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
        const v = tonnes / 10100;
        return (v < 0.1 && v > 0 ? v.toFixed(3) : v.toFixed(1)) + " 🗼";
    }
    if (unit === 'pyramid') {
        const v = tonnes / 5750000;
        return (v < 0.1 && v > 0 ? v.toFixed(4) : v.toFixed(2)) + " 🔺";
    }
    if (isShort && tonnes >= 1000) return (tonnes / 1000).toFixed(1) + " kT";
    return Math.round(tonnes).toLocaleString() + " T";
}

async function initApp() {
    try {
        const [csvData, regionsGeo, deptsGeo] = await Promise.all([
            d3.csv(CONFIG.urls.csv),
            d3.json(CONFIG.urls.regions),
            d3.json(CONFIG.urls.depts)
        ]);

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

        initMenus();
        initMapContainer();
        initChartContainer();
        updateChart();
        initBarChart();
        updateBarChart();
        updateEngine();
    } catch (error) {
        console.error("Erreur critique:", error);
        alert("Impossible de charger les données.");
    }
}

function initMenus() {
    const unique = (key) => [...new Set(STATE.data.map(d => d[key]))].sort();

    const setupSelect = (id, key, isNum = false) => {
        const opts = unique(key);
        if (isNum) opts.sort((a, b) => b - a);

        const sel = d3.select(id);
        sel.selectAll("option").data(opts).enter().append("option").text(d => d);
        if (opts.length > 0) sel.property("value", opts[0]);

        sel.on("change", () => {
            STATE.filters[key] = isNum ? +sel.property("value") : sel.property("value");
            updateEngine();
        });

        STATE.filters[key] = isNum ? +sel.property("value") : sel.property("value");
    };

    setupSelect("#select-culture", "culture");
    setupSelect("#select-annee", "Annee", true);

    const saisons = [...new Set(STATE.data.map(d => d.Saison))].filter(Boolean).sort();
    const selSaison = d3.select("#select-saison");
    selSaison.selectAll("option").data(saisons).enter().append("option").text(d => d);
    if (saisons.length) selSaison.property("value", saisons[0]);

    selSaison.on("change", () => {
        STATE.filters.saison = selSaison.property("value");
        updateEngine();
    });
    STATE.filters.saison = selSaison.property("value");

    d3.select("#btn-back").on("click", resetZoom);

    const selUnit = d3.select("#select-unit");
    selUnit.on("change", () => {
        STATE.view.prodUnit = selUnit.property("value");
        updateEngine();
        updateChart();
    });

    d3.select("#btn-table-filter").on("click", function() {
        STATE.table.allCultures = !STATE.table.allCultures;
        d3.select(this)
            .classed("active", STATE.table.allCultures)
            .text(STATE.table.allCultures ? "Sans Filtres" : "Culture ciblée");
        updateTable();
    });
}

// MAP

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
    g.append("path").attr("id", "map-outline");
    g.append("g").attr("id", "map-areas");
    g.append("g").attr("id", "map-symbols");

    projection = d3.geoConicConformal();
    projection.fitExtent(
        [[30, 30], [w - 360, h - 30]],
        STATE.geo.regions
    );

    path = d3.geoPath().projection(projection);
    tooltip = d3.select("#tooltip");
    circleSymbol = d3.symbol().type(d3.symbolCircle);
}

// ENGINE

function updateEngine() {
    const filtered = STATE.data.filter(d =>
        d.culture === STATE.filters.culture &&
        d.Annee === STATE.filters.Annee &&
        d.Saison === STATE.filters.saison
    );

    const processed = processGeoData(filtered);
    const scales = calculateScales(processed.stats);

    renderMapLayer(processed, scales);
    renderSymbolsLayer(processed, scales);
    renderLegends(processed.stats, scales);

    updateChart();
    updateBarChart();
    updateTable();
}

function processGeoData(filteredData) {
    let geoFeatures, dataMap = new Map(), maxProd = 0, maxRent = 0, minRent = Infinity;

    const deptAnnualStats = d3.rollup(filteredData,
        v => ({
            production: d3.mean(v, d => d.production),
            rentabilite: d3.mean(v, d => d.rend_euro_par_ha)
        }),
        d => d.Dep_Code
    );

    if (STATE.view.regionCode === null) {
        geoFeatures = STATE.geo.regions.features;

        const regionStats = new Map();
        for (const [deptCode, stats] of deptAnnualStats.entries()) {
            const regCode = CONFIG.deptToRegion[deptCode];
            if (!regCode) continue;
            if (!regionStats.has(regCode)) regionStats.set(regCode, { prodSum: 0, rentSum: 0, count: 0 });
            const r = regionStats.get(regCode);
            r.prodSum += stats.production;
            r.rentSum += stats.rentabilite;
            r.count++;
        }

        for (const [regCode, stats] of regionStats.entries()) {
            const rent = stats.count > 0 ? stats.rentSum / stats.count : 0;
            dataMap.set(regCode, { production: stats.prodSum, rentabilite: rent });
            if (stats.prodSum > maxProd) maxProd = stats.prodSum;
            if (rent > maxRent) maxRent = rent;
            if (rent < minRent && rent > 0) minRent = rent;
        }
    } else {
        geoFeatures = STATE.geo.depts.features.filter(f =>
            CONFIG.deptToRegion[f.properties.code] === STATE.view.regionCode
        );

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
        color: d3.scaleSequential(CONFIG.visu.colors.prod)
            .domain([0, stats.maxProd || 1]),
        starColor: d3.scaleLinear()
            .domain([0, stats.maxRent * 0.5, stats.maxRent || 1])
            .range(CONFIG.visu.colors.stars),
        radius: d3.scaleSqrt()
            .domain([stats.minRent, stats.maxRent || 1])
            .range([
                CONFIG.visu.radiusMin / STATE.view.zoomLevel,
                CONFIG.visu.radiusMax / STATE.view.zoomLevel
            ])
    };
}

// CHART

let chartSvg, chartG, xScale, yScale, lineGenerator, xAxis, yAxis;
const chartMargin = { top: 10, right: 30, bottom: 20, left: 70 };

function initChartContainer() {
    const container = document.getElementById('line-chart');
    const w = container.clientWidth;
    const h = container.clientHeight;

    chartSvg = d3.select("#line-chart").append("svg")
        .attr("width", "100%")
        .attr("height", "100%")
        .attr("viewBox", `0 0 ${w} ${h}`);

    chartG = chartSvg.append("g")
        .attr("transform", `translate(${chartMargin.left},${chartMargin.top})`);

    xScale = d3.scaleTime().range([0, w - chartMargin.left - chartMargin.right]);
    yScale = d3.scaleLinear().range([h - chartMargin.top - chartMargin.bottom, 0]);

    chartG.append("g").attr("class", "x-axis")
        .attr("transform", `translate(0, ${h - chartMargin.top - chartMargin.bottom})`);
    chartG.append("g").attr("class", "y-axis");
    chartG.append("path").attr("class", "line-path");

    const focus = chartG.append("g").attr("class", "focus").style("display", "none");
    focus.append("line")
        .attr("class", "focus-line")
        .attr("y1", 0)
        .style("stroke", "#999")
        .style("stroke-width", "1px")
        .style("stroke-dasharray", "3 3");
    focus.append("circle")
        .attr("class", "focus-circle")
        .attr("r", 5)
        .style("fill", "#fff")
        .style("stroke", "#333")
        .style("stroke-width", "2px");

    chartG.append("rect")
        .attr("class", "overlay")
        .style("fill", "none")
        .style("pointer-events", "all");

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
        historyData = STATE.view.regionCode === null
            ? historyData.filter(d => CONFIG.deptToRegion[d.Dep_Code] === STATE.chart.targetCode)
            : historyData.filter(d => d.Dep_Code === STATE.chart.targetCode);
        title = STATE.chart.targetName;
    }

    const isMonthly = STATE.chart.metric === 'surface' || STATE.chart.metric === 'stock';

    const nested = d3.rollups(historyData,
        v => {
            if (isMonthly) return d3.sum(v, d => d.surface || d.stock || 0);
            const parDept = d3.rollup(v,
                leaves => ({
                    prod: d3.mean(leaves, d => d.production),
                    rent: d3.mean(leaves, d => d.rend_euro_par_ha)
                }),
                d => d.Dep_Code
            );
            const vals = Array.from(parDept.values());
            return STATE.chart.metric === 'production'
                ? d3.sum(vals, d => d.prod)
                : d3.mean(vals, d => d.rent);
        },
        d => isMonthly
            ? new Date(d.Annee, (d.Mois || 1) - 1, 1)
            : new Date(d.Annee, 0, 1)
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

    chartG.select(".x-axis").transition()
        .call(d3.axisBottom(xScale)
            .ticks(isMonthly ? d3.timeMonth.every(6) : d3.timeYear.every(1))
            .tickFormat(d3.timeFormat("%Y")));
    chartG.select(".y-axis").transition().call(d3.axisLeft(yScale).ticks(5));

    const line = d3.line()
        .x(d => xScale(d[0]))
        .y(d => yScale(d[1]))
        .curve(d3.curveMonotoneX);

    const lineColor = STATE.chart.metric === 'rentabilite' ? "#e67e22"
        : isMonthly ? "#2980b9"
        : "#27ae60";

    chartG.select(".line-path").datum(nested).attr("d", line).attr("stroke", lineColor);

    const innerWidth = w - chartMargin.left - chartMargin.right;
    const innerHeight = document.getElementById('line-chart').clientHeight - chartMargin.top - chartMargin.bottom;

    chartG.select(".overlay").attr("width", innerWidth).attr("height", innerHeight);
    chartG.select(".focus-line").attr("y2", innerHeight);

    const bisectDate = d3.bisector(d => d[0]).left;

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
            const x0 = xScale.invert(d3.pointer(event)[0]);
            const i = bisectDate(nested, x0, 1);
            const d0 = nested[i - 1];
            const d1 = nested[i];
            let d = !d0 ? d1 : !d1 ? d0 : x0 - d0[0] > d1[0] - x0 ? d1 : d0;

            chartG.select(".focus").attr("transform", `translate(${xScale(d[0])},0)`);
            chartG.select(".focus-circle")
                .attr("cy", yScale(d[1]))
                .style("stroke", lineColor);

            const timeStr = isMonthly
                ? d[0].toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
                : d[0].getFullYear();

            const valStr = STATE.chart.metric === 'rentabilite'
                ? Math.round(d[1]).toLocaleString() + " €/ha"
                : Math.round(d[1]).toLocaleString() + " T";

            tooltip.html(`<div style="text-align:center;">
                            <strong>${timeStr}</strong><br/>
                            <span style="font-size:1.1em; color:#FFD700">${valStr}</span>
                          </div>`)
                .style("left", (event.pageX + 15) + "px")
                .style("top", (event.pageY - 30) + "px");
        });
}

// RENDERERS

function renderMapLayer(data, scales) {
    g.select("#map-outline")
        .datum({ type: "FeatureCollection", features: data.features })
        .attr("class", "map-outline")
        .attr("d", path);

    const paths = g.select("#map-areas").selectAll("path.map-area")
        .data(data.features, d => d.properties.code);

    paths.join(
        enter => enter.append("path")
            .attr("class", "map-area")
            .attr("d", path)
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
    .on("mouseout", () => tooltip.classed("hidden", true));
}

function renderSymbolsLayer(data, scales) {
    const nodes = g.select("#map-symbols").selectAll("g.symbol-node")
        .data(data.features, d => d.properties.code);

    const nodesEnter = nodes.enter().append("g")
        .attr("class", "symbol-node")
        .attr("transform", d => Utils.getCentroidStr(path, d, 1))
        .style("opacity", 0);

    nodesEnter.call(e => e.transition().duration(CONFIG.visu.transitionDuration).style("opacity", 1));

    nodesEnter.append("path")
        .attr("class", "star")
        .style("stroke", "#333");

    nodesEnter.append("text")
        .attr("class", "yield-label")
        .attr("text-anchor", "middle")
        .style("fill", "#111")
        .style("font-family", "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif")
        .style("font-weight", "bold")
        .style("pointer-events", "none")
        .style("paint-order", "stroke")
        .style("stroke", "rgba(255, 255, 255, 0.99)")
        .style("stroke-linecap", "round")
        .style("stroke-linejoin", "round");

    const nodesUpdate = nodesEnter.merge(nodes);

    nodesUpdate.attr("transform", d => Utils.getCentroidStr(path, d, 1));

    nodesUpdate.select("path.star")
        .attr("d", d => getStarPath(d, data.map, scales.radius))
        .style("stroke-width", (0.2 / STATE.view.zoomLevel) + "px")
        .call(u => u.transition().duration(CONFIG.visu.transitionDuration)
            .style("fill", d => getStarColor(d, data.map, scales.starColor)));

    nodesUpdate.select("text.yield-label")
        .text(d => {
            const val = data.map.get(d.properties.code);
            return (val && val.rentabilite > 0) ? Math.round(val.rentabilite) : "";
        })
        .style("font-size", (10 / STATE.view.zoomLevel) + "px")
        .style("stroke-width", (1.5 / STATE.view.zoomLevel) + "px")
        .attr("dy", d => {
            const val = data.map.get(d.properties.code);
            if (!val || val.rentabilite <= 0) return 0;
            const r = scales.radius(val.rentabilite);
            const textWidth = Math.round(val.rentabilite).toString().length * (6 / STATE.view.zoomLevel);
            return (r * 2) > textWidth + (4 / STATE.view.zoomLevel)
                ? "0.35em"
                : (r + (12 / STATE.view.zoomLevel));
        });

    nodes.exit().call(ex => ex.transition().duration(200).style("opacity", 0).remove());
}

function renderLegends(stats, scales) {
    const fmtProd = formatProduction(stats.maxProd, true);
    d3.select("#legend-prod-min").text("0");
    d3.select("#legend-prod-max").text(fmtProd);

    const container = d3.select("#legend-size-container");
    container.html("");

    if (stats.maxRent === 0) return;

    const svgWidth = 150, svgHeight = 70;
    const legSvg = container.append("svg").attr("width", svgWidth).attr("height", svgHeight);
    const values = [stats.maxRent, (stats.minRent + stats.maxRent) / 2, stats.minRent];
    const legScale = d3.scaleSqrt()
        .domain([stats.minRent, stats.maxRent])
        .range([CONFIG.visu.radiusMin, CONFIG.visu.radiusMax]);

    const cx = 40;
    const bottomY = svgHeight - 10;

    legSvg.selectAll("circle.legend-circle")
        .data(values).enter().append("circle")
        .attr("class", "legend-circle")
        .attr("cx", cx)
        .attr("cy", d => bottomY - legScale(d))
        .attr("r", d => legScale(d))
        .style("fill", "transparent")
        .style("stroke", d => scales.starColor(d))
        .style("stroke-width", "1.5px");

    legSvg.selectAll("line.legend-line")
        .data(values).enter().append("line")
        .attr("class", "legend-line")
        .attr("x1", cx)
        .attr("y1", d => bottomY - legScale(d) * 2)
        .attr("x2", cx + CONFIG.visu.radiusMax + 15)
        .attr("y2", d => bottomY - legScale(d) * 2)
        .style("stroke", "#888")
        .style("stroke-dasharray", "2,2")
        .style("stroke-width", "1px");

    legSvg.selectAll("text.legend-text")
        .data(values).enter().append("text")
        .attr("class", "legend-text")
        .attr("x", cx + CONFIG.visu.radiusMax + 20)
        .attr("y", d => bottomY - legScale(d) * 2 + 4)
        .text(d => Math.round(d) + " €")
        .style("font-size", "10px")
        .style("fill", "#555");
}

// RENDER HELPERS

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
    const r = scale(val.rentabilite);
    return circleSymbol.size(Math.PI * r * r)();
}

function showTooltip(event, d, map, scales) {
    const val = map.get(d.properties.code);
    let html = `<strong>${d.properties.nom}</strong>`;
    if (val && (val.production > 0 || val.rentabilite > 0)) {
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

// INTERACTIONS

function handleZoom(feature) {
    if (STATE.view.regionCode !== null) return;

    STATE.view.regionCode = feature.properties.code;

    const container = document.getElementById('map-container');
    const bounds = path.bounds(feature);
    const dx = bounds[1][0] - bounds[0][0];
    const dy = bounds[1][1] - bounds[0][1];
    const x = (bounds[0][0] + bounds[1][0]) / 2;
    const y = (bounds[0][1] + bounds[1][1]) / 2;

    const availableWidth = container.clientWidth - 390;
    const availableHeight = container.clientHeight - 60;
    const scale = 0.9 / Math.max(dx / availableWidth, dy / availableHeight);
    STATE.view.zoomLevel = scale;

    const visualCenterX = 30 + availableWidth / 2;
    const visualCenterY = container.clientHeight / 2;
    const translate = [visualCenterX - scale * x, visualCenterY - scale * y];

    g.transition().duration(CONFIG.visu.transitionDuration)
        .attr("transform", `translate(${translate})scale(${scale})`)
        .on("end", updateEngine);

    d3.select("#breadcrumb").classed("hidden", false);
    d3.select("#region-title").text(feature.properties.nom);
}

function resetZoom() {
    STATE.view.regionCode = null;
    STATE.view.zoomLevel = 1;

    g.transition().duration(CONFIG.visu.transitionDuration)
        .attr("transform", "")
        .on("end", updateEngine);

    d3.select("#breadcrumb").classed("hidden", true);
}

// TABLE

function updateTable() {
    let tData = STATE.data.filter(d =>
        d.Annee === STATE.filters.Annee &&
        d.Saison === STATE.filters.saison
    );
    if (!STATE.table.allCultures) tData = tData.filter(d => d.culture === STATE.filters.culture);

    const deptStats = d3.rollup(tData,
        v => d3.mean(v, d => d.rend_euro_par_ha),
        d => d.Dep_Code,
        d => d.culture
    );

    let flatData = [];
    for (const [deptCode, cultures] of deptStats.entries()) {
        const feature = STATE.geo.depts.features.find(f => f.properties.code === deptCode);
        const deptName = feature ? feature.properties.nom : `Dépt ${deptCode}`;
        for (const [culture, avgRent] of cultures.entries()) {
            if (avgRent > 0) flatData.push({ departement: deptName, culture, rent: avgRent });
        }
    }

    flatData.sort((a, b) => b.rent - a.rent);
    const topData = flatData.slice(0, 15);

    const tbody = d3.select("#yield-table tbody");
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

// BAR CHART

let barSvg, barG, xBarScale, yBarScale;
const barMargin = { top: 15, right: 45, bottom: 20, left: 60 };

function initBarChart() {
    const container = document.getElementById('bar-chart');
    const w = container.clientWidth;
    const h = container.clientHeight;

    barSvg = d3.select("#bar-chart").append("svg")
        .attr("width", "100%").attr("height", "100%")
        .attr("viewBox", `0 0 ${w} ${h}`);

    barG = barSvg.append("g")
        .attr("transform", `translate(${barMargin.left},${barMargin.top})`);

    xBarScale = d3.scaleLinear().range([0, w - barMargin.left - barMargin.right]);
    yBarScale = d3.scaleBand().range([0, h - barMargin.top - barMargin.bottom]).padding(0.2);

    barG.append("g").attr("class", "x-bar-axis")
        .attr("transform", `translate(0, ${h - barMargin.top - barMargin.bottom})`);
    barG.append("g").attr("class", "y-bar-axis");

    barG.append("text")
        .attr("class", "rent-legend-label")
        .attr("x", w - barMargin.left - barMargin.right)
        .attr("y", -5)
        .attr("text-anchor", "end")
        .style("font-size", "10px")
        .style("font-style", "italic")
        .style("fill", "#e67e22")
        .text("Rentabilité (€/ha)");
}

function updateBarChart() {
    let bData = STATE.data.filter(d =>
        d.Annee === STATE.filters.Annee &&
        d.Saison === STATE.filters.saison
    );

    let title = "France";
    if (STATE.chart.targetCode) {
        bData = STATE.view.regionCode === null
            ? bData.filter(d => CONFIG.deptToRegion[d.Dep_Code] === STATE.chart.targetCode)
            : bData.filter(d => d.Dep_Code === STATE.chart.targetCode);
        title = STATE.chart.targetName;
    }

    d3.select("#bar-chart-title").text(`Comparaison : ${title}`);

    const statsCulture = d3.rollups(bData,
        v => {
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
                rentabilite: arr.length > 0 ? d3.mean(arr, d => d.rent) : 0
            };
        },
        d => d.culture
    )
    .map(([culture, stats]) => ({ culture, production: stats.production, rentabilite: stats.rentabilite }))
    .sort((a, b) => b.production - a.production)
    .slice(0, 5);

    const innerWidth = document.getElementById('bar-chart').clientWidth - barMargin.left - barMargin.right;

    xBarScale.domain([0, d3.max(statsCulture, d => d.production) || 1]).range([0, innerWidth]);
    yBarScale.domain(statsCulture.map(d => d.culture));

    const xRentScale = d3.scaleLinear()
        .domain([0, d3.max(statsCulture, d => d.rentabilite) || 1])
        .range([0, innerWidth]);

    barG.select(".x-bar-axis").transition().duration(500).call(
        d3.axisBottom(xBarScale).ticks(3).tickFormat(d =>
            d >= 1000000 ? (d / 1000000).toFixed(1) + "M" :
            d >= 1000 ? (d / 1000).toFixed(1) + "k" : d
        )
    );
    barG.select(".y-bar-axis").transition().duration(500).call(d3.axisLeft(yBarScale));
    barG.select(".y-bar-axis").selectAll("text")
        .style("font-size", "10px")
        .style("cursor", "pointer")
        .style("font-weight", d => d === STATE.filters.culture ? "bold" : "normal")
        .on("click", (event, d) => changeCultureFromBar(d));

    const barColor = d => d.culture === STATE.filters.culture ? "#2cca49" : "#bdc3c7";

    barG.selectAll(".bar").data(statsCulture, d => d.culture).join(
        enter => enter.append("rect")
            .attr("class", "bar")
            .attr("y", d => yBarScale(d.culture))
            .attr("height", yBarScale.bandwidth())
            .attr("x", 0).attr("width", 0)
            .attr("fill", barColor)
            .style("cursor", "pointer")
            .on("click", (event, d) => changeCultureFromBar(d.culture))
            .call(e => e.transition().duration(500).attr("width", d => xBarScale(d.production))),
        update => update
            .on("click", (event, d) => changeCultureFromBar(d.culture))
            .call(u => u.transition().duration(500)
                .attr("y", d => yBarScale(d.culture))
                .attr("height", yBarScale.bandwidth())
                .attr("width", d => xBarScale(d.production))
                .attr("fill", barColor)),
        exit => exit.transition().duration(300).attr("width", 0).remove()
    );

    const midY = d => yBarScale(d.culture) + yBarScale.bandwidth() / 2;

    barG.selectAll(".rent-line").data(statsCulture, d => d.culture).join(
        enter => enter.append("line")
            .attr("class", "rent-line")
            .attr("y1", midY).attr("y2", midY)
            .attr("x1", 0).attr("x2", 0)
            .attr("stroke", "#e67e22").attr("stroke-width", 2)
            .style("pointer-events", "none")
            .call(e => e.transition().duration(500).attr("x2", d => xRentScale(d.rentabilite))),
        update => update.call(u => u.transition().duration(500)
            .attr("y1", midY).attr("y2", midY)
            .attr("x2", d => xRentScale(d.rentabilite))),
        exit => exit.transition().duration(300).attr("x2", 0).remove()
    );

    barG.selectAll(".rent-dot").data(statsCulture, d => d.culture).join(
        enter => enter.append("circle")
            .attr("class", "rent-dot")
            .attr("cy", midY).attr("cx", 0).attr("r", 4.5)
            .attr("fill", "#fff").attr("stroke", "#e67e22").attr("stroke-width", 2)
            .style("pointer-events", "none")
            .call(e => e.transition().duration(500).attr("cx", d => xRentScale(d.rentabilite))),
        update => update.call(u => u.transition().duration(500)
            .attr("cy", midY)
            .attr("cx", d => xRentScale(d.rentabilite))),
        exit => exit.transition().duration(300).attr("cx", 0).remove()
    );

    barG.selectAll(".rent-label-value").data(statsCulture, d => d.culture).join(
        enter => enter.append("text")
            .attr("class", "rent-label-value")
            .attr("y", midY).attr("dy", "0.35em").attr("x", 0)
            .style("fill", "#e67e22").style("font-size", "10px")
            .style("font-weight", "bold").style("pointer-events", "none")
            .text(d => Math.round(d.rentabilite / 10) * 10)
            .call(e => e.transition().duration(500).attr("x", d => xRentScale(d.rentabilite) + 10)),
        update => update
            .text(d => Math.round(d.rentabilite / 10) * 10)
            .call(u => u.transition().duration(500)
                .attr("y", midY)
                .attr("x", d => xRentScale(d.rentabilite) + 10)),
        exit => exit.transition().duration(300).attr("x", 0).remove()
    );
}

function changeCultureFromBar(nouvelleCulture) {
    if (STATE.filters.culture === nouvelleCulture) return;
    STATE.filters.culture = nouvelleCulture;
    d3.select("#select-culture").property("value", nouvelleCulture);
    updateEngine();
}

initApp();