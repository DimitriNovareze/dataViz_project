const fmt = n => Math.round(n).toLocaleString('fr-FR');

const COLORS = { base: '#1A3328', redist: '#3D6B54', eco: '#C9952A', ja: '#8C3D1F' };
const CULTURE_COLORS = ['#1A3328', '#3D6B54', '#C9952A', '#8C3D1F', '#274D3B', '#E8B84B', '#6B6259'];

let currentPacTotal = 0;
let assolRows = [];

function createDonut(containerId, cutout = 0.5) {

    const el = document.getElementById(containerId);
    const parent = el.parentElement;
    el.style.display = 'none'; 
    const size = 150; 
    const r = size / 2, ri = r * cutout;

    const svg = d3.select(parent).append("svg")
        .attr("id", containerId + "-svg")
        .attr("width", "100%").attr("height", "100%")
        .attr("viewBox", `0 0 ${size} ${size}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

    const g = svg.append("g").attr("transform", `translate(${r},${r})`);
    g.append("g").attr("class", "slices");

    return { svg, g, r, ri, arc: d3.arc().innerRadius(ri).outerRadius(r - 2) };
}

function updateDonut(donut, data, labels, colors, tooltip) {
    const pie = d3.pie().sort(null).value(d => d);
    const arcs = pie(data);

    donut.g.select(".slices").selectAll("path")
        .data(arcs, (d, i) => i)
        .join(
            enter => enter.append("path")
                .attr("fill", (d, i) => colors[i])
                .attr("stroke", "#fff").attr("stroke-width", 2)
                .attr("d", donut.arc)
                .style("opacity", 0)
                .call(e => e.transition().duration(400).style("opacity", 1)),
            update => update.call(u => u.transition().duration(400)
                .attr("fill", (d, i) => colors[i])
                .attrTween("d", function(d) {
                    const prev = this._current || d;
                    const interp = d3.interpolate(prev, d);
                    this._current = d;
                    return t => donut.arc(interp(t));
                })),
            exit => exit.transition().duration(200).style("opacity", 0).remove()
        )
        .on("mouseover", function(event, d) {
            const i = arcs.indexOf(d);
            const total = data.reduce((a, b) => a + b, 0);
            const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : 0;
            tooltip.style("display", "block")
                .html(`<strong>${labels[i]}</strong><br>${fmt(d.value)} € (${pct}%)`)
                .style("left", (event.clientX + 12) + "px")
                .style("top", (event.clientY - 20) + "px");
        })
        .on("mousemove", event => tooltip
            .style("left", (event.clientX + 12) + "px")
            .style("top", (event.clientY - 20) + "px"))
        .on("mouseout", () => tooltip.style("display", "none"));
}

// ─── SECTION PAC ─────────────────────────────────────────────────────────────

let tooltipEl = document.getElementById('d3-tooltip');
if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'd3-tooltip';
    tooltipEl.style.cssText = 'position:fixed;pointer-events:none;background:#1A3328;color:#fff;padding:8px 12px;border-radius:4px;font-size:12px;z-index:9999;display:none;';
    document.body.appendChild(tooltipEl);
}
const tooltip = d3.select('#d3-tooltip');
let pacDonut = null;

function update() {
    const surface   = parseInt(document.getElementById('input-surface').value) || 0;
    const isJA      = document.getElementById('input-ja').checked;
    const ecoBase   = parseInt(document.getElementById('input-eco').value) || 0;
    const ecoTotal  = ecoBase + (document.getElementById('input-haies').checked ? 7 : 0);

    const aideBase   = surface * 128;
    const redistHa   = Math.min(surface, 52);
    const aideRedist = redistHa * 48;
    const aideEco    = surface * ecoTotal;
    const aideJA     = isJA ? 3900 : 0;
    const total      = aideBase + aideRedist + aideEco + aideJA;
    const perHa      = surface > 0 ? Math.round(total / surface) : 0;

    currentPacTotal = total;

    const setText = (id, val) => document.getElementById(id).textContent = val;
    setText('val-surface',     surface + ' ha');
    setText('total-amount',    fmt(total));
    setText('amount-per-ha',   fmt(perHa));
    setText('desc-base-ha',    surface);
    setText('desc-redist-ha',  redistHa);
    setText('desc-eco-rate',   ecoTotal);
    setText('desc-eco-ha',     surface);
    setText('desc-ja-status',  isJA ? '3 900 €' : 'inactif');
    setText('amt-base',        fmt(aideBase)   + ' €');
    setText('amt-redist',      fmt(aideRedist) + ' €');
    setText('amt-eco',         fmt(aideEco)    + ' €');
    setText('amt-ja',          fmt(aideJA)     + ' €');

    const maxAide = Math.max(aideBase, aideRedist, aideEco, aideJA, 1);
    [['bar-base', aideBase], ['bar-redist', aideRedist], ['bar-eco', aideEco], ['bar-ja', aideJA]]
        .forEach(([id, val]) => document.getElementById(id).style.width = (val / maxAide * 100) + '%');

    if (!pacDonut) pacDonut = createDonut('resultChart', 0.7);
    updateDonut(
        pacDonut,
        [aideBase, aideRedist, aideEco, aideJA],
        ['Aide de base', 'Redistributif', 'Éco-régime', 'Aide JA'],
        [COLORS.base, COLORS.redist, COLORS.eco, COLORS.ja],
        tooltip
    );

    updateProfit();
}

['input-surface', 'input-eco'].forEach(id =>
    document.getElementById(id).addEventListener('input', update)
);
['input-ja', 'input-haies'].forEach(id =>
    document.getElementById(id).addEventListener('change', update)
);

// ─── SECTION PROFIT ──────────────────────────────────────────────────────────

let profitDonut = null;

function initProfitFilters() {
    const regionSel = document.getElementById('profit-region');
    const anneeSel  = document.getElementById('profit-annee');

    CROP_DB.r.forEach((r, i) => {
        const opt = document.createElement('option');
        opt.value = i; opt.textContent = r;
        regionSel.appendChild(opt);
    });

    [...new Set(CROP_DB.v.map(r => r[2]))].sort((a, b) => b - a).forEach(y => {
        const opt = document.createElement('option');
        opt.value = y; opt.textContent = y;
        anneeSel.appendChild(opt);
    });

    populateDeps();

    regionSel.addEventListener('change', () => { populateDeps(); onFiltersChange(); });
    document.getElementById('profit-dep').addEventListener('change', onFiltersChange);
    anneeSel.addEventListener('change', onFiltersChange);
}

function populateDeps() {
    const depSel    = document.getElementById('profit-dep');
    const regionVal = document.getElementById('profit-region').value;
    depSel.innerHTML = '<option value="">Choisir un département</option>';

    const depIndexes = new Set(
        CROP_DB.v.filter(r => regionVal === '' || r[8] == regionVal).map(r => r[0])
    );

    [...depIndexes]
        .sort((a, b) => CROP_DB.d[a].localeCompare(CROP_DB.d[b]))
        .forEach(i => {
            const opt = document.createElement('option');
            opt.value = i; opt.textContent = CROP_DB.d[i];
            depSel.appendChild(opt);
        });
}

function getAvailableCultures() {
    const depVal = document.getElementById('profit-dep').value;
    const annee  = parseInt(document.getElementById('profit-annee').value);
    if (depVal === '' || isNaN(annee)) return [];

    const results = {};
    CROP_DB.v.forEach(r => {
        if (r[0] == depVal && r[2] === annee) {
            const name = CROP_DB.c[r[1]];
            results[name] = { culture: name, rend: r[5], prix: r[6], rentabilite: r[7] };
        }
    });
    return Object.values(results);
}

function onFiltersChange() {
    const cultures = getAvailableCultures();
    assolRows = cultures.length > 0 ? [{ culture: cultures[0].culture, surface: 10 }] : [];
    renderAssolement();
    updateProfit();
}

function renderAssolement() {
    const cultures = getAvailableCultures();
    const container = d3.select('#assol-container');
    container.html('');

    if (cultures.length === 0) {
        container.append('div').attr('class', 'assol-empty')
            .text('Sélectionnez un département et une année pour voir les cultures disponibles.');
        return;
    }

    assolRows.forEach((row, idx) => {
        const info = cultures.find(c => c.culture === row.culture);
        const color = CULTURE_COLORS[idx % CULTURE_COLORS.length];

        const div = container.append('div').attr('class', 'assol-row');
        div.append('div').attr('class', 'assol-color').style('background', color);

        const sel = div.append('div').attr('class', 'assol-select-wrap')
            .append('select').attr('class', 'pac-select assol-culture-select');
        cultures.forEach(c => sel.append('option').attr('value', c.culture)
            .property('selected', c.culture === row.culture).text(c.culture));
        sel.on('change', function() { assolRows[idx].culture = this.value; renderAssolement(); updateProfit(); });

        const wrap = div.append('div').attr('class', 'assol-surface-wrap');
        wrap.append('input').attr('type', 'number').attr('class', 'assol-surface-input')
            .attr('min', 0).attr('max', 9999).attr('step', 1).property('value', row.surface)
            .on('input', function() { assolRows[idx].surface = parseFloat(this.value) || 0; updateProfit(); });
        wrap.append('span').attr('class', 'assol-surface-unit').text('ha');

        const stats = div.append('div').attr('class', 'assol-stats');
        const addStat = (title, val) => {
            stats.append('span').attr('class', 'assol-stat').attr('title', title).text(val);
            stats.append('span').attr('class', 'assol-stat-sep').text('·');
        };
        addStat('Rendement',   info ? info.rend + ' t/ha' : '—');
        addStat('Prix',        info ? info.prix + ' €/t'  : '—');
        stats.append('span').attr('class', 'assol-stat assol-stat-rent').attr('title', 'Rentabilité')
            .text(info ? fmt(info.rentabilite) + ' €/ha' : '—');

        div.append('button').attr('class', 'assol-remove').attr('title', 'Supprimer').text('×')
            .on('click', () => { assolRows.splice(idx, 1); renderAssolement(); updateProfit(); });
    });
}

document.getElementById('btn-add-culture').addEventListener('click', () => {
    const cultures = getAvailableCultures();
    if (!cultures.length) return;
    const used = new Set(assolRows.map(r => r.culture));
    const next = cultures.find(c => !used.has(c.culture)) || cultures[0];
    assolRows.push({ culture: next.culture, surface: 10 });
    renderAssolement();
    updateProfit();
});

function updateProfit() {
    const cultures = getAvailableCultures();
    const tableSection = document.getElementById('profit-table-section');

    const setEl = (id, val) => document.getElementById(id).textContent = val;

    if (!cultures.length || !assolRows.length) {
        setEl('profit-revenu-culture', '0 €');
        setEl('profit-aide-pac',       fmt(currentPacTotal) + ' €');
        setEl('profit-total',          fmt(currentPacTotal) + ' €');
        setEl('profit-total-perha',    '—');
        tableSection.style.display = 'none';
        if (profitDonut) updateDonut(profitDonut, [0, currentPacTotal], ['Cultures', 'Aides PAC'], ['#ccc', '#E8B84B'], tooltip);
        return;
    }

    let revenuCulture = 0, totalSurface = 0;
    const details = assolRows.reduce((acc, row, idx) => {
        const info = cultures.find(c => c.culture === row.culture);
        if (!info) return acc;
        const revenu = info.rentabilite * row.surface;
        revenuCulture += revenu;
        totalSurface  += row.surface;
        acc.push({ ...info, surface: row.surface, revenu, color: CULTURE_COLORS[idx % CULTURE_COLORS.length] });
        return acc;
    }, []);

    const revenuTotal = revenuCulture + currentPacTotal;
    const perHa = totalSurface > 0 ? Math.round(revenuTotal / totalSurface) : 0;

    setEl('profit-revenu-culture', fmt(revenuCulture) + ' €');
    setEl('profit-aide-pac',       fmt(currentPacTotal) + ' €');
    setEl('profit-total',          fmt(revenuTotal) + ' €');
    setEl('profit-total-perha',    fmt(perHa) + ' € / ha sur ' + fmt(totalSurface) + ' ha');

    tableSection.style.display = '';
    const tbody = d3.select('#profit-table tbody');
    tbody.selectAll('tr').data(details).join(
        enter => {
            const tr = enter.append('tr');
            tr.append('td').html(d => `<span class="profit-table-dot" style="background:${d.color}"></span>${d.culture}`);
            tr.append('td').text(d => fmt(d.surface));
            tr.append('td').text(d => d.rend);
            tr.append('td').text(d => fmt(d.prix));
            tr.append('td').text(d => fmt(d.rentabilite));
            tr.append('td').html(d => `<strong>${fmt(d.revenu)} €</strong>`);
            tr.append('td').html(d => {
                const pct = revenuCulture > 0 ? ((d.revenu / revenuCulture) * 100).toFixed(1) : 0;
                return `<div class="profit-pct-bar-bg"><div class="profit-pct-bar" style="width:${pct}%;background:${d.color}"></div></div><span class="profit-pct-val">${pct}%</span>`;
            });
            return tr;
        },
        update => {
            update.select('td:nth-child(1)').html(d => `<span class="profit-table-dot" style="background:${d.color}"></span>${d.culture}`);
            update.select('td:nth-child(2)').text(d => fmt(d.surface));
            update.select('td:nth-child(3)').text(d => d.rend);
            update.select('td:nth-child(4)').text(d => fmt(d.prix));
            update.select('td:nth-child(5)').text(d => fmt(d.rentabilite));
            update.select('td:nth-child(6)').html(d => `<strong>${fmt(d.revenu)} €</strong>`);
            update.select('td:nth-child(7)').html(d => {
                const pct = revenuCulture > 0 ? ((d.revenu / revenuCulture) * 100).toFixed(1) : 0;
                return `<div class="profit-pct-bar-bg"><div class="profit-pct-bar" style="width:${pct}%;background:${d.color}"></div></div><span class="profit-pct-val">${pct}%</span>`;
            });
            return update;
        },
        exit => exit.remove()
    );

    if (!profitDonut) profitDonut = createDonut('profitChart', 0.65);
    updateDonut(
        profitDonut,
        details.map(d => Math.round(d.revenu)).concat([currentPacTotal]),
        details.map(d => d.culture).concat(['Aides PAC']),
        details.map(d => d.color).concat(['#E8B84B']),
        tooltip
    );
}

update();
initProfitFilters();