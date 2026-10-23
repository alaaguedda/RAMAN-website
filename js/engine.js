/* Live engine: simulates the Raman "light-pattern camera" in the browser.
   Model (same as the Colab notebook):  y = Cm . ( Poisson(s . P . F) + read noise ) / s ,  reconstruction  F^ = max(0, (A'A + lambda Q)^-1 A' y)
   F = hyperspectral cube (x, y, wavenumber); P = on/off light patterns along x; A = Cm.P = effective code. */
(function (root) {
  'use strict';

  // ---------- random numbers (seeded, so a "noise draw" can be repeated) ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeGauss(rand) {
    let spare = null;
    return function () {
      if (spare !== null) { const v = spare; spare = null; return v; }
      let u = 0, v = 0;
      while (u === 0) u = rand();
      v = rand();
      const r = Math.sqrt(-2 * Math.log(u));
      spare = r * Math.sin(2 * Math.PI * v);
      return r * Math.cos(2 * Math.PI * v);
    };
  }
  function makePoisson(rand, gauss) {
    return function (lam) {
      if (lam <= 0) return 0;
      if (lam < 30) {
        const L = Math.exp(-lam); let k = 0, p = 1;
        do { k++; p *= rand(); } while (p > L);
        return k - 1;
      }
      const v = Math.round(lam + Math.sqrt(lam) * gauss());
      return v < 0 ? 0 : v;
    };
  }

  // ---------- small dense linear algebra (64 x 64 problems, float64) ----------
  function cholesky(M, n) {
    const Lm = new Float64Array(n * n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let s = M[i * n + j];
        for (let k = 0; k < j; k++) s -= Lm[i * n + k] * Lm[j * n + k];
        if (i === j) Lm[i * n + i] = Math.sqrt(Math.max(s, 1e-300));
        else Lm[i * n + j] = s / Lm[j * n + j];
      }
    }
    return Lm;
  }
  // solve (L L') X = B   (B is n x m, row-major)
  function cholSolve(Lm, n, B, m) {
    const X = new Float64Array(B);
    for (let c = 0; c < m; c++) {
      for (let i = 0; i < n; i++) {
        let s = X[i * m + c];
        for (let k = 0; k < i; k++) s -= Lm[i * n + k] * X[k * m + c];
        X[i * m + c] = s / Lm[i * n + i];
      }
      for (let i = n - 1; i >= 0; i--) {
        let s = X[i * m + c];
        for (let k = i + 1; k < n; k++) s -= Lm[k * n + i] * X[k * m + c];
        X[i * m + c] = s / Lm[i * n + i];
      }
    }
    return X;
  }

  const Engine = {
    ready: false,
    mulberry32, makeGauss,

    init(meta, patterns, tables) {
      this.meta = meta; this.pat = patterns; this.tables = tables;
      this.NX = meta.NX; this.NY = meta.NY; this.L = meta.L; this.C = meta.NY * meta.L; this.PAD = meta.pad;
      const n = this.NX;
      // smoothness prior Q = I + gamma D'D  (D = first difference along x)
      const Q = new Float64Array(n * n);
      for (let i = 0; i < n; i++) Q[i * n + i] = 1;
      for (let i = 0; i < n - 1; i++) {
        const g = meta.gamma;
        Q[i * n + i] += g; Q[(i + 1) * n + i + 1] += g; Q[i * n + i + 1] -= g; Q[(i + 1) * n + i] -= g;
      }
      this.Qsmooth = Q;
      // spectral projector onto the known library:  PROJ = Lib' G^-1 Lib  stored as (G^-1 Lib) and Lib'
      const lib = meta.lib, c = lib.length, L = this.L;
      const G = new Float64Array(c * c); let tr = 0;
      for (let i = 0; i < c; i++) for (let j = 0; j < c; j++) {
        let s = 0; for (let l = 0; l < L; l++) s += lib[i][l] * lib[j][l];
        G[i * c + j] = s; if (i === j) tr += s;
      }
      for (let i = 0; i < c; i++) G[i * c + i] += 1e-3 * tr / c;
      const Lc = cholesky(G, c);
      const Lb = new Float64Array(c * L);
      for (let i = 0; i < c; i++) for (let l = 0; l < L; l++) Lb[i * L + l] = lib[i][l];
      this.projGL = cholSolve(Lc, c, Lb, L);      // G^-1 Lib  (c x L)
      this.libF = Lb; this.nLib = c;
      this.ready = true;
    },

    setCube(u16, maxv) {
      const N = this.NX * this.NY * this.L; const F = new Float32Array(N);
      for (let i = 0; i < N; i++) F[i] = u16[i] * maxv / 65535;
      this.F = F;
      // mean over (y, wavenumber) for each x column (used by the regularisation rule)
      const cm = new Float64Array(this.NX); const C = this.C;
      for (let x = 0; x < this.NX; x++) { let s = 0; for (let c = 0; c < C; c++) s += F[x * C + c]; cm[x] = s / C; }
      this.colmean = cm;
    },

    // ----- patterns -----
    getPattern(fam, K, deltas) {
      const p = this.pat[fam][String(K)]; const W = this.NX + 2 * this.PAD; const n = p.n, NX = this.NX, PAD = this.PAD;
      const Pext = new Float32Array(n * W);
      for (let i = 0; i < n; i++) for (let j = 0; j < W; j++) Pext[i * W + j] = p.Pext[i][j];
      const P = new Float32Array(n * NX);
      if (!deltas) {
        for (let i = 0; i < n; i++) for (let x = 0; x < NX; x++) P[i * NX + x] = Pext[i * W + PAD + x];
      } else {
        for (let i = 0; i < n; i++) {
          const d = Math.max(-PAD + 1, Math.min(PAD - 1, deltas[i]));
          for (let x = 0; x < NX; x++) {
            let pos = x + PAD + d; pos = Math.max(0, Math.min(W - 1.000001, pos));
            const i0 = Math.floor(pos), f = pos - i0;
            P[i * NX + x] = (1 - f) * Pext[i * W + i0] + f * Pext[i * W + i0 + 1];
          }
        }
      }
      return { n, kind: p.kind, P, Pext, W };
    },
    combine(pat) {  // effective code A = Cm . P  and the combining rows
      const NX = this.NX, split = pat.kind === 'split'; const Kp = split ? pat.n / 2 : pat.n;
      const A = new Float64Array(Kp * NX);
      for (let k = 0; k < Kp; k++) for (let x = 0; x < NX; x++)
        A[k * NX + x] = split ? pat.P[2 * k * NX + x] - pat.P[(2 * k + 1) * NX + x] : pat.P[k * NX + x];
      return { A, Kp, split };
    },

    nearestIndex(arr, v) { let b = 0, bd = 1e99; for (let i = 0; i < arr.length; i++) { const d = Math.abs(arr[i] - v); if (d < bd) { bd = d; b = i; } } return b; },

    autoKappa(method, fam, K, dlog) {
      const key = (method === 'ridge') ? 'ridge' : 'smooth';
      try {
        const kt = this.tables.grid.kappa[key];
        const fi = this.meta.families.findIndex(f => f.id === fam);
        const ki = this.nearestIndex(this.meta.Ks, K), di = this.nearestIndex(this.meta.Dlogs, dlog);
        const v = kt[fi][ki][di]; if (v > 0) return v;
      } catch (e) { /* fall through */ }
      return 1;
    },

    /* opts: fam, K, dlog, readMult, method (ls|ridge|smooth|proj_known), kappaMult, jitter, informed, seed, noise */
    run(o) {
      const t0 = performance.now();
      const NX = this.NX, NY = this.NY, L = this.L, C = this.C;
      const rand = mulberry32((o.seed | 0) + 12345), gauss = makeGauss(rand), pois = makePoisson(rand, gauss);
      const nominal = this.getPattern(o.fam, o.K);
      let deltas = null;
      if (o.jitter > 0) { deltas = new Float64Array(nominal.n); for (let i = 0; i < nominal.n; i++) deltas[i] = gauss() * o.jitter; }
      const pm = deltas ? this.getPattern(o.fam, o.K, deltas) : nominal;       // what the sample really sees
      const code = this.combine(nominal);
      const codeTrue = deltas ? this.combine(pm) : code;
      const D = Math.pow(10, o.dlog), n = nominal.n;
      const s = D * NX / n;
      const sr = this.meta.sigma_r * (o.readMult == null ? 1 : o.readMult);
      const noise = o.noise !== false;
      // ----- measure -----
      const F = this.F; const counts = new Float32Array(n * C);
      for (let i = 0; i < n; i++) {
        const row = counts.subarray(i * C, (i + 1) * C);
        for (let x = 0; x < NX; x++) {
          const w = pm.P[i * NX + x]; if (w === 0) continue;
          const off = x * C; for (let c = 0; c < C; c++) row[c] += w * F[off + c];
        }
        for (let c = 0; c < C; c++) {
          const mu = s * row[c];
          row[c] = noise ? (pois(mu) + sr * gauss()) / s : mu / s;
        }
      }
      // combine shots (Hadamard: bright minus dark)
      const Kp = code.Kp; const y = new Float32Array(Kp * C);
      if (code.split) {
        for (let k = 0; k < Kp; k++) { const a = counts.subarray(2 * k * C, (2 * k + 1) * C), b = counts.subarray((2 * k + 1) * C, (2 * k + 2) * C), out = y.subarray(k * C, (k + 1) * C); for (let c = 0; c < C; c++) out[c] = a[c] - b[c]; }
      } else y.set(counts);
      // ----- regularisation (Wiener-style rule: noise variance / signal variance) -----
      let varsum = 0;
      for (let k = 0; k < Kp; k++) {
        let vy = 0;
        const rows = code.split ? [2 * k, 2 * k + 1] : [k];
        for (const i of rows) {
          let mu = 0; for (let x = 0; x < NX; x++) mu += nominal.P[i * NX + x] * this.colmean[x]; mu *= s;
          vy += (Math.max(mu, 0) + sr * sr) / (s * s);
        }
        varsum += vy;
      }
      const base = (varsum / Kp) / this.meta.prior_var;
      const method = o.method || 'smooth';
      let kappa = (o.kappa != null) ? o.kappa : this.autoKappa(method, o.fam, o.K, o.dlog);
      kappa *= (o.kappaMult == null ? 1 : o.kappaMult);
      let lam = kappa * base;
      let useA = o.informed ? codeTrue.A : code.A;
      let Q;
      if (method === 'ridge') { Q = new Float64Array(NX * NX); for (let i = 0; i < NX; i++) Q[i * NX + i] = 1; }
      else Q = this.Qsmooth;
      if (method === 'ls') {
        let tr = 0; for (let i = 0; i < useA.length; i++) tr += useA[i] * useA[i];
        lam = 1e-9 * tr / NX; Q = new Float64Array(NX * NX); for (let i = 0; i < NX; i++) Q[i * NX + i] = 1;
      }
      // optional spectral projection onto the known molecule spectra (needs library)
      let yy = y;
      if (method === 'proj_known') {
        const c = this.nLib, rows = Kp * NY; yy = new Float32Array(Kp * C);
        const tmp = new Float64Array(c);
        for (let r = 0; r < rows; r++) {
          const off = r * L;
          for (let j = 0; j < c; j++) { let a = 0; for (let l = 0; l < L; l++) a += y[off + l] * this.libF[j * L + l]; tmp[j] = a; }
          for (let l = 0; l < L; l++) { let a = 0; for (let j = 0; j < c; j++) a += tmp[j] * this.projGL[j * L + l]; yy[off + l] = a; }
        }
      }
      // M = A'A + lam Q ; W = M^-1 A'
      const M = new Float64Array(NX * NX);
      for (let i = 0; i < NX; i++) for (let j = 0; j <= i; j++) {
        let a = 0; for (let k = 0; k < Kp; k++) a += useA[k * NX + i] * useA[k * NX + j];
        a += lam * Q[i * NX + j]; M[i * NX + j] = a; M[j * NX + i] = a;
      }
      const At = new Float64Array(NX * Kp); for (let k = 0; k < Kp; k++) for (let x = 0; x < NX; x++) At[x * Kp + k] = useA[k * NX + x];
      const W = cholSolve(cholesky(M, NX), NX, At, Kp);
      const Fh = new Float32Array(NX * C); const clamp = method !== 'ls';
      for (let x = 0; x < NX; x++) {
        const out = Fh.subarray(x * C, (x + 1) * C);
        for (let k = 0; k < Kp; k++) { const w = W[x * Kp + k]; if (w === 0) continue; const yo = k * C; for (let c = 0; c < C; c++) out[c] += w * yy[yo + c]; }
        if (clamp) for (let c = 0; c < C; c++) if (out[c] < 0) out[c] = 0;
      }
      const res = { Fh, y, counts, A: code.A, Kp, n, s, lam, kappa, sr, photons: s * D === 0 ? 0 : s, deltas, ms: 0, nominal };
      res.metrics = this.metrics(Fh);
      res.ms = performance.now() - t0;
      return res;
    },

    metrics(Fh) {
      const NX = this.NX, NY = this.NY, L = this.L, F = this.F, N = NX * NY;
      let e2 = 0, f2 = 0; const tot = NX * NY * L;
      for (let i = 0; i < tot; i++) { const d = Fh[i] - F[i]; e2 += d * d; f2 += F[i] * F[i]; }
      const nrmse = Math.sqrt(e2 / (f2 + 1e-12));
      // spectral angle on bright pixels
      const pn = new Float64Array(N); let mx = 0;
      for (let p = 0; p < N; p++) { let a = 0; for (let l = 0; l < L; l++) a += F[p * L + l] * F[p * L + l]; pn[p] = Math.sqrt(a); if (pn[p] > mx) mx = pn[p]; }
      let sam = 0, cnt = 0;
      for (let p = 0; p < N; p++) {
        if (pn[p] <= 0.1 * mx) continue;
        let dot = 0, nb = 0; for (let l = 0; l < L; l++) { dot += F[p * L + l] * Fh[p * L + l]; nb += Fh[p * L + l] * Fh[p * L + l]; }
        const cs = dot / (pn[p] * Math.sqrt(nb) + 1e-9); sam += Math.acos(Math.max(-1, Math.min(1, cs))) * 180 / Math.PI; cnt++;
      }
      sam = cnt ? sam / cnt : NaN;
      // peak height error at the marker bands
      const rel = [];
      for (const b of this.meta.bands) {
        const l = b.idx; let t = 0; for (let p = 0; p < N; p++) t = Math.max(t, F[p * L + l]);
        const arr = []; for (let p = 0; p < N; p++) { const tv = F[p * L + l]; if (tv > 0.2 * t) arr.push(Math.abs(Fh[p * L + l] - tv) / tv); }
        if (arr.length > 5) for (const v of arr) rel.push(v);
      }
      rel.sort((a, b) => a - b);
      const peakerr = rel.length ? rel[Math.floor(rel.length / 2)] : NaN;
      return { nrmse, sam, peakerr };
    },

    // ----- helpers for the page -----
    band(cube, l) {   // image [y][x] at wavenumber index l
      const NX = this.NX, NY = this.NY, L = this.L, out = [];
      for (let y = 0; y < NY; y++) { const row = new Array(NX); for (let x = 0; x < NX; x++) row[x] = cube[(x * NY + y) * L + l]; out.push(row); }
      return out;
    },
    spectrum(cube, x, y) { const L = this.L, off = (x * this.NY + y) * L; return Array.from(cube.subarray(off, off + L)); },
    frame(counts, i) {   // camera frame for physical shot i : [y][wavenumber]
      const NY = this.NY, L = this.L, C = this.C, out = [];
      for (let y = 0; y < NY; y++) out.push(Array.from(counts.subarray(i * C + y * L, i * C + (y + 1) * L)));
      return out;
    }
  };
  root.Engine = Engine;
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
