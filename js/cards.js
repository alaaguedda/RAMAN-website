/* All comparison charts. Each card draws from the precomputed experiment tables (data/tables.json) unless it says "live". */
(function () {
  'use strict';
  const Ch = Charts, E = Engine;
  const { C, GROUP, GCOL, GNAME, FSTYLE, SHORT, MCOL, MNAME, MORACLE, METRIC, SC_BLUE, SC_ORANGE, SC_DIV, val, hexA, ax, title, layout, domains } = Ch;
  const MSHORT = { ls: 'exact undo', ridge: 'ridge', smooth: 'smooth prior', tv: 'total variation', proj_known: 'project (known)', unmix_known: 'unmix (known)', lowrank_blind: 'low-rank', mlp: 'neural net' };
  const tint = (hex, t) => { const n = parseInt(hex.slice(1), 16), f = c => Math.round(c + (255 - c) * (1 - t)); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };
  const near = (arr, v) => { let b = arr[0], d = 1e99; arr.forEach(a => { if (Math.abs(a - v) < d) { d = Math.abs(a - v); b = a; } }); return b; };
  const lightLabel = d => '10^' + d + ' photons';
  const A = n => n > 1 ? n : '';
  const mlabel = m => MNAME[m] + (MORACLE[m] ? ' *' : '');

  window.buildCards = function (App) {
    const M = App.meta, T = App.tables;
    const fams = M.families.map(f => f.id), flab = id => M.families.find(f => f.id === id).label;
    const Ks = M.Ks, Dl = M.Dlogs;
    const fcol = id => GCOL[GROUP[id]];
    const host = id => document.getElementById(id);
    const metricOpts = Object.keys(METRIC).map(k => [k, METRIC[k].label]);
    const famOpts = ids => ids.map(f => [f, flab(f)]);
    const mText = (k, v) => v == null ? '' : METRIC[k].fmt(v);
    const scaleFor = k => METRIC[k].better === 'low' ? SC_ORANGE : SC_BLUE;
    const grid = (rec, met) => T.grid.arr[rec][met];

    // =============================================================== 3D CUBE
    const wnDs = []; for (let k = 0; k < M.ds_shape[2]; k++) wnDs.push((M.wn[2 * k] + M.wn[2 * k + 1]) / 2);
    const isoCache = {};
    function isoData(name) {
      if (isoCache[name]) return isoCache[name];
      const [nx, ny, nl] = M.ds_shape, src = App.ds[name], x = [], y = [], z = [], v = [];
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nl; k++) { x.push(i * 2); y.push(j * 2); z.push(wnDs[k]); v.push(src[(i * ny + j) * nl + k] / 255); }
      return (isoCache[name] = { x, y, z, v });
    }
    Ch.makeCard(host('g-cube'), {
      title: 'Spectrum cube as glowing shells: real vs rebuilt', wide: true, height: 520,
      note: 'The two image directions are x and y, the vertical axis is the Raman shift. Each shell wraps the part of the cube brighter than the threshold. A good reconstruction has the same shells as the real cube. Rotate with the mouse. <b>* uses the known molecule spectra (optimistic).</b>',
      controls: [
        { key: 'm', label: 'Rebuilt with', type: 'select', value: 'smooth', options: M.ds_names.filter(n => n !== 'true').map(n => [n, mlabel(n)]) },
        { key: 't', label: 'Brightness threshold', type: 'range', min: 0.05, max: 0.7, step: 0.05, value: 0.2, fmt: v => (100 * v).toFixed(0) + '% of max' }
      ],
      render(st) {
        const a = isoData('true'), b = isoData(st.m);
        const mk = (d, scene, name) => ({ type: 'isosurface', x: d.x, y: d.y, z: d.z, value: d.v, isomin: st.t, isomax: 1, surface: { count: 2, fill: 0.9 }, caps: { x: { show: false }, y: { show: false }, z: { show: false } }, colorscale: SC_BLUE, cmin: 0, cmax: 1, showscale: false, opacity: 0.6, scene, name, hoverinfo: 'skip' });
        const sc = (dom) => ({ domain: dom, xaxis: { title: { text: 'x' }, gridcolor: C.grid, backgroundcolor: '#fff' }, yaxis: { title: { text: 'y' }, gridcolor: C.grid, backgroundcolor: '#fff' }, zaxis: { title: { text: 'Raman shift (cm⁻¹)' }, gridcolor: C.grid, backgroundcolor: '#fff' }, aspectmode: 'manual', aspectratio: { x: 1, y: 1, z: 0.9 }, camera: { eye: { x: 1.6, y: -1.7, z: 0.9 } } });
        return {
          data: [mk(a, 'scene', 'real'), mk(b, 'scene2', mlabel(st.m))],
          layout: layout({ margin: { l: 0, r: 0, t: 24, b: 0 }, scene: sc({ x: [0, 0.5], y: [0, 1] }), scene2: sc({ x: [0.5, 1], y: [0, 1] }), annotations: [{ text: 'real cube', x: 0.25, y: 1, xref: 'paper', yref: 'paper', showarrow: false, font: { size: 14, color: C.ink } }, { text: 'rebuilt: ' + mlabel(st.m), x: 0.75, y: 1, xref: 'paper', yref: 'paper', showarrow: false, font: { size: 14, color: C.ink } }] }),
          table: { head: ['pixels above threshold', 'real', 'rebuilt'], rows: [['count (of ' + a.v.length + ')', a.v.filter(v => v >= st.t).length, b.v.filter(v => v >= st.t).length]] }
        };
      }
    });
    Ch.makeCard(host('g-cube'), {
      title: 'Terrain: the live lab image as a mountain range', wide: true, height: 480, live: true,
      note: 'Height = signal at the wavenumber slice chosen in the lab above. Blue = real cell, orange = rebuilt. It follows every control in the lab, so you can watch noise roughen the mountains.',
      render() {
        const r = App.lab && App.lab.res; if (!r) return null;
        const L = App.lab.S.l, tr = E.band(E.F, L), rc = E.band(r.Fh, L), xs = [...Array(M.NX).keys()];
        const scn = { xaxis: { title: { text: 'x' }, gridcolor: C.grid, backgroundcolor: '#fff' }, yaxis: { title: { text: 'y' }, gridcolor: C.grid, autorange: 'reversed', backgroundcolor: '#fff' }, zaxis: { title: { text: 'signal' }, gridcolor: C.grid, backgroundcolor: '#fff' }, aspectratio: { x: 1, y: 1, z: 0.55 }, camera: { eye: { x: 1.5, y: -1.7, z: 0.9 } } };
        return {
          data: [
            { type: 'surface', x: xs, y: xs, z: tr, colorscale: [[0, '#9cc0f0'], [1, '#2a78d6']], showscale: false, opacity: 0.85, name: 'real', showlegend: true, hovertemplate: 'x %{x}, y %{y}<br>real %{z:.3f}<extra></extra>' },
            { type: 'surface', x: xs, y: xs, z: rc, colorscale: [[0, '#f3a982'], [1, '#c24d1f']], showscale: false, opacity: 0.7, name: 'rebuilt', showlegend: true, hovertemplate: 'x %{x}, y %{y}<br>rebuilt %{z:.3f}<extra></extra>' }],
          layout: layout({ margin: { l: 0, r: 0, t: 0, b: 0 }, scene: scn, legend: { orientation: 'h', y: 0.02, x: 0.02 } }),
          table: { head: ['slice (cm⁻¹)', 'max real', 'max rebuilt'], rows: [[M.wn[L], Math.max(...tr.map(r => Math.max(...r))), Math.max(...rc.map(r => Math.max(...r)))]] }
        };
      }
    });

    // =============================================================== DESIGNS
    const dDef = near(Dl, 1.5);
    Ch.makeCard(host('g-designs'), {
      title: 'Scoreboard: every pattern family at every K', wide: true, height: 420,
      note: 'Darker = worse for the mistake measures, darker = better for the map match. Rows are grouped: scans, random, Hadamard types, sliding masks. Total measuring time is the same everywhere.',
      controls: [
        { key: 'metric', label: 'Measure', type: 'select', value: 'nrmse', options: metricOpts },
        { key: 'rec', label: 'Recipe', type: 'select', value: 'smooth', options: [['smooth', 'smooth prior'], ['ridge', 'ridge']] },
        { key: 'd', label: 'Light', type: 'select', value: dDef, options: Dl.map(d => [d, lightLabel(d)]) }],
      render(st) {
        const arr = grid(st.rec, st.metric), di = Dl.indexOf(st.d);
        const z = fams.map((f, fi) => Ks.map((K, ki) => val(arr[fi][ki][di])));
        return {
          data: [{ type: 'heatmap', z, x: Ks.map(k => 'K=' + k), y: fams.map(flab), colorscale: scaleFor(st.metric), text: z.map(r => r.map(v => mText(st.metric, v))), texttemplate: '%{text}', xgap: 2, ygap: 2, showscale: true, colorbar: { thickness: 10, len: 0.9, outlinewidth: 0, tickfont: { size: 11 } }, hovertemplate: '%{y}<br>%{x}: %{text}<extra></extra>' }],
          layout: layout({ margin: { l: 150, r: 10, t: 6, b: 36 }, xaxis: ax({ showgrid: false }), yaxis: ax({ autorange: 'reversed', showgrid: false }) }),
          table: { head: ['family', ...Ks.map(k => 'K=' + k)], rows: fams.map((f, fi) => [flab(f), ...Ks.map((k, ki) => val(arr[fi][ki][di]))]) }
        };
      }
    });
    Ch.makeCard(host('g-designs'), {
      title: 'Map of quality: patterns vs light', height: 400,
      note: 'Contour lines connect settings with the same overall mistake (smooth recipe). Move right for more patterns, up for more light. The little dots are the settings that were really simulated; the rest is interpolated.',
      controls: [{ key: 'f', label: 'Family', type: 'select', value: M.show_family, options: famOpts(fams) }],
      render(st) {
        const fi = fams.indexOf(st.f), a = grid('smooth', 'nrmse')[fi];
        const z = Dl.map((d, di) => Ks.map((k, ki) => val(a[ki][di])));
        return {
          data: [
            { type: 'contour', x: Ks, y: Dl, z, colorscale: SC_ORANGE, connectgaps: true, line: { smoothing: 0.85, width: 1, color: '#14202c' }, contours: { coloring: 'heatmap', showlabels: true, labelfont: { size: 11, color: '#14202c' } }, colorbar: { thickness: 10, outlinewidth: 0, tickfont: { size: 11 }, title: { text: 'mistake', side: 'right' } }, hovertemplate: 'K=%{x}, light 10^%{y}<br>mistake %{z:.2f}<extra></extra>' },
            { type: 'scatter', mode: 'markers', x: [].concat(...Dl.map(() => Ks)), y: [].concat(...Dl.map(d => Ks.map(() => d))), marker: { size: 5, color: '#14202c', line: { color: '#fff', width: 1 } }, hoverinfo: 'skip', showlegend: false }],
          layout: layout({ showlegend: false, xaxis: ax({ type: 'log', tickvals: Ks, ticktext: Ks, title: title('number of patterns K') }), yaxis: ax({ title: title('light budget (log10 photons)') }) }),
          table: { head: ['light \\ K', ...Ks], rows: Dl.map((d, di) => [lightLabel(d), ...Ks.map((k, ki) => val(a[ki][di]))]) }
        };
      }
    });
    Ch.makeCard(host('g-designs'), {
      title: 'Error landscape in 3D: two families head to head', height: 400,
      note: 'Each sheet is the overall mistake over (number of patterns, light). Lower is better. Where one sheet dips below the other, that family wins.',
      controls: [{ key: 'a', label: 'Sheet A', type: 'select', value: 'hadamard_var', options: famOpts(fams) }, { key: 'b', label: 'Sheet B', type: 'select', value: 'raster_skip', options: famOpts(fams) }],
      render(st) {
        const mk = f => { const a = grid('smooth', 'nrmse')[fams.indexOf(f)]; return { type: 'surface', x: Ks.map(k => Math.log2(k)), y: Dl, z: Dl.map((d, di) => Ks.map((k, ki) => val(a[ki][di]))), colorscale: [[0, fcol(f)], [1, fcol(f)]], showscale: false, opacity: 0.88, name: flab(f), showlegend: true, hovertemplate: 'K=%{customdata}, light 10^%{y}<br>mistake %{z:.2f}<extra>' + flab(f) + '</extra>', customdata: Dl.map(() => Ks), lighting: { ambient: 0.75, diffuse: 0.6, specular: 0.15 } }; };
        return {
          data: [mk(st.a), mk(st.b)],
          layout: layout({ margin: { l: 0, r: 0, t: 0, b: 0 }, legend: { orientation: 'h', y: 0.02, x: 0.02 }, scene: { xaxis: { title: { text: 'patterns K' }, tickvals: Ks.map(k => Math.log2(k)), ticktext: Ks, gridcolor: C.grid, backgroundcolor: '#fff' }, yaxis: { title: { text: 'log10 light' }, gridcolor: C.grid, backgroundcolor: '#fff' }, zaxis: { title: { text: 'mistake' }, gridcolor: C.grid, backgroundcolor: '#fff' }, camera: { eye: { x: 1.7, y: -1.6, z: 0.8 } } } }),
          table: { head: ['family', 'K', 'light', 'mistake'], rows: [st.a, st.b].flatMap(f => { const a = grid('smooth', 'nrmse')[fams.indexOf(f)]; return Ks.flatMap((k, ki) => Dl.map((d, di) => [flab(f), k, d, val(a[ki][di])])); }) }
        };
      }
    });
    Ch.makeCard(host('g-designs'), {
      title: 'Trade-off: more patterns, less light each', height: 400, wide: true,
      note: 'Total time is fixed, so doubling the patterns halves the light of each one. Every family has a sweet spot; the Hadamard types keep improving longer than a plain scan. Colour = family group, line style = member of the group.',
      controls: [
        { key: 'metric', label: 'Measure', type: 'select', value: 'nrmse', options: metricOpts },
        { key: 'rec', label: 'Recipe', type: 'select', value: 'smooth', options: [['smooth', 'smooth prior'], ['ridge', 'ridge']] },
        { key: 'd', label: 'Light', type: 'select', value: dDef, options: Dl.map(d => [d, lightLabel(d)]) }],
      render(st) {
        const arr = grid(st.rec, st.metric), di = Dl.indexOf(st.d);
        const data = fams.map((f, fi) => ({ type: 'scatter', mode: 'lines+markers', x: Ks, y: Ks.map((k, ki) => val(arr[fi][ki][di])), name: SHORT[f], legendgroup: GROUP[f], line: { color: fcol(f), width: 2, dash: FSTYLE[f].dash }, marker: { size: 8, symbol: FSTYLE[f].symbol, color: fcol(f), line: { color: '#fff', width: 1.5 } }, hovertemplate: SHORT[f] + '<br>K=%{x}: %{y:.3f}<extra></extra>' }));
        return {
          data, layout: layout({ xaxis: ax({ type: 'log', tickvals: Ks, ticktext: Ks, title: title('number of patterns K (log scale)') }), yaxis: ax({ title: title(METRIC[st.metric].label) }), legend: { orientation: 'h', y: -0.25 } }),
          table: { head: ['family', ...Ks.map(k => 'K=' + k)], rows: fams.map((f, fi) => [SHORT[f], ...Ks.map((k, ki) => val(arr[fi][ki][di]))]) }
        };
      }
    });
    Ch.makeCard(host('g-designs'), {
      title: 'Who wins where?', height: 380,
      note: 'For each combination of patterns and light, the colour shows the group of the best family and the label names it.',
      controls: [{ key: 'metric', label: 'Measure', type: 'select', value: 'nrmse', options: metricOpts }],
      render(st) {
        const arr = grid('smooth', st.metric), low = METRIC[st.metric].better === 'low';
        const gi = ['scan', 'random', 'hadamard', 'slide']; const z = [], text = [], rows = [];
        Dl.forEach((d, di) => { const zr = [], tr = []; Ks.forEach((k, ki) => { let best = null, bf = -1; fams.forEach((f, fi) => { const v = val(arr[fi][ki][di]); if (v != null && (best == null || (low ? v < best : v > best))) { best = v; bf = fi; } }); zr.push(bf < 0 ? null : gi.indexOf(GROUP[fams[bf]])); tr.push(bf < 0 ? '' : SHORT[fams[bf]]); rows.push([lightLabel(d), k, bf < 0 ? '' : flab(fams[bf]), best]); }); z.push(zr); text.push(tr); });
        const cs = []; gi.forEach((g, i) => { cs.push([i / 4, GCOL[g]]); cs.push([(i + 1) / 4, GCOL[g]]); });
        const data = [{ type: 'heatmap', x: Ks.map(k => 'K=' + k), y: Dl.map(lightLabel), z, text, texttemplate: '%{text}', textfont: { size: 11, color: '#fff' }, colorscale: cs, zmin: -0.5, zmax: 3.5, showscale: false, xgap: 2, ygap: 2, hovertemplate: '%{y}, %{x}<br>%{text}<extra></extra>' }];
        gi.forEach(g => data.push({ type: 'scatter', mode: 'markers', x: [null], y: [null], name: GNAME[g], marker: { size: 11, symbol: 'square', color: GCOL[g] } }));
        return { data, layout: layout({ margin: { l: 110, r: 10, t: 6, b: 60 }, xaxis: ax({ showgrid: false }), yaxis: ax({ showgrid: false }), legend: { orientation: 'h', y: -0.2 } }), table: { head: ['light', 'K', 'winner', 'value'], rows } };
      }
    });
    Ch.makeCard(host('g-designs'), {
      title: 'The nine light-pattern sets, drawn', wide: true, height: 640,
      note: 'Each picture has one row per shot and one column per pixel column of the sample. Blue = mirror on. Point scans are a diagonal; Hadamard patterns are stripes of changing width; the sliding mask repeats one strip shifted by one step per shot.',
      controls: [{ key: 'K', label: 'Patterns K', type: 'select', value: M.K_focus, options: Ks.map(k => [k, k]) }],
      render(st) {
        const dom = domains(3, 3, 0.04, 0.1), data = [], lay = { margin: { l: 8, r: 8, t: 8, b: 8 }, showlegend: false, annotations: [] }, rows = [];
        fams.forEach((f, i) => {
          const p = App.patterns[f][String(st.K)], z = p.Pext.map(r => r.slice(M.pad, M.pad + M.NX)), n = i + 1, d = dom[i];
          data.push({ type: 'heatmap', z, colorscale: [[0, '#eef3f8'], [1, '#2a78d6']], showscale: false, xaxis: 'x' + A(n), yaxis: 'y' + A(n), zmin: 0, zmax: 1, hovertemplate: 'shot %{y}, column %{x}: %{z}<extra>' + SHORT[f] + '</extra>' });
          lay['xaxis' + A(n)] = { domain: d.x, anchor: 'y' + A(n), showticklabels: false, showgrid: false, zeroline: false, ticks: '' };
          lay['yaxis' + A(n)] = { domain: d.y, anchor: 'x' + A(n), showticklabels: false, showgrid: false, zeroline: false, autorange: 'reversed', ticks: '' };
          lay.annotations.push({ text: '<b>' + flab(f) + '</b> · ' + p.n + ' shots', x: d.x[0], y: d.y[1] + 0.005, xref: 'paper', yref: 'paper', xanchor: 'left', yanchor: 'bottom', showarrow: false, font: { size: 12, color: C.ink } });
          rows.push([flab(f), p.n, p.kind]);
        });
        return { data, layout: layout(lay), table: { head: ['family', 'shots', 'kind'], rows } };
      }
    });

    // =============================================================== MULTIPLEX
    const mux = T.mux, sr = M.sigma_r, MUXC = { raster_skip: { c: '#eb6834', d: 'solid', s: 'circle' }, hadamard_seq: { c: '#2a78d6', d: 'solid', s: 'circle' }, s_matrix: { c: '#2a78d6', d: 'dashdot', s: 'triangle-up' }, random_bin: { c: '#1baf7a', d: 'solid', s: 'diamond' } };
    const rl = r => r === 0 ? 'no camera hiss' : 'hiss ×' + (r / sr).toFixed(r / sr < 2 ? 1 : 0);
    Ch.makeCard(host('g-multiplex'), {
      title: 'Same experiment, four noisy cameras', wide: true, height: 380,
      note: 'Full-resolution sets (64 patterns) of a plain point scan vs mixed patterns. With a perfect camera mixing gives nothing; as the camera gets noisier, mixing many pixels into one shot wins because the signal rises above the hiss.',
      render() {
        const dom = domains(1, mux.read_levels.length, 0.03, 0), data = [], lay = { margin: { l: 52, r: 8, t: 26, b: 70 }, annotations: [], legend: { orientation: 'h', y: -0.28 } };
        let ymax = 0; mux.nrmse.forEach(a => a.forEach(r => r.forEach(v => { ymax = Math.max(ymax, v); })));
        mux.read_levels.forEach((r, ri) => {
          const n = ri + 1;
          mux.fams.forEach((f, fi) => data.push({ type: 'scatter', mode: 'lines+markers', x: mux.dlogs, y: mux.nrmse[ri][fi], xaxis: 'x' + A(n), yaxis: 'y' + A(n), name: SHORT[f] || f, legendgroup: f, showlegend: ri === 0, line: { color: MUXC[f].c, width: 2, dash: MUXC[f].d }, marker: { size: 8, symbol: MUXC[f].s, color: MUXC[f].c, line: { color: '#fff', width: 1.5 } }, hovertemplate: (SHORT[f] || f) + '<br>light 10^%{x}: %{y:.3f}<extra>' + rl(r) + '</extra>' }));
          lay['xaxis' + A(n)] = ax({ domain: dom[ri].x, anchor: 'y' + A(n), title: title('log10 light'), automargin: true });
          lay['yaxis' + A(n)] = ax({ domain: [0, 1], anchor: 'x' + A(n), range: [0, Math.min(ymax * 1.05, 1.6)], showticklabels: ri === 0, title: ri === 0 ? title('overall mistake') : undefined });
          lay.annotations.push({ text: '<b>' + rl(r) + '</b>', x: (dom[ri].x[0] + dom[ri].x[1]) / 2, y: 1.02, xref: 'paper', yref: 'paper', showarrow: false, font: { size: 12.5, color: C.ink } });
        });
        return { data, layout: layout(lay), table: { head: ['camera hiss', 'family', ...mux.dlogs.map(d => 'light 10^' + d)], rows: mux.read_levels.flatMap((r, ri) => mux.fams.map((f, fi) => [rl(r), SHORT[f] || f, ...mux.nrmse[ri][fi]])) } };
      }
    });
    Ch.makeCard(host('g-multiplex'), {
      title: 'Advantage of mixing: error ratio', height: 360,
      note: 'Point-scan error divided by the mixed-pattern error. Blue (above 1×) = mixing wins; red = the plain scan wins; grey = tie.',
      controls: [{ key: 'o', label: 'Compare scan with', type: 'select', value: 'hadamard_seq', options: [['hadamard_seq', 'Hadamard'], ['s_matrix', 'S-matrix'], ['random_bin', 'random masks']] }],
      render(st) {
        const a = mux.fams.indexOf('raster_skip'), b = mux.fams.indexOf(st.o);
        const z = mux.read_levels.map((r, ri) => mux.dlogs.map((d, di) => Math.log2(mux.nrmse[ri][a][di] / mux.nrmse[ri][b][di])));
        let m = 0; z.forEach(r => r.forEach(v => { m = Math.max(m, Math.abs(v)); })); m = Math.max(m, 0.3);
        const text = z.map(r => r.map(v => '×' + Math.pow(2, v).toFixed(2)));
        return {
          data: [{ type: 'heatmap', z, x: mux.dlogs.map(d => '10^' + d), y: mux.read_levels.map(rl), text, texttemplate: '%{text}', zmin: -m, zmax: m, colorscale: [[0, '#c93a39'], [0.25, '#f2a09f'], [0.5, '#f1f3f5'], [0.75, '#8fb8ee'], [1, '#1b5199']], showscale: false, xgap: 2, ygap: 2, hovertemplate: '%{y}, light %{x}<br>ratio %{text}<extra></extra>' }],
          layout: layout({ margin: { l: 110, r: 10, t: 6, b: 50 }, xaxis: ax({ showgrid: false, title: title('light budget (photons)') }), yaxis: ax({ showgrid: false, autorange: 'reversed' }) }),
          table: { head: ['camera hiss', ...mux.dlogs.map(d => '10^' + d)], rows: mux.read_levels.map((r, ri) => [rl(r), ...z[ri].map(v => Math.pow(2, v))]) }
        };
      }
    });
    Ch.makeCard(host('g-multiplex'), {
      title: 'Signal-to-noise per shot (calculated live)', height: 360,
      note: 'Signal-to-noise = counted light ÷ total random error. At low light the camera hiss dominates (slope 1); at high light only the unavoidable counting error is left (slope ½). Mixing patterns lifts you to the right on this chart.',
      render() {
        const xs = []; for (let e = 0; e <= 4; e += 0.1) xs.push(Math.pow(10, e));
        const lv = [0, 1, 3, 10], cols = ['#9cc0f0', '#5d97e4', '#2a78d6', '#1b5199'];
        const data = lv.map((m, i) => ({ type: 'scatter', mode: 'lines', x: xs, y: xs.map(u => u / Math.sqrt(u + Math.pow(sr * m, 2))), name: m === 0 ? 'no camera hiss' : 'hiss ×' + m, line: { color: cols[i], width: 2.5 }, hovertemplate: '%{x:.0f} photons: SNR %{y:.1f}<extra>' + (m === 0 ? 'no hiss' : 'hiss ×' + m) + '</extra>' }));
        return { data, layout: layout({ xaxis: ax({ type: 'log', title: title('photons counted in one pixel of one shot') }), yaxis: ax({ type: 'log', title: title('signal-to-noise ratio') }) }), table: { head: ['photons', ...lv.map(m => 'hiss ×' + m)], rows: xs.filter((_, i) => i % 5 === 0).map(u => [u, ...lv.map(m => u / Math.sqrt(u + Math.pow(sr * m, 2)))]) } };
      }
    });

    // =============================================================== METHODS
    const MT = T.methods, mf = MT.fams, mm = MT.methods, mKs = MT.Ks, mDl = MT.Dlogs;
    const cell = (met, f, m, k, d) => val(MT.arr[met][mf.indexOf(f)][mm.indexOf(m)][mKs.indexOf(k)][mDl.indexOf(d)]);
    const mDef = { f: mf.indexOf(M.show_family) >= 0 ? M.show_family : mf[0], k: near(mKs, M.K_focus), d: near(mDl, M.Dlog_focus) };
    const mCtl = [
      { key: 'f', label: 'Patterns', type: 'select', value: mDef.f, options: famOpts(mf) },
      { key: 'k', label: 'K', type: 'select', value: mDef.k, options: mKs.map(k => [k, k]) },
      { key: 'd', label: 'Light', type: 'select', value: mDef.d, options: mDl.map(d => [d, lightLabel(d)]) }];
    Ch.makeCard(host('g-methods'), {
      title: 'Report card of the eight recipes', height: 420, controls: mCtl,
      note: 'Four skills, scaled so that bigger is better: image accuracy, spectrum shape, peak heights, molecule maps. A recipe with a big even polygon is good at everything. <b>* = knows the molecule spectra in advance (optimistic).</b>',
      render(st) {
        const ax4 = ['Image accuracy', 'Spectrum shape', 'Peak heights', 'Molecule maps'], cl = v => Math.max(0, Math.min(1, v == null ? 0 : v));
        const data = mm.map(m => {
          const r = [cl(1 - cell('nrmse', st.f, m, st.k, st.d)), cl(1 - (cell('sam', st.f, m, st.k, st.d) ?? 90) / 45), cl(1 - (cell('peakerr', st.f, m, st.k, st.d) ?? 1)), cl(cell('acorr', st.f, m, st.k, st.d))];
          return { type: 'scatterpolar', r: r.concat(r[0]), theta: ax4.concat(ax4[0]), fill: 'toself', fillcolor: hexA(MCOL[m], 0.08), name: mlabel(m), line: { color: MCOL[m], width: 2, dash: MORACLE[m] ? 'dash' : 'solid' }, marker: { size: 6, color: MCOL[m] }, hovertemplate: '%{theta}: %{r:.2f}<extra>' + mlabel(m) + '</extra>' };
        });
        return { data, layout: layout({ margin: { l: 50, r: 50, t: 20, b: 70 }, polar: { radialaxis: { range: [0, 1], gridcolor: C.grid, linecolor: C.line, tickfont: { size: 10 } }, angularaxis: { gridcolor: C.grid, linecolor: C.line, tickfont: { size: 12, color: C.ink } }, bgcolor: '#fff' }, legend: { orientation: 'h', y: -0.12, font: { size: 11 } } }),
          table: { head: ['recipe', 'nRMSE', 'angle°', 'peak err', 'map match'], rows: mm.map(m => [mlabel(m), ...['nrmse', 'sam', 'peakerr', 'acorr'].map(k => cell(k, st.f, m, st.k, st.d))]) } };
      }
    });
    Ch.makeCard(host('g-methods'), {
      title: 'Parallel lines: every setting at once', height: 420,
      note: '<span id="mchips"></span> Each line is one experiment (recipe × patterns × K × light). Drag along any vertical axis to keep only a range, for example only the lowest mistakes, and see which recipes survive.',
      controls: [{ key: 'f', label: 'Patterns', type: 'select', value: 'all', options: [['all', 'all families']].concat(famOpts(mf)) }],
      onReady(div, st, api) { const c = api.root.querySelector('#mchips'); if (c) c.innerHTML = mm.map(m => '<span style="display:inline-flex;align-items:center;gap:4px;margin-right:10px"><i style="width:10px;height:10px;border-radius:2px;background:' + MCOL[m] + ';display:inline-block"></i>' + Ch.esc(mlabel(m)) + '</span>').join(''); },
      render(st) {
        const rows = [];
        mf.forEach(f => { if (st.f !== 'all' && st.f !== f) return; mm.forEach((m, mi) => mKs.forEach(k => mDl.forEach(d => { const v = ['nrmse', 'sam', 'peakerr', 'acorr'].map(q => cell(q, f, m, k, d)); if (v.some(x => x == null)) return; rows.push({ f, m, mi, k, d, v }); }))); });
        const cs = []; mm.forEach((m, i) => { cs.push([i / mm.length, MCOL[m]]); cs.push([(i + 1) / mm.length, MCOL[m]]); });
        const cap = (a, c) => Math.min(Math.max(...a), c);
        const dim = (label, vals, extra) => Object.assign({ label, values: vals }, extra || {});
        return {
          data: [{ type: 'parcoords', line: { color: rows.map(r => r.mi), colorscale: cs, cmin: -0.5, cmax: mm.length - 0.5, showscale: false }, labelfont: { size: 12, color: C.ink }, tickfont: { size: 10.5, color: C.ink2 }, rangefont: { size: 10.5, color: C.ink2 },
            dimensions: [dim('patterns K', rows.map(r => r.k), { tickvals: mKs, range: [Math.min(...mKs), Math.max(...mKs)] }), dim('light (log10)', rows.map(r => r.d), { tickvals: mDl, range: [Math.min(...mDl), Math.max(...mDl)] }),
              dim('overall mistake', rows.map(r => Math.min(r.v[0], 1.5)), { range: [0, 1.5] }), dim('spectrum angle °', rows.map(r => Math.min(r.v[1], 90)), { range: [0, 90] }), dim('peak error', rows.map(r => Math.min(r.v[2], 2)), { range: [0, 2] }), dim('map match', rows.map(r => r.v[3]), { range: [Math.min(0, ...rows.map(r => r.v[3])), 1] })] }],
          layout: layout({ margin: { l: 50, r: 30, t: 40, b: 20 } }),
          table: { head: ['family', 'recipe', 'K', 'light', 'nRMSE', 'angle°', 'peak err', 'map match'], rows: rows.map(r => [flab(r.f), mlabel(r.m), r.k, r.d, ...r.v]) }
        };
      }
    });
    Ch.makeCard(host('g-methods'), {
      title: 'Where the mistakes live: per-pixel error shapes', wide: true, height: 400,
      note: 'Each violin is the spread of the error over 1,500 random pixels (one test cell, patterns “' + flab(M.show_family) + '”, K=' + M.K_focus + '). Wide at the bottom = most pixels are fine; a long thin tail = a few pixels are badly wrong. Errors above 3 are clipped. <b>* = knows the molecule spectra.</b>',
      render() {
        const data = mm.map(m => ({ type: 'violin', y: T.violin[m], name: MSHORT[m] + (MORACLE[m] ? ' *' : ''), line: { color: MCOL[m], width: 1.5 }, fillcolor: hexA(MCOL[m], 0.25), box: { visible: true, width: 0.12, fillcolor: '#fff', line: { color: C.ink, width: 1.2 } }, meanline: { visible: false }, points: false, spanmode: 'hard', scalemode: 'width', width: 0.85, hoverinfo: 'y+name' }));
        return { data, layout: layout({ showlegend: false, violinmode: 'group', xaxis: ax({ showgrid: false }), yaxis: ax({ title: title('error of the pixel spectrum (relative)'), range: [0, 3.05] }) }),
          table: { head: ['recipe', 'median', '90th percentile', 'share above 1'], rows: mm.map(m => { const a = T.violin[m].slice().sort((x, y) => x - y); return [mlabel(m), a[Math.floor(a.length / 2)], a[Math.floor(a.length * 0.9)], a.filter(v => v > 1).length / a.length]; }) } };
      }
    });
    Ch.makeCard(host('g-methods'), {
      title: 'Who wins? A sunburst of best recipes', height: 420,
      note: 'Inner ring: the pattern family. Outer slices: which recipe was best, in how many of the tested (K, light) combinations. A wide slice means that recipe is the usual winner there. <b>* knows the spectra.</b>',
      controls: [{ key: 'metric', label: 'Best by', type: 'select', value: 'nrmse', options: metricOpts }],
      render(st) {
        const low = METRIC[st.metric].better === 'low', ids = [], labels = [], parents = [], values = [], colors = [];
        mf.forEach(f => {
          const cnt = {}; mKs.forEach(k => mDl.forEach(d => { let b = null, bm = null; mm.forEach(m => { const v = cell(st.metric, f, m, k, d); if (v != null && (b == null || (low ? v < b : v > b))) { b = v; bm = m; } }); if (bm) cnt[bm] = (cnt[bm] || 0) + 1; }));
          const tot = Object.values(cnt).reduce((a, b) => a + b, 0); if (!tot) return;
          ids.push(f); labels.push(SHORT[f]); parents.push(''); values.push(tot); colors.push(tint(fcol(f), 0.35));
          Object.keys(cnt).forEach(m => { ids.push(f + '/' + m); labels.push(MSHORT[m] + (MORACLE[m] ? ' *' : '')); parents.push(f); values.push(cnt[m]); colors.push(MCOL[m]); });
        });
        return { data: [{ type: 'sunburst', ids, labels, parents, values, branchvalues: 'total', marker: { colors, line: { color: '#fff', width: 2 } }, insidetextorientation: 'radial', textfont: { size: 11.5 }, hovertemplate: '%{label}: best in %{value} setting(s)<extra></extra>' }], layout: layout({ margin: { l: 4, r: 4, t: 4, b: 4 } }), table: { head: ['family / recipe', 'settings won'], rows: ids.map((id, i) => [id, values[i]]) } };
      }
    });
    Ch.makeCard(host('g-methods'), {
      title: 'Mixing triangle: where each pixel lands (ternary plot)', height: 480,
      note: 'Every pixel is a mixture of three things: fat droplets, nucleus, and everything else, so it sits somewhere inside a triangle. Hollow dots = truth, filled dots = rebuilt, a line joins each pair. Short lines mean the molecule mix was recovered. <b>* knows the spectra.</b>',
      controls: [{ key: 'm', label: 'Recipe', type: 'select', value: 'smooth', options: Object.keys(T.ternary.recon).map(m => [m, mlabel(m)]) }],
      render(st) {
        const t = T.ternary.true, r = T.ternary.recon[st.m], a = [], b = [], c = [];
        t.forEach((p, i) => { a.push(p[0], r[i][0], null); b.push(p[1], r[i][1], null); c.push(p[2], r[i][2], null); });
        const col = MCOL[st.m];
        const data = [
          { type: 'scatterternary', mode: 'lines', a, b, c, line: { color: hexA(col, 0.35), width: 1 }, hoverinfo: 'skip', name: 'error', showlegend: true },
          { type: 'scatterternary', mode: 'markers', a: t.map(p => p[0]), b: t.map(p => p[1]), c: t.map(p => p[2]), name: 'truth', marker: { size: 7, color: '#ffffff', line: { color: C.ink, width: 1.5 } }, hovertemplate: 'truth<br>droplets %{a:.2f}<br>nucleus %{b:.2f}<br>other %{c:.2f}<extra></extra>' },
          { type: 'scatterternary', mode: 'markers', a: r.map(p => p[0]), b: r.map(p => p[1]), c: r.map(p => p[2]), name: 'rebuilt: ' + MSHORT[st.m], marker: { size: 7, color: col, line: { color: '#fff', width: 1 } }, hovertemplate: 'rebuilt<br>droplets %{a:.2f}<br>nucleus %{b:.2f}<br>other %{c:.2f}<extra></extra>' }];
        const tx = tt => ({ title: { text: tt, font: { size: 12, color: C.ink } }, min: 0, linecolor: C.line, gridcolor: C.grid, tickfont: { size: 10, color: C.ink2 } });
        const dist = t.map((p, i) => Math.hypot(p[0] - r[i][0], p[1] - r[i][1], p[2] - r[i][2]));
        return { data, layout: layout({ margin: { l: 40, r: 40, t: 20, b: 60 }, ternary: { sum: 1, aaxis: tx('fat droplets'), baxis: tx('nucleus'), caxis: tx('everything else'), bgcolor: '#fff' }, legend: { orientation: 'h', y: -0.1 } }),
          table: { head: ['statistic', 'value'], rows: [['pixels shown', t.length], ['mean mix error', dist.reduce((x, y) => x + y, 0) / dist.length], ['median mix error', dist.slice().sort((x, y) => x - y)[Math.floor(dist.length / 2)]]] } };
      }
    });
    Ch.makeCard(host('g-methods'), {
      title: 'Peak heights: rebuilt vs real', height: 480,
      note: 'Each dot is a pixel. On the diagonal = peak height recovered exactly; below = underestimated (the usual blurring); above = overestimated (noise). Four marker peaks of cell molecules. <b>* knows the spectra.</b>',
      controls: [{ key: 'm', label: 'Recipe', type: 'select', value: 'smooth', options: Object.keys(T.peaks.recon).map(m => [m, mlabel(m)]) }],
      render(st) {
        const dom = domains(2, 2, 0.12, 0.16), data = [], lay = { margin: { l: 44, r: 10, t: 24, b: 40 }, showlegend: false, annotations: [] }, col = MCOL[st.m], rows = [];
        T.peaks.bands.forEach((bw, bi) => {
          const n = bi + 1, xs = T.peaks.true.map(p => p[bi]), ys = T.peaks.recon[st.m].map(p => p[bi]), mx = Math.max(...xs, ...ys) * 1.05;
          data.push({ type: 'scatter', mode: 'lines', x: [0, mx], y: [0, mx], xaxis: 'x' + A(n), yaxis: 'y' + A(n), line: { color: C.muted, width: 1, dash: 'dash' }, hoverinfo: 'skip' });
          data.push({ type: 'scatter', mode: 'markers', x: xs, y: ys, xaxis: 'x' + A(n), yaxis: 'y' + A(n), marker: { size: 6, color: col, opacity: 0.55, line: { color: '#fff', width: 0.5 } }, hovertemplate: 'real %{x:.2f}<br>rebuilt %{y:.2f}<extra>' + bw + ' cm⁻¹</extra>' });
          lay['xaxis' + A(n)] = ax({ domain: dom[bi].x, anchor: 'y' + A(n), range: [0, mx], title: title('real') }); lay['yaxis' + A(n)] = ax({ domain: dom[bi].y, anchor: 'x' + A(n), range: [0, mx], title: title('rebuilt') });
          lay.annotations.push({ text: '<b>' + bw + ' cm⁻¹</b>', x: dom[bi].x[0], y: dom[bi].y[1] + 0.01, xref: 'paper', yref: 'paper', xanchor: 'left', yanchor: 'bottom', showarrow: false, font: { size: 12.5, color: C.ink } });
          const sl = ys.reduce((a, v, i) => a + v * xs[i], 0) / Math.max(xs.reduce((a, v) => a + v * v, 0), 1e-9); rows.push([bw, sl]);
        });
        return { data, layout: layout(lay), table: { head: ['band (cm⁻¹)', 'height ratio rebuilt/real'], rows } };
      }
    });
    Ch.makeCard(host('g-methods'), {
      title: 'Spectra at four spots', wide: true, height: 520,
      note: 'The fingerprint at one pixel of each tissue part. Black = real. Pick two recipes to overlay (the second is dashed).',
      controls: [{ key: 'a', label: 'Recipe A', type: 'select', value: 'smooth', options: mm.map(m => [m, mlabel(m)]) }, { key: 'b', label: 'Recipe B', type: 'select', value: 'proj_known', options: [['none', 'none']].concat(mm.map(m => [m, mlabel(m)])) }],
      render(st) {
        const dom = domains(2, 2, 0.08, 0.16), data = [], lay = { margin: { l: 48, r: 10, t: 26, b: 70 }, annotations: [], legend: { orientation: 'h', y: -0.14 } }, rows = [];
        T.spectra.forEach((s, i) => {
          const n = i + 1, add = (y, name, col, dash, w, key) => data.push({ type: 'scatter', mode: 'lines', x: M.wn, y, xaxis: 'x' + A(n), yaxis: 'y' + A(n), name, legendgroup: key, showlegend: i === 0, line: { color: col, width: w, dash }, hovertemplate: '%{x:.0f} cm⁻¹: %{y:.3f}<extra>' + name + '</extra>' });
          add(s.true, 'real', C.ink, 'solid', 2, 'real'); add(s.recon[st.a], mlabel(st.a), MCOL[st.a], 'solid', 2, 'a'); if (st.b !== 'none') add(s.recon[st.b], mlabel(st.b), MCOL[st.b], 'dash', 2, 'b');
          lay['xaxis' + A(n)] = ax({ domain: dom[i].x, anchor: 'y' + A(n), title: title('wavenumber (cm⁻¹)') }); lay['yaxis' + A(n)] = ax({ domain: dom[i].y, anchor: 'x' + A(n), title: title('intensity') });
          lay.annotations.push({ text: '<b>' + s.name + '</b> at pixel (' + s.xy[0] + ', ' + s.xy[1] + ')', x: dom[i].x[0], y: dom[i].y[1] + 0.01, xref: 'paper', yref: 'paper', xanchor: 'left', yanchor: 'bottom', showarrow: false, font: { size: 12.5, color: C.ink } });
          const e = k => Math.sqrt(s.true.reduce((a, v, j) => a + Math.pow(s.recon[k][j] - v, 2), 0) / s.true.reduce((a, v) => a + v * v, 1e-12)); rows.push([s.name, e(st.a), st.b === 'none' ? null : e(st.b)]);
        });
        return { data, layout: layout(lay), table: { head: ['pixel', 'error A', 'error B'], rows } };
      }
    });
    Ch.makeCard(host('g-methods'), {
      title: 'Recipe × condition matrix', wide: true, height: 380,
      note: 'Every recipe in every tested condition for one pattern family. Columns are (patterns K · light).',
      controls: [{ key: 'f', label: 'Patterns', type: 'select', value: mDef.f, options: famOpts(mf) }, { key: 'metric', label: 'Measure', type: 'select', value: 'nrmse', options: metricOpts }],
      render(st) {
        const cols = []; mKs.forEach(k => mDl.forEach(d => cols.push([k, d])));
        const z = mm.map(m => cols.map(([k, d]) => cell(st.metric, st.f, m, k, d)));
        return { data: [{ type: 'heatmap', z, x: cols.map(([k, d]) => 'K=' + k + ' · 10^' + d), y: mm.map(m => MSHORT[m] + (MORACLE[m] ? ' *' : '')), colorscale: scaleFor(st.metric), text: z.map(r => r.map(v => mText(st.metric, v))), texttemplate: '%{text}', xgap: 2, ygap: 2, colorbar: { thickness: 10, outlinewidth: 0, tickfont: { size: 11 } }, hovertemplate: '%{y}<br>%{x}: %{text}<extra></extra>' }],
          layout: layout({ margin: { l: 120, r: 10, t: 6, b: 70 }, xaxis: ax({ showgrid: false, tickangle: -35 }), yaxis: ax({ autorange: 'reversed', showgrid: false }) }), table: { head: ['recipe', ...cols.map(([k, d]) => 'K=' + k + ' · 10^' + d)], rows: mm.map((m, i) => [mlabel(m), ...z[i]]) } };
      }
    });

    // =============================================================== TRUST
    const bvK = Object.keys(T.biasvar[fams[0]]), bvD = Object.keys(T.biasvar[fams[0]][bvK[0]]);
    const bvDef = bvD.reduce((a, b) => Math.abs(+b - 1.5) < Math.abs(+a - 1.5) ? b : a);
    Ch.makeCard(host('g-trust'), {
      title: 'Bias vs variance: wrong in a steady way, or wobbly?', wide: true, height: 460,
      note: 'Repeating one experiment with fresh noise splits the error in two. <b>Bias</b> = the average answer is off (the patterns cannot see the detail). <b>Variance</b> = the answer changes each time (noise). Dashed lines mark equal total error. Bubble size = number of patterns K.',
      controls: [{ key: 'd', label: 'Light', type: 'select', value: bvDef, options: bvD.map(d => [d, lightLabel(d)]) }],
      render(st) {
        const data = [], pts = []; let lo = 1e9, hi = 0;
        fams.forEach(f => { const xs = [], ys = [], sz = [], tx = []; bvK.forEach(k => { const v = T.biasvar[f][k] && T.biasvar[f][k][st.d]; if (!v) return; xs.push(Math.max(v.bias2, 1e-5)); ys.push(Math.max(v.var, 1e-5)); sz.push(8 + 3 * Math.log2(+k)); tx.push('K=' + k); lo = Math.min(lo, v.bias2, v.var); hi = Math.max(hi, v.bias2, v.var); pts.push([flab(f), +k, v.bias2, v.var]); });
          data.push({ type: 'scatter', mode: 'markers', x: xs, y: ys, text: tx, name: SHORT[f], legendgroup: GROUP[f], marker: { size: sz, symbol: FSTYLE[f].symbol, color: hexA(fcol(f), 0.85), line: { color: '#fff', width: 2 } }, hovertemplate: SHORT[f] + ' %{text}<br>bias² %{x:.4f}<br>variance %{y:.4f}<extra></extra>' }); });
        lo = Math.max(lo / 2, 1e-5); hi = hi * 2;
        const lines = [0.01, 0.03, 0.1, 0.3, 1].filter(c => c < hi * 2).map(c => { const xs = [], ys = []; for (let s = -8; s <= 8; s += 0.25) { const t = 1 / (1 + Math.exp(-s)); xs.push(c * t); ys.push(c * (1 - t)); } return { type: 'scatter', mode: 'lines', x: xs, y: ys, line: { color: C.muted, width: 1, dash: 'dot' }, hoverinfo: 'skip', showlegend: false }; });
        const ann = [0.01, 0.03, 0.1, 0.3, 1].filter(c => c / 2 > lo && c / 2 < hi).map(c => ({ x: Math.log10(c / 2), y: Math.log10(c / 2), text: 'total ' + c, showarrow: false, font: { size: 10, color: C.muted }, xshift: 22, yshift: 12 }));
        ann.push({ xref: 'paper', yref: 'paper', x: 0.99, y: 0.02, xanchor: 'right', text: 'mostly bias: the patterns miss detail', showarrow: false, font: { size: 11.5, color: C.ink2 } }, { xref: 'paper', yref: 'paper', x: 0.01, y: 0.98, xanchor: 'left', yanchor: 'top', text: 'mostly noise: answer wobbles', showarrow: false, font: { size: 11.5, color: C.ink2 } });
        return { data: lines.concat(data), layout: layout({ xaxis: ax({ type: 'log', range: [Math.log10(lo), Math.log10(hi)], title: title('bias² (steady error, log scale)') }), yaxis: ax({ type: 'log', range: [Math.log10(lo), Math.log10(hi)], title: title('variance (wobble, log scale)') }), annotations: ann, legend: { orientation: 'h', y: -0.24 } }), table: { head: ['family', 'K', 'bias²', 'variance'], rows: pts } };
      }
    });
    const cdK = Object.keys(T.candle[fams[0]]), cdD = Object.keys(T.candle[fams[0]][cdK[0]]);
    Ch.makeCard(host('g-trust'), {
      title: 'Spread over repeated noise: boxes', height: 460,
      note: 'The same measurement repeated with fresh noise. Box = middle half of the repeats, whiskers = best and worst repeat. Narrow boxes mean a dependable pattern family.',
      controls: [{ key: 'k', label: 'K', type: 'select', value: cdK.includes('16') ? '16' : cdK[0], options: cdK.map(k => [k, k]) }, { key: 'd', label: 'Light', type: 'select', value: bvDef, options: cdD.map(d => [d, lightLabel(d)]) }],
      render(st) {
        const rows = fams.map(f => ({ f, v: T.candle[f][st.k] && T.candle[f][st.k][st.d] })).filter(r => r.v).sort((a, b) => a.v[2] - b.v[2]);
        const data = rows.map(r => ({ type: 'box', orientation: 'h', name: SHORT[r.f], y: [SHORT[r.f]], lowerfence: [r.v[0]], q1: [r.v[1]], median: [r.v[2]], q3: [r.v[3]], upperfence: [r.v[4]], line: { color: fcol(r.f), width: 2 }, fillcolor: hexA(fcol(r.f), 0.28), showlegend: false, hovertemplate: SHORT[r.f] + '<br>best %{lowerfence:.3f}<br>median %{median:.3f}<br>worst %{upperfence:.3f}<extra></extra>' }));
        return { data, layout: layout({ margin: { l: 130, r: 12, t: 6, b: 44 }, xaxis: ax({ title: title('overall mistake') }), yaxis: ax({ autorange: 'reversed', showgrid: false }) }), table: { head: ['family', 'best', '25%', 'median', '75%', 'worst'], rows: rows.map(r => [SHORT[r.f], ...r.v]) } };
      }
    });
    const svK = Object.keys(T.svd[fams[0]]);
    Ch.makeCard(host('g-trust'), {
      title: 'How fragile is the code? Singular values', wide: true, height: 420,
      note: 'Left: the strengths of the independent directions that a pattern set measures (singular values, scaled so the best is 1). A steep drop means some details are almost invisible to the camera. Right: condition number (largest ÷ smallest strength). Small = robust to noise, huge = fragile. Orthogonal sets such as Hadamard score 1.',
      controls: [{ key: 'k', label: 'K', type: 'select', value: svK.includes('16') ? '16' : svK[0], options: svK.map(k => [k, k]) }],
      render(st) {
        const data = [], dom = [[0, 0.62], [0.72, 1]];
        fams.forEach(f => { const s = T.svd[f][st.k].s; data.push({ type: 'scatter', mode: 'lines', x: s.map((_, i) => i + 1), y: s.map(v => v > 1e-6 ? v : null), name: SHORT[f], legendgroup: GROUP[f], line: { color: fcol(f), width: 2, dash: FSTYLE[f].dash }, xaxis: 'x', yaxis: 'y', hovertemplate: SHORT[f] + '<br>direction %{x}: %{y:.3f}<extra></extra>' }); });
        const order = fams.slice().sort((a, b) => Math.log(T.svd[a][st.k].cond) - Math.log(T.svd[b][st.k].cond));
        data.push({ type: 'bar', orientation: 'h', y: order.map(f => SHORT[f]), x: order.map(f => Math.log10(T.svd[f][st.k].cond)), marker: { color: order.map(f => fcol(f)), line: { color: '#fff', width: 2 } }, width: 0.14, xaxis: 'x2', yaxis: 'y2', showlegend: false, customdata: order.map(f => T.svd[f][st.k].cond), hovertemplate: '%{y}<br>condition number %{customdata:.3g}<extra></extra>' });
        data.push({ type: 'scatter', mode: 'markers', y: order.map(f => SHORT[f]), x: order.map(f => Math.log10(T.svd[f][st.k].cond)), marker: { size: 10, color: order.map(f => fcol(f)), line: { color: '#fff', width: 2 } }, xaxis: 'x2', yaxis: 'y2', showlegend: false, hoverinfo: 'skip' });
        return { data, layout: layout({ margin: { l: 52, r: 10, t: 10, b: 70 }, xaxis: ax({ domain: dom[0], anchor: 'y', title: title('direction number (strongest first)') }), yaxis: ax({ type: 'log', range: [-5.5, 0.15], anchor: 'x', title: title('relative strength (log)') }), xaxis2: ax({ domain: dom[1], anchor: 'y2', title: title('log10 condition number') }), yaxis2: ax({ anchor: 'x2', autorange: 'reversed', showgrid: false, side: 'left', tickfont: { size: 10.5 } }), legend: { orientation: 'h', y: -0.3 } }), table: { head: ['family', 'condition number', 'rank'], rows: fams.map(f => [SHORT[f], T.svd[f][st.k].cond, T.svd[f][st.k].rank]) } };
      }
    });
    const foK = Object.keys(T.fourier[fams[0]]), fr = M.freq;
    Ch.makeCard(host('g-trust'), {
      title: 'Which fine detail survives? (detail wheel)', height: 460,
      note: 'Going round the half-circle goes from broad blobs (left) to the finest 1-pixel detail (right). Distance from the centre = how much of that detail was recovered (1 = all, 0 = none). A wheel that stays full all the way round keeps fine structure.',
      controls: [{ key: 'k', label: 'K', type: 'select', value: foK.includes('16') ? '16' : foK[0], options: foK.map(k => [k, k]) }, { key: 'a', label: 'A', type: 'select', value: 'hadamard_var', options: famOpts(fams) }, { key: 'b', label: 'B', type: 'select', value: 'raster_skip', options: famOpts(fams) }, { key: 'c', label: 'C', type: 'select', value: 'slide_opt', options: famOpts(fams) }],
      render(st) {
        const data = [st.a, st.b, st.c].map((f, i) => { const v = T.fourier[f][st.k].map(x => Math.max(0, Math.min(1.1, x))); return { type: 'scatterpolar', mode: 'lines', r: v, theta: fr.map(q => 180 - q * 360), fill: 'toself', fillcolor: hexA(fcol(f), 0.1), name: SHORT[f], line: { color: fcol(f), width: 2, dash: i === 0 ? 'solid' : (i === 1 ? 'dash' : 'dot') }, hovertemplate: 'recovered: %{r:.2f}<extra>' + SHORT[f] + '</extra>' }; });
        return { data, layout: layout({ margin: { l: 40, r: 40, t: 10, b: 60 }, polar: { sector: [0, 180], radialaxis: { range: [0, 1.1], gridcolor: C.grid, linecolor: C.line, tickfont: { size: 10 }, angle: 90 }, angularaxis: { tickvals: [0, 45, 90, 135, 180], ticktext: ['2-pixel detail', '', '4-pixel detail', '', 'broad blobs'], gridcolor: C.grid, linecolor: C.line, tickfont: { size: 11, color: C.ink } }, bgcolor: '#fff' }, legend: { orientation: 'h', y: -0.05 } }),
          table: { head: ['spatial frequency (cycles/pixel)', SHORT[st.a], SHORT[st.b], SHORT[st.c]], rows: fr.map((q, i) => [q, T.fourier[st.a][st.k][i], T.fourier[st.b][st.k][i], T.fourier[st.c][st.k][i]]) } };
      }
    });

    // =============================================================== MOTION
    const mo = T.motion, moK = Object.keys(mo.curves[mo.fams[0]]);
    Ch.makeCard(host('g-motion'), {
      title: 'Cost of a shaky sample', wide: true, height: 420,
      note: 'Overall mistake against how far the sample wobbles between shots (in pixels). Solid = the solver knows the movement, dashed = it assumes the sample stood still. The shaded band is the 10–90% range of the repeats for the chosen family.',
      controls: [{ key: 'k', label: 'K', type: 'select', value: moK[0], options: moK.map(k => [k, k]) }, { key: 'f', label: 'Shade family', type: 'select', value: mo.fams[0], options: famOpts(mo.fams) }],
      render(st) {
        const data = [], sg = mo.sigmas;
        mo.fams.forEach(f => { const cv = mo.curves[f][st.k]; ['informed', 'ignorant'].forEach(kind => { const a = cv[kind];
          if (f === st.f) { data.push({ type: 'scatter', mode: 'lines', x: sg.concat(sg.slice().reverse()), y: a.map(r => r[2]).concat(a.map(r => r[1]).reverse()), fill: 'toself', fillcolor: hexA(fcol(f), 0.12), line: { width: 0 }, hoverinfo: 'skip', showlegend: false }); }
          data.push({ type: 'scatter', mode: 'lines+markers', x: sg, y: a.map(r => r[0]), name: SHORT[f] + (kind === 'informed' ? ' (knows motion)' : ' (unaware)'), legendgroup: f, line: { color: fcol(f), width: 2, dash: kind === 'informed' ? 'solid' : 'dash' }, marker: { size: 8, symbol: kind === 'informed' ? FSTYLE[f].symbol : FSTYLE[f].symbol + '-open', color: fcol(f), line: { color: fcol(f), width: 2 } }, hovertemplate: SHORT[f] + '<br>jitter %{x} px: %{y:.3f}<extra>' + (kind === 'informed' ? 'solver knows' : 'solver unaware') + '</extra>' }); }); });
        return { data, layout: layout({ xaxis: ax({ title: title('sample jitter between shots (pixels)') }), yaxis: ax({ title: title('overall mistake') }), legend: { orientation: 'h', y: -0.3, font: { size: 10.5 } } }),
          table: { head: ['family', 'solver', ...sg.map(s => 'jitter ' + s)], rows: mo.fams.flatMap(f => ['informed', 'ignorant'].map(k => [SHORT[f], k, ...mo.curves[f][st.k][k].map(r => r[0])])) } };
      }
    });
    Ch.makeCard(host('g-motion'), {
      title: 'Knowing the motion pays: dumbbells', height: 380,
      note: 'For each family: blue dot = mistake when the solver knows the motion, orange ring = when it does not. A long bar means ignoring movement is expensive; a very short bar means that design shrugs it off.',
      controls: [{ key: 'k', label: 'K', type: 'select', value: moK[0], options: moK.map(k => [k, k]) }, { key: 's', label: 'Jitter (px)', type: 'select', value: mo.sigmas[mo.sigmas.length - 1], options: mo.sigmas.filter(s => s > 0).map(s => [s, s]) }],
      render(st) {
        const si = mo.sigmas.indexOf(st.s), rows = mo.fams.map(f => ({ f, a: mo.curves[f][st.k].informed[si][0], b: mo.curves[f][st.k].ignorant[si][0] })).sort((x, y) => (y.b - y.a) - (x.b - x.a));
        const data = [{ type: 'scatter', mode: 'lines', x: [].concat(...rows.map(r => [r.a, r.b, null])), y: [].concat(...rows.map(r => [SHORT[r.f], SHORT[r.f], null])), line: { color: '#b7c4d1', width: 4 }, hoverinfo: 'skip', showlegend: false },
          { type: 'scatter', mode: 'markers', x: rows.map(r => r.a), y: rows.map(r => SHORT[r.f]), name: 'solver knows the motion', marker: { size: 12, color: '#2a78d6', line: { color: '#fff', width: 2 } }, hovertemplate: '%{y}<br>knows motion: %{x:.3f}<extra></extra>' },
          { type: 'scatter', mode: 'markers', x: rows.map(r => r.b), y: rows.map(r => SHORT[r.f]), name: 'solver unaware', marker: { size: 12, color: '#ffffff', line: { color: '#eb6834', width: 3 } }, hovertemplate: '%{y}<br>unaware: %{x:.3f}<extra></extra>' }];
        return { data, layout: layout({ margin: { l: 120, r: 12, t: 6, b: 70 }, xaxis: ax({ title: title('overall mistake') }), yaxis: ax({ autorange: 'reversed', showgrid: false }), legend: { orientation: 'h', y: -0.25 } }), table: { head: ['family', 'knows motion', 'unaware', 'extra mistake'], rows: rows.map(r => [SHORT[r.f], r.a, r.b, r.b - r.a]) } };
      }
    });
    const rb = T.robust;
    const rbRows = rb.train_dlogs.map(d => 'trained at 10^' + d).concat(['trained on a range']);
    Ch.makeCard(host('g-motion'), {
      title: 'Does a learned decoder generalise?', height: 380,
      note: 'A small neural network is trained at one light level (rows) and then used at other light levels (columns). The diagonal is “the same conditions as training”. Off-diagonal cells show how fast it breaks when the world changes; the last row was trained on a mix of light levels.',
      render() {
        const z = rb.matrix.map(r => r.map(v => Math.min(v, 2.5))), text = rb.matrix.map(r => r.map(v => v.toFixed(2)));
        const sh = rb.train_dlogs.map((d, i) => { const j = rb.test_dlogs.findIndex(t => Math.abs(t - d) < 0.76); return j < 0 ? null : { type: 'rect', xref: 'x', yref: 'y', x0: j - 0.5, x1: j + 0.5, y0: i - 0.5, y1: i + 0.5, line: { color: C.ink, width: 2 } }; }).filter(Boolean);
        return { data: [{ type: 'heatmap', z, x: rb.test_dlogs.map(d => '10^' + d), y: rbRows, text, texttemplate: '%{text}', colorscale: SC_ORANGE, zmin: 0, zmax: 2.5, xgap: 2, ygap: 2, showscale: false, hovertemplate: '%{y}, tested at %{x}<br>mistake %{text}<extra></extra>' }],
          layout: layout({ margin: { l: 130, r: 10, t: 6, b: 50 }, xaxis: ax({ showgrid: false, title: title('tested at this light level (photons)') }), yaxis: ax({ autorange: 'reversed', showgrid: false }), shapes: sh }), table: { head: ['training', ...rb.test_dlogs.map(d => 'test 10^' + d)], rows: rb.matrix.map((r, i) => [rbRows[i], ...r]) } };
      }
    });
    if (rb.cross) {
      const cr = rb.cross;
      Ch.makeCard(host('g-motion'), {
        title: 'Phantom to real cell: a different world', height: 340,
        note: 'Methods that were tuned on computer-drawn cells, applied to a real cell. If the mistake jumps, the simulation was too easy.',
        render() { const z = cr.nrmse, text = z.map(r => r.map(v => v.toFixed(2))); return { data: [{ type: 'heatmap', z, x: cr.methods.map(m => MSHORT[m]), y: cr.sample_names, text, texttemplate: '%{text}', colorscale: SC_ORANGE, xgap: 2, ygap: 2, showscale: false }], layout: layout({ margin: { l: 150, r: 10, t: 6, b: 50 }, xaxis: ax({ showgrid: false }), yaxis: ax({ autorange: 'reversed', showgrid: false }) }), table: { head: ['sample', ...cr.methods.map(m => MSHORT[m])], rows: z.map((r, i) => [cr.sample_names[i], ...r]) } }; }
      });
    }

    // =============================================================== NOISE
    const cal = T.calib;
    Ch.makeCard(host('g-noise'), {
      title: 'Noise grows with brightness: the camera calibration', wide: true, height: 420,
      note: 'Each grey dot is one spectral bin of repeated photographs: x = average counts, y = how much the counts fluctuate (variance). The straight line is the fitted model. Its slope is the camera <b>gain</b> (' + cal.gain.toFixed(2) + ' counts per photon) and where it meets zero brightness gives the <b>read noise</b> (' + cal.read_noise_counts.toFixed(1) + ' counts, about ' + cal.read_noise_photons.toFixed(1) + ' photon-equivalents). Source: ' + Ch.esc(cal.source) + '.',
      render() {
        const sc = cal.scatter, xs = sc.map(p => p[0]), ys = sc.map(p => p[1]); const xm = Math.max(...cal.var_mean_bins.map(p => p[0])) * 1.05, x0 = Math.min(...xs);
        const xs0 = Math.max(x0, -cal.intercept / cal.gain + 0.5), fitX = []; for (let i = 0; i <= 60; i++) fitX.push(xs0 * Math.pow(xm / xs0, i / 60));
        const data = [
          { type: 'scatter', mode: 'markers', x: xs, y: ys, name: 'spectral bins', marker: { size: 4, color: 'rgba(111,128,148,0.35)' }, hovertemplate: 'mean %{x:.0f}<br>variance %{y:.0f}<extra>one bin</extra>' },
          { type: 'scatter', mode: 'lines+markers', x: cal.var_mean_bins.map(p => p[0]), y: cal.var_mean_bins.map(p => p[1]), name: 'brightness-bin averages', line: { color: '#2a78d6', width: 2 }, marker: { size: 8, color: '#2a78d6', line: { color: '#fff', width: 1.5 } }, hovertemplate: 'mean %{x:.0f}<br>variance %{y:.0f}<extra>average of bins</extra>' },
          { type: 'scatter', mode: 'lines', x: fitX, y: fitX.map(v => cal.gain * v + cal.intercept), name: 'fitted model', line: { color: '#eb6834', width: 2, dash: 'dash' }, hoverinfo: 'skip' }];
        return { data, layout: layout({ xaxis: ax({ type: 'log', title: title('average counts (log scale)') }), yaxis: ax({ type: 'log', title: title('variance of counts (log scale)') }), legend: { orientation: 'h', y: -0.22 } }), table: { head: ['quantity', 'value'], rows: [['gain (counts per photon)', cal.gain], ['read noise (counts)', cal.read_noise_counts], ['read noise (photon-equivalents)', cal.read_noise_photons], ['dark offset (counts)', cal.offset], ['straight-line fit quality (correlation)', cal.corr], ['saturated fraction', cal.saturated_fraction]] } };
      }
    });
    Ch.makeCard(host('g-noise'), {
      title: 'Is the camera linear? Light ladder', height: 380,
      note: 'The scene was photographed through filters that dim it by known amounts. If measured brightness follows the expected brightness on the diagonal, the camera responds proportionally and the simple noise model is safe.',
      render() {
        const o = cal.od_ladder; const lo = Math.min(...o.map(r => r.nominal_ratio_vs_od03)) / 1.5, hi = Math.max(...o.map(r => r.nominal_ratio_vs_od03)) * 1.5;
        return { data: [{ type: 'scatter', mode: 'lines', x: [lo, hi], y: [lo, hi], line: { color: C.muted, width: 1, dash: 'dash' }, name: 'perfectly proportional', hoverinfo: 'skip' }, { type: 'scatter', mode: 'markers+text', x: o.map(r => r.nominal_ratio_vs_od03), y: o.map(r => r.measured_ratio_vs_od03), text: o.map(r => 'OD ' + r.od), textposition: 'top left', textfont: { size: 11, color: C.ink2 }, name: 'measured', marker: { size: 11, color: '#2a78d6', line: { color: '#fff', width: 2 } }, hovertemplate: 'filter OD %{text}<br>expected ×%{x:.2f}, measured ×%{y:.2f}<extra></extra>' }],
          layout: layout({ xaxis: ax({ type: 'log', title: title('expected brightness (relative to the OD 0.3 photo)') }), yaxis: ax({ type: 'log', title: title('measured brightness (relative)') }), legend: { orientation: 'h', y: -0.25 } }), table: { head: ['filter (OD)', 'expected ratio', 'measured ratio', 'saturated'], rows: o.map(r => [r.od, r.nominal_ratio_vs_od03, r.measured_ratio_vs_od03, r.saturated]) } };
      }
    });
    Ch.makeCard(host('g-noise'), {
      title: 'The light source seen by the camera', height: 380,
      note: 'Average counts across the camera\'s wavelength axis (nanometres). The source is dim at the edges, which is why some spectral bins are much noisier than others. This is a visible-light instrument, so it informs the noise only, not the Raman spectra.',
      render() { return { data: [{ type: 'scatter', mode: 'lines', x: cal.spectrum_nm, y: cal.spectrum_counts, fill: 'tozeroy', fillcolor: 'rgba(42,120,214,0.18)', line: { color: '#2a78d6', width: 2 }, hovertemplate: '%{x:.0f} nm: %{y:.2f}<extra></extra>', name: 'counts' }], layout: layout({ showlegend: false, xaxis: ax({ title: title('wavelength (nm)') }), yaxis: ax({ title: title('average counts above dark level') }) }), table: { head: ['wavelength (nm)', 'counts'], rows: cal.spectrum_nm.map((w, i) => [w, cal.spectrum_counts[i]]) } }; }
    });

    glossary(M);
  };

  // ------------------------------------------------------------------ glossary and honesty box
  function glossary(M) {
    const G = [
      ['Raman scattering', 'When light hits a molecule, a tiny part comes back with a slightly changed colour. The change depends on how that molecule vibrates, so it works like a fingerprint.'],
      ['Spectrum', 'The fingerprint itself: how much light comes back at each colour change.'],
      ['Wavenumber / Raman shift (cm⁻¹)', 'The unit of the colour change. Each peak in the spectrum sits at a wavenumber that belongs to a molecular bond.'],
      ['Hyperspectral cube', 'An image where every pixel carries a whole spectrum: two directions of picture plus one direction of colour.'],
      ['Pixel column', 'One vertical line of the image. The light patterns only vary from column to column; the camera sees the vertical direction and the colours directly.'],
      ['Light pattern / mask', 'A black-and-white stencil shown on the sample; white parts light the sample, black parts do not.'],
      ['DMD (digital micromirror device)', 'A chip of tiny mirrors that can each be tilted on or off, making any stencil. Mirrors cannot make negative light, so patterns are only 0 or 1.'],
      ['Point scan (raster)', 'The classic way: look at one spot at a time and move on. Slow, because each spot gets only a slice of the time.'],
      ['Hadamard pattern', 'A tidy family of ±1 stripe patterns that do not interfere with each other. Because light cannot be negative, each one is shot twice (bright part and dark part).'],
      ['S-matrix', 'The on/off version of a Hadamard set. Half the shots, but a slightly less tidy code.'],
      ['Multiplexing (mixing)', 'Lighting many pixels in one shot, so each shot collects more light. It helps when the camera is noisy.'],
      ['Photon shot noise (Poisson noise)', 'Light arrives in random packets, so counts always fluctuate. Dimmer light means relatively larger fluctuations.'],
      ['Read noise', 'A fixed random error the camera adds to every shot, even in the dark.'],
      ['Gain', 'How many counts the camera reports for each photon.'],
      ['Reconstruction', 'The computer step that works the image back out of the measurements.'],
      ['Least squares / pseudo-inverse', 'The exact mathematical undo. Perfect without noise, but it blows noise up when the code is fragile.'],
      ['Regularisation (ridge, smooth prior)', 'Telling the solver what a sensible answer looks like (small values, or neighbouring pixels alike) so it does not chase noise.'],
      ['Total variation', 'A rule that allows sharp edges but discourages noisy wiggles.'],
      ['Known-spectra methods (marked *)', 'Recipes told the molecule fingerprints in advance. An optimistic assumption: in a real sample the molecules are not known beforehand.'],
      ['nRMSE', 'Overall mistake: size of the error divided by the size of the image. 0 = perfect.'],
      ['Spectral angle (SAM)', 'How much the shape of a rebuilt spectrum is rotated from the real one, in degrees. 0° = same shape.'],
      ['Bias and variance', 'Bias is a steady error (always off the same way). Variance is the wobble from run to run.'],
      ['Singular values / condition number', 'How strongly the patterns measure each independent direction of the image. A huge ratio between strongest and weakest means a fragile, noise-sensitive code.'],
      ['Spatial frequency', 'How fine a detail is: low frequency = broad blobs, high frequency = fine lines.'],
      ['Ternary plot', 'A triangle chart for mixtures of three parts that add up to 100%.'],
      ['Jitter', 'Small random movement of the sample between shots.'],
      ['Phantom', 'A computer-drawn stand-in for a real sample, whose true answer is known exactly.'],
      ['SPIHIM', 'A public single-pixel imaging dataset used here to measure how noisy a real camera is.']
    ];
    document.getElementById('glossary').innerHTML = G.map(g => '<div><dt>' + Charts.esc(g[0]) + '</dt><dd>' + Charts.esc(g[1]) + '</dd></div>').join('');
    document.getElementById('honest').innerHTML = '<h3>What this page does and does not show</h3><ul>' +
      '<li>The molecule spectra come from a real cell dataset; the cell layout is a computer-drawn phantom unless a real crop was added. There is no real Raman cube from a coded-light instrument here.</li>' +
      '<li>Camera noise was measured on a visible-light single-pixel imaging dataset. It sets the size and shape of the noise, not the Raman signal.</li>' +
      '<li>Methods marked * assume the molecule spectra are known. That is optimistic; treat them as an upper bound.</li>' +
      '<li>The “sliding mask” families are our reading of how moving the sample could act as the code. They are a hypothesis, not a reproduction of any published system.</li>' +
      '<li>Total time is fixed: one full point scan of 64 columns is the reference budget, so more patterns means less light for each.</li>' +
      '<li>Recipe settings were tuned on one validation cell and scored on a few test cells. Spreads show noise repeats only, not differences between cells.</li>' +
      '<li>The live lab uses the same maths as the notebook for the four recipes it offers. The neural network, total variation and the known-spectra unmixing run only in the notebook, so they appear in the charts but not in the live lab.</li>' +
      '<li>The regularisation rule uses the true average brightness per column. In a real experiment that would be estimated from the data.</li></ul>';
  }
})();
