// Token Radar v2 dashboard: renders window.RADAR (written by main.ts as
// data.js). No network, no fetch: every number on the page comes from the
// snapshot through lib/model.ts, and the detail view shows each row's exact
// multipliers so a reader can check the arithmetic line by line.
(function () {
  'use strict';
  var R = window.RADAR;
  if (!R) { document.body.textContent = 'No radar data loaded.'; return; }
  var rows = R.rows.slice();
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });

  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + n;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function growthCell(r) {
    if (r.change_7d === null || r.change_7d === undefined) return '<span class="flat">n/a</span>';
    var cls = r.change_7d > 0 ? 'up' : r.change_7d < 0 ? 'down' : 'flat';
    var sign = r.change_7d > 0 ? '+' : '';
    return '<span class="' + cls + '">' + sign + r.change_7d.toFixed(1) + '%</span>';
  }
  function ageCell(r) {
    if (r.age_days === null || r.age_days === undefined) return '<span class="flat">n/a</span>';
    if (r.age_days >= 365) return Math.floor(r.age_days / 365) + 'y ' + (r.age_days % 365) + 'd';
    return r.age_days + 'd';
  }

  // Header stats.
  var top = rows[0];
  var med = rows[Math.floor(rows.length / 2)];
  document.getElementById('topstats').innerHTML =
    '<div class="stat"><b>' + R.board_size + '</b><span>pre-token rows</span></div>' +
    '<div class="stat"><b>' + R.watchlist_size + '</b><span>watchlist</span></div>' +
    '<div class="stat"><b>' + money(top.implied_value_usd) + '</b><span>top implied</span></div>' +
    '<div class="stat"><b>' + money(med.implied_value_usd) + '</b><span>median implied</span></div>';
  document.getElementById('asof').textContent = R.as_of;
  document.getElementById('src').textContent = 'Source: ' + R.source + ' · Floor: $' + R.floor_usd.toLocaleString('en-US') + ' · Snapshot date ' + R.as_of + '.';

  // Filter options.
  var cats = {}, chains = {};
  rows.forEach(function (r) {
    if (r.category) cats[r.category] = 1;
    r.chains.forEach(function (c) { chains[c] = 1; });
  });
  var catSel = document.getElementById('cat');
  Object.keys(cats).sort().forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; catSel.appendChild(o);
  });
  var chainSel = document.getElementById('chain');
  Object.keys(chains).sort().forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; chainSel.appendChild(o);
  });

  var state = { q: '', cat: '', chain: '', scope: 'all', sort: 'implied' };

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var list = rows.filter(function (r) {
      if (state.scope === 'watchlist' && !r.watchlist) return false;
      if (state.scope === 'early' && r.tvl_usd >= R.floor_usd) return false;
      if (state.scope === 'high' && r.confidence !== 'high') return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sort;
    list.sort(function (a, b) {
      if (key === 'tvl') return b.tvl_usd - a.tvl_usd;
      if (key === 'growth') return (b.change_7d === null ? -1e9 : b.change_7d) - (a.change_7d === null ? -1e9 : a.change_7d);
      if (key === 'age') return (b.age_days === null ? -1 : b.age_days) - (a.age_days === null ? -1 : a.age_days);
      if (key === 'pertvl') return b.implied_per_tvl - a.implied_per_tvl;
      return b.implied_value_usd - a.implied_value_usd;
    });
    return list;
  }

  function render() {
    var list = filtered();
    document.getElementById('count').textContent =
      list.length + ' of ' + rows.length + ' pre-token protocols shown · sorted by ' + state.sort + ' · implied values are this entry\u2019s own claim';
    var html = list.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '"><td>' + r.rank + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span>' + (r.watchlist ? '<span class="pill">WATCHLIST</span>' : '') +
        '<span class="slug">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td><td>' + esc(r.chains.slice(0, 2).join(', ')) + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + growthCell(r) + '</td>' +
        '<td class="num">' + ageCell(r) + '</td>' +
        '<td class="num"><b>' + money(r.implied_value_usd) + '</b></td>' +
        '<td class="num">' + r.implied_per_tvl.toFixed(3) + '</td>' +
        '<td><span class="conf ' + r.confidence + '">' + r.confidence + '</span></td></tr>';
    }).join('');
    document.getElementById('rows').innerHTML = html || '<tr><td colspan="10">No protocols match this filter.</td></tr>';
  }

  function showDetail(slug) {
    var r = bySlug[slug];
    var box = document.getElementById('detail');
    if (!r) { box.hidden = true; box.innerHTML = ''; return; }
    var growthTxt = r.change_7d === null ? 'not reported (counts as 0)' : r.change_7d.toFixed(2) + '%';
    var ageTxt = r.age_days === null ? 'not recorded (multiplier 0.85)' : r.age_days + ' days since ' + esc(r.listed_at || '');
    var steps = r.farm_steps.map(function (s, i) {
      return '<li><b>Step ' + (i + 1) + '.</b> ' + esc(s) + '</li>';
    }).join('');
    box.innerHTML =
      '<h2>#' + r.rank + ' · ' + esc(r.name) + '</h2>' +
      '<p class="meta">' + esc(r.slug) + ' · ' + esc(r.category || 'no category') + ' · ' + esc(r.chains.join(', ')) +
      ' · TVL ' + money(r.tvl_usd) + ' · 7d ' + growthTxt + ' · age ' + ageTxt +
      (r.watchlist ? ' · <span class="pill">ON THE WATCHLIST</span>' : ' · below the $50M watchlist floor') +
      ' · records no token</p>' +
      '<table class="breakdown"><thead><tr><th>Component</th><th class="num">Value</th><th>What it means</th></tr></thead><tbody>' +
      '<tr><td>TVL</td><td class="num">' + money(r.tvl_usd) + '</td><td>Snapshot TVL, whole dollars.</td></tr>' +
      '<tr><td>Category band ' + esc(r.category_band) + '</td><td class="num">× ' + r.category_multiple.toFixed(2) + '</td><td>' + esc(r.category || 'no category') + ' falls in the ' + esc(r.category_band) + ' band (see Methodology).</td></tr>' +
      '<tr><td>Chain spread (' + r.chains.length + ' chains)</td><td class="num">× ' + r.chain_multiplier.toFixed(2) + '</td><td>1 + 0.02 per extra chain, capped at 10.</td></tr>' +
      '<tr><td>7-day growth</td><td class="num">× ' + r.growth_multiplier.toFixed(4) + '</td><td>Clamped change ' + growthTxt + ', weight 0.7.</td></tr>' +
      '<tr><td>Maturity</td><td class="num">× ' + r.maturity_multiplier.toFixed(4) + '</td><td>0.70 + 0.30 × min(age, 1095) / 1095; young records are discounted.</td></tr>' +
      '<tr><td><b>Implied value</b></td><td class="num"><b>' + money(r.implied_value_usd) + '</b></td><td><b>' + r.implied_per_tvl.toFixed(3) + ' per $1 of TVL.</b></td></tr>' +
      '</tbody></table>' +
      '<p class="formula-line">' + money(r.tvl_usd) + ' × ' + r.category_multiple.toFixed(2) + ' × ' + r.chain_multiplier.toFixed(2) +
      ' × ' + r.growth_multiplier.toFixed(4) + ' × ' + r.maturity_multiplier.toFixed(4) + ' = ' + money(r.implied_value_usd) + '</p>' +
      '<h3>Farm plan — 7 steps, with cost and time</h3><ol class="steps">' + steps + '</ol>';
    box.hidden = false;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Live-token comparison table.
  document.getElementById('liverows').innerHTML = R.live.map(function (p, i) {
    return '<tr><td>' + (i + 1) + '</td><td><span class="name">' + esc(p.name) + '</span><span class="slug">' + esc(p.slug) + '</span></td>' +
      '<td>' + esc(p.category || '—') + '</td><td class="num">' + money(p.tvl_usd) + '</td>' +
      '<td class="num"><b>' + (p.mcap_usd === null ? '—' : money(p.mcap_usd)) + '</b></td>' +
      '<td class="num">' + (p.change_7d === null ? 'n/a' : (p.change_7d > 0 ? '+' : '') + p.change_7d.toFixed(1) + '%') + '</td></tr>';
  }).join('');

  // Tabs.
  var tabs = document.querySelectorAll('.tab');
  function setView(v) {
    tabs.forEach(function (t) { t.classList.toggle('active', t.getAttribute('data-view') === v); });
    document.getElementById('view-board').hidden = v !== 'board';
    document.getElementById('view-live').hidden = v !== 'live';
    document.getElementById('view-method').hidden = v !== 'method';
  }
  tabs.forEach(function (t) {
    t.addEventListener('click', function () { setView(t.getAttribute('data-view')); });
  });

  // Controls.
  document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; render(); });
  catSel.addEventListener('change', function (e) { state.cat = e.target.value; render(); });
  chainSel.addEventListener('change', function (e) { state.chain = e.target.value; render(); });
  document.getElementById('scope').addEventListener('change', function (e) { state.scope = e.target.value; render(); });
  document.getElementById('sort').addEventListener('change', function (e) { state.sort = e.target.value; render(); });
  document.getElementById('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (tr) showDetail(tr.getAttribute('data-slug'));
  });

  // Deep links for screenshots and sharing: #detail=<slug>, #view=live|method,
  // #scope=watchlist, #cat=<category>, #sort=tvl|growth|age|pertvl.
  function applyHash() {
    var h = window.location.hash.replace(/^#/, '');
    if (!h) return;
    var params = {};
    h.split('&').forEach(function (part) {
      var kv = part.split('=');
      if (kv[0]) params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });
    if (params.view) setView(params.view);
    if (params.scope) { state.scope = params.scope; document.getElementById('scope').value = params.scope; }
    if (params.cat) { state.cat = params.cat; catSel.value = params.cat; }
    if (params.sort) { state.sort = params.sort; document.getElementById('sort').value = params.sort; }
    if (params.q) { state.q = params.q; document.getElementById('q').value = params.q; }
    render();
    if (params.detail) showDetail(params.detail);
  }

  render();
  applyHash();
})();
