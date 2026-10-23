/* Page start-up and the live lab. */
(function () {
  'use strict';
  const Ch = Charts, E = Engine, $ = id => document.getElementById(id);
  const App = { meta: null, tables: null, patterns: null, ds: null, samples: {}, lab: null };
  window.App = App;

  async function load() {
    const j = u => fetch(u).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); });
    const b = u => fetch(u).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.arrayBuffer(); });
    const [meta, tables, patterns] = await Promise.all([j('data/meta.json'), j('data/tables.json'), j('data/patterns.json')]);
    App.meta = meta; App.tables = tables; App.patterns = patterns;
    E.init(meta, patterns, tables);
    for (const s of meta.samples) App.samples[s.id] = new Uint16Array(await b('data/' + s.file));
    const dsb = new Uint8Array(await b('data/recon_ds.bin'));
    const sh = meta.ds_shape, n = sh[0] * sh[1] * sh[2];
    App.ds = {}; meta.ds_names.forEach((nm, i) => { App.ds[nm] = dsb.subarray(i * n, (i + 1) * n); });
  }

  function banner() {
    const m = App.meta;
    $('foot-meta').textContent = 'Data built ' + m.created + ' · preset ' + m.preset + ' · image ' + m.NX + '×' + m.NY + ' pixels, ' + m.L + ' wavenumber bins (' + m.wn[0] + '–' + m.wn[m.wn.length - 1] + ' cm⁻¹).' + (m.demo ? ' Stand-in data.' : '');
  }

  // slowly rotating cube in the hero: decoration only, no interaction
  function startHero() {
    const d = $('hero3d'); if (!d || !App.ds) return;
    const [nx, ny, nl] = App.meta.ds_shape, src = App.ds.true, x = [], y = [], z = [], v = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nl; k++) { x.push(i); y.push(j); z.push(k * 0.5); v.push(src[(i * ny + j) * nl + k] / 255); }
    const hid = { visible: false, showbackground: false, showgrid: false, zeroline: false, showticklabels: false, title: { text: '' } };
    Plotly.newPlot(d, [{ type: 'isosurface', x, y, z, value: v, isomin: 0.12, isomax: 1, surface: { count: 3, fill: 0.85 }, caps: { x: { show: false }, y: { show: false }, z: { show: false } }, colorscale: [[0, '#5d97e4'], [0.5, '#2a78d6'], [1, '#0f2f5c']], cmin: 0, cmax: 1, showscale: false, opacity: 0.8, hoverinfo: 'skip', lighting: { ambient: 0.8, diffuse: 0.6 } }],
      { paper_bgcolor: 'rgba(0,0,0,0)', margin: { l: 0, r: 0, t: 0, b: 0 }, scene: { xaxis: hid, yaxis: hid, zaxis: hid, bgcolor: 'rgba(0,0,0,0)', aspectmode: 'manual', aspectratio: { x: 1, y: 1, z: 0.8 }, camera: { eye: { x: 1.7, y: 0, z: 0.8 } } } },
      { displayModeBar: false, responsive: true, scrollZoom: false, doubleClick: false });
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let a = 0, last = 0, vis = true;
    if ('IntersectionObserver' in window) new IntersectionObserver(es => { vis = es[0].isIntersecting; }, { threshold: 0.05 }).observe(d);
    (function tick(t) {
      requestAnimationFrame(tick);
      if (!vis || t - last < 40) return; last = t; a += 0.012;
      Plotly.relayout(d, { 'scene.camera.eye': { x: 1.8 * Math.cos(a), y: 1.8 * Math.sin(a), z: 0.8 + 0.15 * Math.sin(a * 0.7) } });
    })(0);
  }

  // ------------------------------------------------------------------ live lab
  const RECIPES = [
    ['smooth', 'Smooth prior', 'Assumes neighbouring pixels look alike, so noise wiggles are damped.'],
    ['ridge', 'Ridge (damped)', 'Keeps the answer small. A blunt but safe noise filter.'],
    ['proj_known', 'Project on known spectra', 'Smooth prior, after forcing each spectrum to be a mix of the known molecule spectra (an optimistic assumption).'],
    ['ls', 'Exact undo (least squares)', 'The pure mathematical undo with no noise protection. Watch it blow up in the dark.']
  ];
  const PRESETS = [
    ['Slow scan, lots of light', { fam: 'raster_skip', K: 64, dlog: 3, method: 'ridge', jitter: 0 }],
    ['Few patterns, dim light', { fam: 'hadamard_var', K: 16, dlog: 1.5, method: 'smooth', jitter: 0 }],
    ['Designed sliding mask', { fam: 'slide_opt', K: 16, dlog: 2, method: 'smooth', jitter: 0 }],
    ['Shaky sample, solver unaware', { fam: 'hadamard_var', K: 32, dlog: 2.5, method: 'smooth', jitter: 1, informed: false }],
    ['Shaky sample, solver aware', { fam: 'hadamard_var', K: 32, dlog: 2.5, method: 'smooth', jitter: 1, informed: true }]
  ];

  function buildLab() {
    const m = App.meta, host = $('controls'); host.innerHTML = '';
    const S = { fam: m.show_family, K: m.K_focus, dlog: 2, readMult: 1, method: 'smooth', kappaMult: 1, jitter: 0, informed: false, seed: 7, sample: m.samples[0].id, l: m.bands[0].idx, shot: 1, px: [m.spec_pixels[0].xy[0], m.spec_pixels[0].xy[1]] };
    App.lab = { S, res: null };
    const Ks = m.Ks; const READ = [0, 0.5, 1, 2, 5, 10];
    const add = h => { const d = Ch.el('div', 'ctl'); d.innerHTML = h; host.appendChild(d); return d; };

    // presets
    const pr = Ch.el('div', 'ctl'); pr.innerHTML = '<label>Try a situation</label><div class="presetrow" style="display:flex;flex-wrap:wrap;gap:6px"></div>';
    PRESETS.forEach(p => { const b = Ch.el('button', 'btn ghost sm', Ch.esc(p[0])); b.type = 'button'; b.onclick = () => { Object.assign(S, { informed: false }, p[1]); syncUI(); recompute(); }; pr.querySelector('.presetrow').appendChild(b); });
    host.appendChild(pr);

    const fam = add('<label for="c-fam">Light patterns</label><select id="c-fam"></select><p class="plain" id="c-fam-p"></p>');
    m.families.forEach(f => { const o = Ch.el('option'); o.value = f.id; o.textContent = f.label; fam.querySelector('select').appendChild(o); });
    const kk = add('<label for="c-k">Number of patterns, K <span class="val" id="c-k-v"></span></label><input id="c-k" type="range" min="0" max="' + (Ks.length - 1) + '" step="1"><p class="plain">How many different light stencils are shown. Total time is fixed, so more stencils means less light for each.</p>');
    const dd = add('<label for="c-d">Light budget <span class="val" id="c-d-v"></span></label><input id="c-d" type="range" min="0" max="3.5" step="0.1"><p class="plain">Photons (light particles) a bright pixel would give in one full point scan. Less light means more shot noise (the random counting error of light).</p>');
    const rd = add('<label for="c-r">Camera hiss <span class="val" id="c-r-v"></span></label><input id="c-r" type="range" min="0" max="5" step="1"><p class="plain">Read noise: a fixed random error added by the camera on every shot. ×1 is what the real data showed.</p>');
    const mt = add('<label for="c-m">Rebuild recipe</label><select id="c-m"></select><p class="plain" id="c-m-p"></p>');
    RECIPES.forEach(r => { const o = Ch.el('option'); o.value = r[0]; o.textContent = r[1]; mt.querySelector('select').appendChild(o); });
    const kp = add('<label for="c-kap">Smoothing strength <span class="val" id="c-kap-v"></span></label><input id="c-kap" type="range" min="-1.5" max="1.5" step="0.1"><p class="plain">Regularisation (how strongly the recipe distrusts the raw data). Centre = automatic setting tuned in the notebook.</p>');
    const jt = add('<div class="ctl-group"></div><label for="c-j">Sample jitter <span class="val" id="c-j-v"></span></label><input id="c-j" type="range" min="0" max="3" step="0.25"><p class="plain">How far the sample wobbles between shots, in pixels (random, different every shot).</p><label class="check"><input type="checkbox" id="c-inf"><span>The solver knows exactly how far it moved</span></label>');
    const wl = add('<div class="ctl-group"></div><label for="c-l">Wavenumber slice <span class="val" id="c-l-v"></span></label><input id="c-l" type="range" min="0" max="' + (m.L - 1) + '" step="1"><p class="plain">Raman shift in cm⁻¹: the colour of the scattered light, which tells which molecule vibrates.</p><div class="bandrow" style="display:flex;gap:6px;flex-wrap:wrap"></div>');
    m.bands.forEach(b => { const x = Ch.el('button', 'btn ghost sm', b.wn + ''); x.type = 'button'; x.title = 'Jump to ' + b.wn + ' cm⁻¹'; x.onclick = () => { S.l = b.idx; syncUI(); redraw(); }; wl.querySelector('.bandrow').appendChild(x); });
    const sh = add('<label for="c-s">Camera frame shown <span class="val" id="c-s-v"></span></label><input id="c-s" type="range" min="1" max="64" step="1"><p class="plain">The camera takes one frame per pattern; pick which one to look at.</p>');
    if (m.samples.length > 1) {
      const sm = add('<label for="c-sam">Sample</label><select id="c-sam"></select>');
      m.samples.forEach(s => { const o = Ch.el('option'); o.value = s.id; o.textContent = s.label; sm.querySelector('select').appendChild(o); });
      sm.querySelector('select').onchange = e => { S.sample = e.target.value; loadSample(); recompute(); };
    }
    const nb = Ch.el('div', 'ctl'); nb.innerHTML = '<button class="btn" id="c-new" type="button">New noise draw</button>'; host.appendChild(nb);

    const q = id => $(id);
    function syncUI() {
      q('c-fam').value = S.fam; q('c-fam-p').textContent = m.families.find(f => f.id === S.fam).plain;
      const ki = Ks.indexOf(S.K); q('c-k').value = ki < 0 ? 0 : ki; q('c-k-v').textContent = S.K;
      q('c-d').value = S.dlog; q('c-d-v').textContent = '10^' + (+S.dlog).toFixed(1) + ' photons';
      const ri = READ.findIndex(v => v === S.readMult); q('c-r').value = ri < 0 ? 2 : ri; q('c-r-v').textContent = '×' + S.readMult;
      q('c-m').value = S.method; q('c-m-p').textContent = RECIPES.find(r => r[0] === S.method)[2];
      q('c-kap').value = Math.log10(S.kappaMult); q('c-kap-v').textContent = '×' + S.kappaMult.toFixed(2);
      q('c-j').value = S.jitter; q('c-j-v').textContent = S.jitter + ' px'; q('c-inf').checked = !!S.informed;
      q('c-l').value = S.l; q('c-l-v').textContent = m.wn[S.l].toFixed(0) + ' cm⁻¹';
      const n = App.patterns[S.fam][String(S.K)].n; q('c-s').max = n; if (S.shot > n) S.shot = n; q('c-s').value = S.shot; q('c-s-v').textContent = S.shot + ' of ' + n;
    }
    q('c-fam').onchange = e => { S.fam = e.target.value; S.shot = 1; syncUI(); recompute(); };
    q('c-k').oninput = e => { S.K = Ks[+e.target.value]; S.shot = 1; syncUI(); recompute(); };
    q('c-d').oninput = e => { S.dlog = +e.target.value; syncUI(); recompute(); };
    q('c-r').oninput = e => { S.readMult = READ[+e.target.value]; syncUI(); recompute(); };
    q('c-m').onchange = e => { S.method = e.target.value; syncUI(); recompute(); };
    q('c-kap').oninput = e => { S.kappaMult = Math.pow(10, +e.target.value); syncUI(); recompute(); };
    q('c-j').oninput = e => { S.jitter = +e.target.value; syncUI(); recompute(); };
    q('c-inf').onchange = e => { S.informed = e.target.checked; recompute(); };
    q('c-l').oninput = e => { S.l = +e.target.value; syncUI(); redraw(); };
    q('c-s').oninput = e => { S.shot = +e.target.value; syncUI(); redraw(); };
    q('c-new').onclick = () => { S.seed = (S.seed * 7919 + 13) % 1000003; recompute(); };
    App.lab.syncUI = syncUI;
    syncUI(); loadSample(); initPlots(); recompute();
  }

  function loadSample() {
    const s = App.meta.samples.find(x => x.id === App.lab.S.sample);
    E.setCube(App.samples[s.id], s.max);
  }

  let raf = 0;
  function recompute() { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; const S = App.lab.S; App.lab.res = E.run({ fam: S.fam, K: S.K, dlog: S.dlog, readMult: S.readMult, method: S.method, kappaMult: S.kappaMult, jitter: S.jitter, informed: S.informed, seed: S.seed }); redraw(); Ch.refreshLive(); }); }

  const TW = { margin: { l: 38, r: 6, t: 4, b: 34 } };
  function imgLayout(extra) {
    return Ch.layout(Object.assign({ margin: { l: 34, r: 6, t: 4, b: 30 }, xaxis: Ch.ax({ title: Ch.title('x (light-coded direction)'), range: [-0.5, 63.5], constrain: 'domain', showgrid: false }), yaxis: Ch.ax({ title: Ch.title('y'), range: [63.5, -0.5], scaleanchor: 'x', showgrid: false }), showlegend: false }, extra));
  }
  function initPlots() {
    ['p-true', 'p-recon', 'p-err'].forEach(id => { $(id).__ready = false; });
  }
  function px() { const [x, y] = App.lab.S.px; return { x: [x], y: [y], mode: 'markers', type: 'scatter', marker: { size: 11, color: 'rgba(0,0,0,0)', line: { color: '#14202c', width: 2 } }, hoverinfo: 'skip', showlegend: false }; }

  function redraw() {
    const { S, res } = App.lab; if (!res) return;
    const m = App.meta, L = S.l;
    const tr = E.band(E.F, L), rc = E.band(res.Fh, L);
    let zmax = 0; tr.forEach(r => r.forEach(v => { if (v > zmax) zmax = v; })); zmax = Math.max(zmax * 1.05, 1e-6);
    const err = rc.map((r, j) => r.map((v, i) => v - tr[j][i]));
    let emax = 0; err.forEach(r => r.forEach(v => { if (Math.abs(v) > emax) emax = Math.abs(v); })); emax = Math.max(emax, zmax * 0.15);
    const hm = (z, sc, lo, hi, name) => ({ type: 'heatmap', z, colorscale: sc, zmin: lo, zmax: hi, showscale: false, hovertemplate: 'x %{x}, y %{y}<br>' + name + ' %{z:.3f}<extra></extra>', zsmooth: false });
    const ttl = ' at ' + m.wn[L].toFixed(0) + ' cm⁻¹';
    const put = (id, data, lay) => { const d = $(id); if (!d.__ready) { Plotly.newPlot(d, data, lay, Ch.CONFIG); d.__ready = true; } else Plotly.react(d, data, lay, Ch.CONFIG); };
    put('p-true', [hm(tr, Ch.SC_BLUE, 0, zmax, 'signal'), px()], imgLayout());
    put('p-recon', [hm(rc, Ch.SC_BLUE, 0, zmax, 'signal'), px()], imgLayout());
    put('p-err', [hm(err, Ch.SC_DIV, -emax, emax, 'difference'), px()], imgLayout());
    ['p-true', 'p-recon', 'p-err'].forEach(id => { const d = $(id); if (!d.__click) { d.__click = true; d.on('plotly_click', ev => { const p = ev.points[0]; S.px = [Math.round(p.x), Math.round(p.y)]; redraw(); }); } });
    $('cap-recon').textContent = 'Rebuilt: ' + (RECIPES.find(r => r[0] === S.method)[1]).toLowerCase() + ttl;
    // patterns
    const P = res.nominal; const NX = m.NX, n = P.n; const z = [];
    for (let i = 0; i < n; i++) { const row = new Array(NX); for (let x = 0; x < NX; x++) row[x] = P.P[i * NX + x]; z.push(row); }
    put('p-pat', [{ type: 'heatmap', z, colorscale: [[0, '#eef3f8'], [1, '#2a78d6']], showscale: false, xgap: 0, ygap: 0, hovertemplate: 'shot %{y}, pixel column %{x}<br>mirror on: %{z:.0f}<extra></extra>', zmin: 0, zmax: 1 },
      { type: 'scatter', x: [-0.5, NX - 0.5, NX - 0.5, -0.5, -0.5], y: [S.shot - 1.5, S.shot - 1.5, S.shot - 0.5, S.shot - 0.5, S.shot - 1.5], mode: 'lines', line: { color: '#14202c', width: 2 }, hoverinfo: 'skip', showlegend: false }],
      Ch.layout({ margin: { l: 38, r: 6, t: 4, b: 30 }, showlegend: false, xaxis: Ch.ax({ title: Ch.title('pixel column x'), showgrid: false, range: [-0.5, NX - 0.5] }), yaxis: Ch.ax({ title: Ch.title('shot number'), autorange: 'reversed', showgrid: false }) }));
    // camera frame
    const fr = E.frame(res.counts, S.shot - 1);
    let fmx = 0; fr.forEach(r => r.forEach(v => { if (v > fmx) fmx = v; })); fmx = Math.max(fmx, 1e-6);
    $('cap-frame').textContent = 'Camera frame: shot ' + S.shot + ' of ' + n + ' (y vs colour)';
    put('p-frame', [{ type: 'heatmap', z: fr, x: m.wn, colorscale: Ch.SC_BLUE, zmin: 0, zmax: fmx * 0.9, showscale: false, hovertemplate: '%{x:.0f} cm⁻¹, y %{y}<br>%{z:.3f}<extra></extra>' }],
      Ch.layout({ margin: { l: 34, r: 6, t: 4, b: 30 }, showlegend: false, xaxis: Ch.ax({ title: Ch.title('wavenumber (cm⁻¹)'), showgrid: false }), yaxis: Ch.ax({ title: Ch.title('y'), autorange: 'reversed', showgrid: false }) }));
    // spectrum
    const [sx, sy] = S.px; const st = E.spectrum(E.F, sx, sy), sr = E.spectrum(res.Fh, sx, sy);
    $('cap-spec').textContent = 'Spectrum of pixel (' + sx + ', ' + sy + ')';
    put('p-spec', [
      { type: 'scatter', mode: 'lines', x: m.wn, y: st, name: 'real', line: { color: '#14202c', width: 2 }, hovertemplate: '%{x:.0f} cm⁻¹: %{y:.3f}<extra>real</extra>' },
      { type: 'scatter', mode: 'lines', x: m.wn, y: sr, name: 'rebuilt', line: { color: '#eb6834', width: 2 }, hovertemplate: '%{x:.0f} cm⁻¹: %{y:.3f}<extra>rebuilt</extra>' },
      { type: 'scatter', mode: 'lines', x: [m.wn[L], m.wn[L]], y: [0, Math.max(...st, ...sr) * 1.05], line: { color: '#6f8094', width: 1, dash: 'dot' }, hoverinfo: 'skip', showlegend: false }],
      Ch.layout({ margin: { l: 40, r: 6, t: 4, b: 50 }, xaxis: Ch.ax({ title: Ch.title('wavenumber (cm⁻¹)') }), yaxis: Ch.ax({ title: Ch.title('intensity') }), legend: { orientation: 'h', y: -0.28, x: 0 } }));
    // metrics
    const M = res.metrics;
    $('metrics').innerHTML =
      mcard('Overall mistake', (100 * M.nrmse).toFixed(0) + '%', '0% = perfect (nRMSE: size of the error compared with the size of the image)') +
      mcard('Spectrum shape mistake', M.sam.toFixed(1) + '°', 'Spectral angle: how far the rebuilt colour-fingerprint is rotated from the real one') +
      mcard('Peak height mistake', (100 * M.peakerr).toFixed(0) + '%', 'Typical error on the main molecular peaks') +
      mcard('Light per shot', res.s.toFixed(1), 'photons per bright pixel, per shot. ' + res.n + ' shots · computed in ' + res.ms.toFixed(0) + ' ms');
  }
  const mcard = (a, b, c) => '<div class="metric"><span>' + a + '</span><b>' + b + '</b><small>' + c + '</small></div>';

  window.addEventListener('DOMContentLoaded', async () => {
    try {
      await load();
      banner();
      startHero();
      buildLab();
      if (window.buildCards) window.buildCards(App);
    } catch (e) {
      console.error(e);
      document.querySelector('.hero-text').insertAdjacentHTML('beforeend', '<div class="banner"><b>Could not load the data files.</b> ' + Ch.esc(e.message) + '. Open the page through a web server (for example <code>npx serve</code>) rather than double-clicking the file, and make sure the <code>data/</code> folder is next to <code>index.html</code>.</div>');
    }
  });
})();
