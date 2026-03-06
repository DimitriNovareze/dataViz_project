/* ==================================================================
   LOGIQUE DU CALCULATEUR PAC
   ================================================================== */
const fmt = n => n.toLocaleString('fr-FR');

const ctx = document.getElementById('resultChart').getContext('2d');
let chart = null;

/* Couleurs PREVICULTUR */
const COLORS = {
    base:   '#1A3328',  /* --forest */
    redist: '#3D6B54',  /* --forest-light */
    eco:    '#C9952A',  /* --wheat */
    ja:     '#8C3D1F'   /* --rust */
};

/* --- Variable globale PAC pour la section profit --- */
let currentPacTotal = 0;

/* --- Variables de la section profit (déclarées ici pour éviter le TDZ) --- */
const CULTURE_COLORS = [
    '#1A3328', '#3D6B54', '#C9952A', '#8C3D1F',
    '#274D3B', '#E8B84B', '#6B6259'
];
let assolRows = [];
let profitChart = null;

function update() {
    /* --- Lecture des paramètres --- */
    const surface   = parseInt(document.getElementById('input-surface').value);
    const isJA      = document.getElementById('input-ja').checked;
    const ecoBase   = parseInt(document.getElementById('input-eco').value);
    const bonusHaies = document.getElementById('input-haies').checked ? 7 : 0;
    const ecoTotal  = ecoBase + bonusHaies;

    /* --- Calculs --- */
    const aideBase   = surface * 128;
    const redistHa   = Math.min(surface, 52);
    const aideRedist = redistHa * 48;
    const aideEco    = surface * ecoTotal;
    const aideJA     = isJA ? 3900 : 0;
    const total      = aideBase + aideRedist + aideEco + aideJA;
    const perHa      = surface > 0 ? (total / surface).toFixed(0) : 0;

    currentPacTotal = total;

    /* --- Affichage global --- */
    document.getElementById('val-surface').textContent     = surface + ' ha';
    document.getElementById('total-amount').textContent    = fmt(total);
    document.getElementById('amount-per-ha').textContent   = fmt(Number(perHa));

    /* --- Détails par ligne --- */
    document.getElementById('desc-base-ha').textContent    = surface;
    document.getElementById('desc-redist-ha').textContent  = redistHa;
    document.getElementById('desc-eco-rate').textContent   = ecoTotal;
    document.getElementById('desc-eco-ha').textContent     = surface;
    document.getElementById('desc-ja-status').textContent  = isJA ? '3 900 €' : 'inactif';

    document.getElementById('amt-base').textContent   = fmt(aideBase)   + ' €';
    document.getElementById('amt-redist').textContent = fmt(aideRedist) + ' €';
    document.getElementById('amt-eco').textContent    = fmt(aideEco)    + ' €';
    document.getElementById('amt-ja').textContent     = fmt(aideJA)     + ' €';

    /* --- Mini barres proportionnelles --- */
    const maxAide = Math.max(aideBase, aideRedist, aideEco, aideJA, 1);
    document.getElementById('bar-base').style.width   = (aideBase   / maxAide * 100) + '%';
    document.getElementById('bar-redist').style.width  = (aideRedist / maxAide * 100) + '%';
    document.getElementById('bar-eco').style.width     = (aideEco    / maxAide * 100) + '%';
    document.getElementById('bar-ja').style.width      = (aideJA     / maxAide * 100) + '%';

    /* --- Chart donut --- */
    const data = [aideBase, aideRedist, aideEco, aideJA];
    const labels = ['Aide de base', 'Redistributif', 'Éco-régime', 'Aide JA'];

    if (chart) {
        chart.data.datasets[0].data = data;
        chart.update();
    } else {
        chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: [COLORS.base, COLORS.redist, COLORS.eco, COLORS.ja],
                    borderWidth: 2,
                    borderColor: '#FFFFFF'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: '68%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            font: { family: "'DM Sans', sans-serif", size: 11 },
                            color: '#6B6259',
                            padding: 14,
                            usePointStyle: true,
                            pointStyleWidth: 8
                        }
                    },
                    tooltip: {
                        backgroundColor: '#1A3328',
                        titleFont: { family: "'DM Sans', sans-serif", size: 12 },
                        bodyFont: { family: "'DM Sans', sans-serif", size: 12 },
                        cornerRadius: 4,
                        padding: 10,
                        callbacks: {
                            label: function(ctx) {
                                const val = ctx.parsed;
                                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                                return ' ' + fmt(val) + ' € (' + pct + '%)';
                            }
                        }
                    }
                }
            }
        });
    }

    /* Mettre à jour aussi le profit si configuré */
    updateProfit();
}

/* --- Listeners PAC --- */
document.getElementById('input-surface').addEventListener('input', update);
document.getElementById('input-ja').addEventListener('change', update);
document.getElementById('input-eco').addEventListener('change', update);
document.getElementById('input-haies').addEventListener('change', update);

/* --- Init PAC --- */
update();


/* ==================================================================
   SECTION 2 : ESTIMATEUR DE PROFIT CULTURAL
   ================================================================== */

/* --- Accès aux données CROP_DB --- */
// CROP_DB = { d: [deps], c: [cultures], r: [regions], v: [[dep_i, cult_i, annee, surf, prod, rend, prix, rentabilite, reg_i], ...] }

/* --- Populate selects --- */
function initProfitFilters() {
    const regionSel = document.getElementById('profit-region');
    const depSel = document.getElementById('profit-dep');
    const anneeSel = document.getElementById('profit-annee');

    // Régions
    CROP_DB.r.forEach((r, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = r;
        regionSel.appendChild(opt);
    });

    // Années (desc)
    const years = [...new Set(CROP_DB.v.map(r => r[2]))].sort((a,b) => b - a);
    years.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        anneeSel.appendChild(opt);
    });

    // Départements (all initially)
    populateDeps();

    regionSel.addEventListener('change', () => {
        populateDeps();
        onFiltersChange();
    });
    depSel.addEventListener('change', onFiltersChange);
    anneeSel.addEventListener('change', onFiltersChange);
}

function populateDeps() {
    const depSel = document.getElementById('profit-dep');
    const regionVal = document.getElementById('profit-region').value;
    depSel.innerHTML = '<option value="">Choisir un département</option>';

    let depIndexes = new Set();
    CROP_DB.v.forEach(r => {
        if (regionVal === '' || r[8] == regionVal) {
            depIndexes.add(r[0]);
        }
    });

    [...depIndexes].sort((a,b) => CROP_DB.d[a].localeCompare(CROP_DB.d[b])).forEach(i => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = CROP_DB.d[i];
        depSel.appendChild(opt);
    });
}

/* --- Trouver les cultures disponibles pour un dept/année --- */
function getAvailableCultures() {
    const depVal = document.getElementById('profit-dep').value;
    const annee = parseInt(document.getElementById('profit-annee').value);
    if (depVal === '' || isNaN(annee)) return [];

    const results = {};
    CROP_DB.v.forEach(r => {
        if (r[0] == depVal && r[2] === annee) {
            const cultName = CROP_DB.c[r[1]];
            results[cultName] = {
                culture: cultName,
                rend: r[5],
                prix: r[6],
                rentabilite: r[7]
            };
        }
    });
    return Object.values(results);
}

/* --- Quand les filtres changent, reconstruire l'assolement --- */
function onFiltersChange() {
    const cultures = getAvailableCultures();
    assolRows = [];
    if (cultures.length > 0) {
        // Ajouter la première culture par défaut
        assolRows.push({ culture: cultures[0].culture, surface: 10 });
    }
    renderAssolement();
    updateProfit();
}

/* --- Rendu de l'assolement --- */
function renderAssolement() {
    const container = document.getElementById('assol-container');
    const cultures = getAvailableCultures();
    container.innerHTML = '';

    if (cultures.length === 0) {
        container.innerHTML = '<div class="assol-empty">Sélectionnez un département et une année pour voir les cultures disponibles.</div>';
        return;
    }

    assolRows.forEach((row, idx) => {
        const info = cultures.find(c => c.culture === row.culture);
        const rentStr = info ? fmt(Math.round(info.rentabilite)) + ' €/ha' : '—';
        const rendStr = info ? info.rend + ' t/ha' : '—';
        const prixStr = info ? info.prix + ' €/t' : '—';
        const colorIdx = idx % CULTURE_COLORS.length;

        const div = document.createElement('div');
        div.className = 'assol-row';
        div.innerHTML = `
            <div class="assol-color" style="background:${CULTURE_COLORS[colorIdx]}"></div>
            <div class="assol-select-wrap">
                <select class="pac-select assol-culture-select" data-idx="${idx}">
                    ${cultures.map(c => `<option value="${c.culture}" ${c.culture === row.culture ? 'selected' : ''}>${c.culture}</option>`).join('')}
                </select>
            </div>
            <div class="assol-surface-wrap">
                <input type="number" class="assol-surface-input" data-idx="${idx}" value="${row.surface}" min="0" max="9999" step="1">
                <span class="assol-surface-unit">ha</span>
            </div>
            <div class="assol-stats">
                <span class="assol-stat" title="Rendement">${rendStr}</span>
                <span class="assol-stat-sep">·</span>
                <span class="assol-stat" title="Prix">${prixStr}</span>
                <span class="assol-stat-sep">·</span>
                <span class="assol-stat assol-stat-rent" title="Rentabilité">${rentStr}</span>
            </div>
            <button class="assol-remove" data-idx="${idx}" title="Supprimer">×</button>
        `;
        container.appendChild(div);
    });

    // Event listeners
    container.querySelectorAll('.assol-culture-select').forEach(sel => {
        sel.addEventListener('change', e => {
            assolRows[+e.target.dataset.idx].culture = e.target.value;
            renderAssolement();
            updateProfit();
        });
    });
    container.querySelectorAll('.assol-surface-input').forEach(inp => {
        inp.addEventListener('input', e => {
            assolRows[+e.target.dataset.idx].surface = parseFloat(e.target.value) || 0;
            updateProfit();
        });
    });
    container.querySelectorAll('.assol-remove').forEach(btn => {
        btn.addEventListener('click', e => {
            assolRows.splice(+e.target.dataset.idx, 1);
            renderAssolement();
            updateProfit();
        });
    });
}

/* --- Ajouter une culture --- */
document.getElementById('btn-add-culture').addEventListener('click', () => {
    const cultures = getAvailableCultures();
    if (cultures.length === 0) return;

    // Trouver une culture non déjà utilisée
    const used = new Set(assolRows.map(r => r.culture));
    const next = cultures.find(c => !used.has(c.culture)) || cultures[0];
    assolRows.push({ culture: next.culture, surface: 10 });
    renderAssolement();
    updateProfit();
});

/* --- Calcul du profit total --- */
function updateProfit() {
    const cultures = getAvailableCultures();
    const tableSection = document.getElementById('profit-table-section');
    const tbody = document.querySelector('#profit-table tbody');

    if (cultures.length === 0 || assolRows.length === 0) {
        document.getElementById('profit-revenu-culture').textContent = '0 €';
        document.getElementById('profit-aide-pac').textContent = fmt(currentPacTotal) + ' €';
        document.getElementById('profit-total').textContent = fmt(currentPacTotal) + ' €';
        document.getElementById('profit-total-perha').textContent = '—';
        tableSection.style.display = 'none';
        if (profitChart) { profitChart.data.datasets[0].data = [0, currentPacTotal]; profitChart.update(); }
        return;
    }

    let revenuCulture = 0;
    let totalSurface = 0;
    const details = [];

    assolRows.forEach((row, idx) => {
        const info = cultures.find(c => c.culture === row.culture);
        if (!info) return;
        const revenu = info.rentabilite * row.surface;
        revenuCulture += revenu;
        totalSurface += row.surface;
        details.push({
            culture: row.culture,
            surface: row.surface,
            rend: info.rend,
            prix: info.prix,
            rentabilite: info.rentabilite,
            revenu: revenu,
            color: CULTURE_COLORS[idx % CULTURE_COLORS.length]
        });
    });

    const revenuTotal = revenuCulture + currentPacTotal;
    const perHa = totalSurface > 0 ? Math.round(revenuTotal / totalSurface) : 0;

    document.getElementById('profit-revenu-culture').textContent = fmt(Math.round(revenuCulture)) + ' €';
    document.getElementById('profit-aide-pac').textContent = fmt(currentPacTotal) + ' €';
    document.getElementById('profit-total').textContent = fmt(Math.round(revenuTotal)) + ' €';
    document.getElementById('profit-total-perha').textContent = fmt(perHa) + ' € / ha sur ' + fmt(totalSurface) + ' ha';

    // Table
    tableSection.style.display = '';
    tbody.innerHTML = '';
    details.forEach(d => {
        const pct = revenuCulture > 0 ? ((d.revenu / revenuCulture) * 100).toFixed(1) : 0;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="profit-table-dot" style="background:${d.color}"></span>${d.culture}</td>
            <td>${fmt(d.surface)}</td>
            <td>${d.rend}</td>
            <td>${fmt(d.prix)}</td>
            <td>${fmt(Math.round(d.rentabilite))}</td>
            <td><strong>${fmt(Math.round(d.revenu))} €</strong></td>
            <td>
                <div class="profit-pct-bar-bg"><div class="profit-pct-bar" style="width:${pct}%;background:${d.color}"></div></div>
                <span class="profit-pct-val">${pct}%</span>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Profit donut chart
    const ctxP = document.getElementById('profitChart').getContext('2d');
    const chartLabels = details.map(d => d.culture).concat(['Aides PAC']);
    const chartData = details.map(d => Math.round(d.revenu)).concat([currentPacTotal]);
    const chartColors = details.map(d => d.color).concat(['#E8B84B']);

    if (profitChart) {
        profitChart.data.labels = chartLabels;
        profitChart.data.datasets[0].data = chartData;
        profitChart.data.datasets[0].backgroundColor = chartColors;
        profitChart.update();
    } else {
        profitChart = new Chart(ctxP, {
            type: 'doughnut',
            data: {
                labels: chartLabels,
                datasets: [{
                    data: chartData,
                    backgroundColor: chartColors,
                    borderWidth: 2,
                    borderColor: '#FFFFFF'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: '65%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1A3328',
                        titleFont: { family: "'DM Sans', sans-serif", size: 12 },
                        bodyFont: { family: "'DM Sans', sans-serif", size: 12 },
                        cornerRadius: 4,
                        padding: 10,
                        callbacks: {
                            label: function(ctx) {
                                const val = ctx.parsed;
                                const tot = ctx.dataset.data.reduce((a,b)=>a+b,0);
                                const pct = tot > 0 ? ((val / tot) * 100).toFixed(1) : 0;
                                return ' ' + fmt(val) + ' € (' + pct + '%)';
                            }
                        }
                    }
                }
            }
        });
    }
}

/* --- Init profit section --- */
initProfitFilters();