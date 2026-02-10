const width = 800;
const height = 600;

const svg = d3.select("#map-container")
    .append("svg")
    .attr("viewBox", [0, 0, width, height]);

const tooltip = d3.select("#tooltip");

// 1. Chargement des données
Promise.all([
    d3.csv("saa_stock_price.csv"), 
    d3.json("https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/departements-version-simplifiee.geojson")
]).then(([data, geojson]) => {

    // Nettoyage et conversion des types
    data.forEach(d => {
        d.Annee = +d.Annee;
        d.rend_euro_par_ha = +d.rend_euro_par_ha;
        d.Dep_Code = String(d.Dep_Code).padStart(2, '0');
    });

    // Extraction des options uniques pour les menus
    const cultures = [...new Set(data.map(d => d.culture))].sort();
    const annees = [...new Set(data.map(d => d.Annee))].sort((a,b) => b-a);
    const saisons = [...new Set(data.map(d => d.saison))].sort();

    // Remplissage des sélecteurs
    const selCulture = d3.select("#select-culture");
    const selAnnee = d3.select("#select-annee");
    
    // Ajout d'un sélecteur de saison dans ton HTML si tu veux, 
    // ou on prend la première par défaut. Ici on va filtrer dynamiquement.
    selCulture.selectAll("option").data(cultures).enter().append("option").text(d => d);
    selAnnee.selectAll("option").data(annees).enter().append("option").text(d => d);

    const projection = d3.geoConicConformal()
        .center([2.454071, 46.279229])
        .scale(2800)
        .translate([width / 2, height / 2]);

    const path = d3.geoPath().projection(projection);

    function update() {
        const c = selCulture.property("value");
        const a = +selAnnee.property("value");

        // On filtre par culture et année. 
        // Note : si tu as plusieurs saisons, on prend la moyenne ou la première disponible
        const filtered = data.filter(d => d.culture === c && d.Annee === a);
        
        // Création de la map [Code Dept -> Valeur]
        const valMap = new Map(filtered.map(d => [d.Dep_Code, d.rend_euro_par_ha]));
        const maxVal = d3.max(filtered, d => d.rend_euro_par_ha) || 1;

        const colorScale = d3.scaleSequential(d3.interpolateYlGn).domain([0, maxVal]);

        svg.selectAll("path")
            .data(geojson.features)
            .join("path")
                .attr("d", path)
                .attr("stroke", "#fff")
                .attr("stroke-width", 0.5)
                .transition().duration(400)
                .attr("fill", d => {
                    const code = String(d.properties.code).padStart(2, '0');
                    const v = valMap.get(code);
                    return v ? colorScale(v) : "#f0f0f0";
                });

        svg.selectAll("path")
            .on("mouseover", (event, d) => {
                const code = String(d.properties.code).padStart(2, '0');
                const v = valMap.get(code);
                tooltip.style("visibility", "visible")
                    .html(`
                        <strong>${d.properties.nom} (${code})</strong><br>
                        Rentabilité : ${v ? Math.round(v).toLocaleString('fr-FR') + " €/ha" : "N/A"}
                    `);
            })
            .on("mousemove", (event) => {
                tooltip.style("left", (event.pageX + 15) + "px")
                       .style("top", (event.pageY - 20) + "px");
            })
            .on("mouseout", () => tooltip.style("visibility", "hidden"));
    }

    selCulture.on("change", update);
    selAnnee.on("change", update);

    update();
});