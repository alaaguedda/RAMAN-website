/* Shared chart helpers: palette, Plotly layout defaults, and the "card" (chart + filters + table view). */
(function (root) {
  'use strict';
  const C = { ink: '#14202c', ink2: '#43546a', muted: '#6f8094', line: '#dbe3ea', grid: '#e8eef3', surface: '#ffffff' };
  const FONT = 'Bricolage Grotesque, Segoe UI, system-ui, sans-serif';

  // Colour is assigned by the entity (never by rank) and does not change when a filter removes series.
  const GROUP = { raster_skip: 'scan', raster_bin: 'scan', random_bin: 'random', hadamard_seq: 'hadamard', hadamard_var: 'hadamard', hadamard_rand: 'hadamard', s_matrix: 'hadamard', slide_mask: 'slide', slide_opt: 'slide' };
  const GCOL = { scan: '#eb6834', random: '#1baf7a', hadamard: '#2a78d6', slide: '#6250d6' };
  const GNAME = { scan: 'Point scan', random: 'Random masks', hadamard: 'Hadamard family', slide: 'Sliding mask' };
  const FSTYLE = {
    raster_skip: { dash: 'solid', symbol: 'circle' }, raster_bin: { dash: 'dash', symbol: 'square' },
    random_bin: { dash: 'solid', symbol: 'diamond' },
    hadamard_seq: { dash: 'solid', symbol: 'circle' }, hadamard_var: { dash: 'dash', symbol: 'square' },
    hadamard_rand: { dash: 'dot', symbol: 'diamond' }, s_matrix: { dash: 'dashdot', symbol: 'triangle-up' },
    slide_mask: { dash: 'solid', symbol: 'circle' }, slide_opt: { dash: 'dash', symbol: 'square' }
  };
  const SHORT = { raster_skip: 'scan, big steps', raster_bin: 'scan, wide blocks', random_bin: 'random masks', hadamard_seq: 'Hadamard coarse-fine', hadamard_var: 'Hadamard best-first', hadamard_rand: 'Hadamard random', s_matrix: 'S-matrix', slide_mask: 'slide, random', slide_opt: 'slide, designed' };
  const MCOL = { ls: '#2a78d6', ridge: '#eb6834', smooth: '#1baf7a', tv: '#eda100', proj_known: '#e87ba4', unmix_known: '#008300', lowrank_blind: '#6250d6', mlp: '#e34948' };
  const MNAME = { ls: 'Exact undo (least squares)', ridge: 'Ridge (damped)', smooth: 'Smooth prior', tv: 'Total variation', proj_known: 'Project on known spectra', unmix_known: 'Unmix known spectra', lowrank_blind: 'Low-rank (learned)', mlp: 'Neural network' };
  const MORACLE = { proj_known: true, unmix_known: true };
  const METRIC = {
    nrmse: { label: 'Overall mistake (nRMSE)', short: 'overall mistake', better: 'low', fmt: v => v.toFixed(2), plain: '0 = perfect; 1 = as wrong as an empty image' },
    sam: { label: 'Spectrum-shape mistake (angle, degrees)', short: 'spectrum angle', better: 'low', fmt: v => v.toFixed(1) + '°', plain: 'how much the colour-fingerprint is rotated; 0° = identical shape' },
    peakerr: { label: 'Peak-height mistake (relative)', short: 'peak error', better: 'low', fmt: v => (100 * v).toFixed(0) + '%', plain: 'typical error on the height of the main molecular peaks' },
    acorr: { label: 'Molecule-map match (correlation)', short: 'map match', better: 'high', fmt: v => v.toFixed(2), plain: '1 = the maps of each molecule match the truth exactly' }
  };
  const SEQ_BLUE = ['#f1f6fd', '#cfe0f8', '#9cc0f0', '#5d97e4', '#2a78d6', '#1b5199', '#0f2f5c'];
  const SEQ_ORANGE = ['#fdeee6', '#f9cfb8', '#f3a982', '#eb6834', '#c24d1f', '#8f3512', '#5c2209'];
  const DIVERGE = ['#1b5199', '#2a78d6', '#8fb8ee', '#f1f3f5', '#f2a09f', '#e34948', '#a52524'];
  const scale = arr => arr.map((c, i) => [i / (arr.length - 1), c]);
  const SC_BLUE = scale(SEQ_BLUE), SC_ORANGE = scale(SEQ_ORANGE), SC_DIV = scale(DIVERGE);

  const val = v => (v === -1 || v == null || !isFinite(v)) ? null : v;
  const fmt = (v, d = 3) => (v == null ? '–' : (+v).toFixed(d));
  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

  function ax(o) {
    return Object.assign({ gridcolor: C.grid, gridwidth: 1, zeroline: false, linecolor: C.line, ticks: 'outside', tickcolor: C.line, ticklen: 4, tickfont: { size: 11.5, color: C.ink2 }, automargin: true }, o || {});
  }
  function title(t) { return { text: t, font: { size: 12, color: C.ink2 }, standoff: 6 }; }
  function layout(o) {
    return Object.assign({
      paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: '#ffffff', font: { family: FONT, size: 12, color: C.ink2 },
      margin: { l: 56, r: 14, t: 8, b: 44 }, autosize: true,
      legend: { orientation: 'h', y: -0.22, x: 0, font: { size: 11.5, color: C.ink2 }, tracegroupgap: 2, itemsizing: 'constant' },
      hoverlabel: { bgcolor: '#ffffff', bordercolor: C.line, font: { family: FONT, size: 12, color: C.ink } },
      xaxis: ax(), yaxis: ax()
    }, o || {});
  }
  const CONFIG = { displaylogo: false, responsive: true, displayModeBar: 'hover', modeBarButtonsToRemove: ['select2d', 'lasso2d', 'autoScale2d', 'toggleSpikelines', 'hoverClosestCartesian', 'hoverCompareCartesian'] };

  // grid of subplot domains (row 0 at the top)
  function domains(rows, cols, gx, gy) {
    const out = []; const w = (1 - gx * (cols - 1)) / cols, h = (1 - gy * (rows - 1)) / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x0 = c * (w + gx), y1 = 1 - r * (h + gy);
      out.push({ x: [x0, x0 + w], y: [y1 - h, y1] });
    }
    return out;
  }

  // ------------------------------------------------------------------ card
  const cards = []; const liveCards = [];
  let io = null;
  function observer() {
    if (io || typeof IntersectionObserver === 'undefined') return io;
    io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); e.target.__card && e.target.__card.render(); } }), { rootMargin: '300px' });
    return io;
  }
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function makeCard(host, spec) {
    const root = el('article', 'card' + (spec.wide ? ' wide' : ''));
    root.appendChild(el('h3', null, esc(spec.title)));
    if (spec.note) root.appendChild(el('p', 'note', spec.note));
    const st = {};
    const fbar = el('div', 'filters');
    (spec.controls || []).forEach(c => {
      st[c.key] = c.value;
      const lab = el('label'); lab.appendChild(document.createTextNode(c.label + ' '));
      let inp;
      if (c.type === 'range') {
        inp = el('input'); inp.type = 'range'; inp.min = c.min; inp.max = c.max; inp.step = c.step; inp.value = c.value;
        const v = el('span', 'val', c.fmt ? c.fmt(c.value) : c.value);
        inp.addEventListener('input', () => { st[c.key] = parseFloat(inp.value); v.textContent = c.fmt ? c.fmt(st[c.key]) : st[c.key]; sched(); });
        lab.appendChild(inp); lab.appendChild(v);
      } else {
        inp = el('select');
        c.options.forEach(o => { const op = el('option'); op.value = o[0]; op.textContent = o[1]; if (String(o[0]) === String(c.value)) op.selected = true; inp.appendChild(op); });
        inp.addEventListener('change', () => { const o = c.options.find(o => String(o[0]) === inp.value); st[c.key] = o ? o[0] : inp.value; sched(); });
        lab.appendChild(inp);
      }
      fbar.appendChild(lab);
    });
    if (spec.controls && spec.controls.length) root.appendChild(fbar);
    const body = el('div', 'body');
    const plotbox = el('div', 'plotbox'); plotbox.style.height = (spec.height || 380) + 'px';
    const tbl = el('div', 'tbl');
    body.appendChild(plotbox); body.appendChild(tbl);
    const skel = el('div', 'skel', 'Loading chart…'); plotbox.appendChild(skel);
    root.appendChild(body);
    const foot = el('div', 'foot-row');
    const tb = el('button', 'btn ghost sm', 'Table view'); tb.type = 'button'; tb.setAttribute('aria-pressed', 'false');
    tb.addEventListener('click', () => { const on = root.classList.toggle('table-on'); tb.textContent = on ? 'Chart view' : 'Table view'; tb.setAttribute('aria-pressed', on); if (!on && api.rendered) Plotly.Plots.resize(plotbox); });
    foot.appendChild(tb); root.appendChild(foot);
    host.appendChild(root);

    let pending = false;
    function sched() { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; api.render(); }); }
    const api = {
      root, st, plotbox, rendered: false, spec,
      render() {
        let out;
        try { out = spec.render(st, api); } catch (e) { console.error(spec.title, e); plotbox.textContent = 'Could not draw this chart: ' + e.message; return; }
        if (!out) return;
        if (skel.parentNode) skel.remove();
        const lay = Object.assign({ height: spec.height || 380 }, out.layout);
        if (!api.rendered) { Plotly.newPlot(plotbox, out.data, lay, Object.assign({}, CONFIG, out.config || {})); api.rendered = true; if (spec.onReady) spec.onReady(plotbox, st, api); }
        else Plotly.react(plotbox, out.data, lay, Object.assign({}, CONFIG, out.config || {}));
        if (out.table) {
          let h = '<table><thead><tr>' + out.table.head.map(x => '<th>' + esc(x) + '</th>').join('') + '</tr></thead><tbody>';
          h += out.table.rows.map(r => '<tr>' + r.map(x => '<td>' + (x == null ? '–' : (typeof x === 'number' ? (Math.abs(x) >= 100 ? x.toFixed(0) : (+x.toPrecision(4))) : esc(x))) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
          tbl.innerHTML = h;
        }
      }
    };
    root.__card = api; cards.push(api); if (spec.live) liveCards.push(api);
    const o = observer(); if (o) o.observe(root); else api.render();
    return api;
  }

  root.Charts = {
    C, FONT, GROUP, GCOL, GNAME, FSTYLE, SHORT, MCOL, MNAME, MORACLE, METRIC, SEQ_BLUE, SEQ_ORANGE, DIVERGE, SC_BLUE, SC_ORANGE, SC_DIV,
    val, fmt, hexA, ax, title, layout, CONFIG, domains, el, esc, makeCard, cards, liveCards,
    renderAll() { cards.forEach(c => c.render()); },
    refreshLive() { liveCards.forEach(c => { if (c.rendered) c.render(); }); }
  };
})(window);
