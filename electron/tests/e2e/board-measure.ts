/* What the first screen's board measures, read off its own pixels.

   One function, run inside the window (page.evaluate takes it as it is, so
   it closes over nothing), used by tools/start-measure.ts to tune the board
   and by tests/e2e/start.e2e.ts to hold it to what it was tuned to.  Both
   therefore measure the same thing the same way, which is the only reason a
   number from one can be a threshold in the other.

   The board region is the window with the card, the title bar and the
   status bar cut out of it: what is left is the board and nothing else.  The
   two canvases are composited first -- the board below and the pulses above
   -- because what is on the screen is their sum. */

/** Where the settled board's brightness must land, as the share of the
    board region at or above each level (0..255), and its mean. */
export const BANDS = {
  mean: [38, 56],
  nearBlack: [0, 30],        // at 20 or below
  visible: [22, 34],         // 45 and up
  bright: [4, 9],            // 160 and up
  nearWhite: [1.5, 4.5],     // 220 and up
} as const;

/** When a pixel that ends up lit first lit, in ms. */
export const TIMING = {
  p10: [600, 1000],
  p50: [2200, 3000],
  p90: [5000, 6500],
  p99: [7500, 9000],
  spread: [4000, Infinity],  // p90 - p10
  rings: [2000, Infinity],   // the farthest fifth's 90 % against the nearest's
} as const;

/** Lines a scanline crosses per 1000 px, and how much a settled board still
    changes from one frame to the next (mean absolute difference, 0..255). */
export const DENSITY = [11, 15] as const;
export const IDLE_MOTION = [0.01, 0.08] as const;

export interface BoardStats {
  board: { width: number; height: number; pixels: number };
  hist: { mean: number; nearBlack: number; visible: number; clear: number; bright: number; nearWhite: number };
  timing: { p10: number; p50: number; p90: number; p99: number; spread: number; rings: number[]; litPixels: number };
  density: number;
  densityAt: number[][];
  idleMotion: number;
}

/** Runs inside the window.  Everything it needs is in its argument. */
export function measureBoard({ step, grown }: { step: number; grown: number }): BoardStats {
  const hook = window.__startfield!;
  const [lower, upper] = [...document.querySelectorAll<HTMLCanvasElement>('.startfield canvas')];
  const card = document.querySelector('.wcard')!.getBoundingClientRect();
  const bars = [...document.querySelectorAll('.titlebar, .status')].map((e) => e.getBoundingClientRect());
  const host = document.querySelector('.startfield')!.getBoundingClientRect();
  const W = Math.round(host.width), H = Math.round(host.height);

  // The two canvases composited, read at the window's own pixels.
  const flat = document.createElement('canvas');
  flat.width = W; flat.height = H;
  const ctx = flat.getContext('2d', { willReadFrequently: true })!;
  const frame = (t: number): Uint8ClampedArray => {
    hook.stepTo(t);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(lower, 0, 0, lower.width, lower.height, 0, 0, W, H);
    ctx.drawImage(upper, 0, 0, upper.width, upper.height, 0, 0, W, H);
    return ctx.getImageData(0, 0, W, H).data;
  };

  // The board region: everything but the card and the two bars.
  const out = (x: number, y: number): boolean => {
    const px = x + host.x, py = y + host.y;
    if (px >= card.x && px < card.right && py >= card.y && py < card.bottom) return true;
    for (const b of bars) if (py >= b.y && py < b.bottom) return true;
    return false;
  };
  const mask = new Uint8Array(W * H);
  let inBoard = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!out(x, y)) { mask[y * W + x] = 1; inBoard++; }

  const grey = (d: Uint8ClampedArray, i: number): number => (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000;

  /* ---- when each pixel first lit --------------------------------------
     Above the haze, not above the background: the haze is the board's
     ground and it comes up in the first 0.7 s everywhere at once, so any
     threshold below it reports the whole board as lit by then and
     measures the fade rather than the board growing. */
  const LIT = 75;
  const stops: number[] = [];
  for (let t = 0; t <= grown + 600; t += step) stops.push(t);
  const first = new Int32Array(W * H).fill(-1);
  for (let s = 0; s < stops.length; s++) {
    const d = frame(stops[s]);
    for (let i = 0; i < W * H; i++) if (mask[i] && first[i] < 0 && grey(d, i) >= LIT) first[i] = s;
  }

  // ---- the settled board ----------------------------------------------
  const last = frame(grown + 2000);
  const hist = { mean: 0, nearBlack: 0, visible: 0, clear: 0, bright: 0, nearWhite: 0 };
  let sum = 0;
  const lit: number[] = [];
  const ringOf: number[] = [];
  const cx = card.x - host.x + card.width / 2, cy = card.y - host.y + card.height / 2;
  // The rings span the distances the board region actually covers: the
  // nearest is the ring just outside the card, not an empty one inside it.
  let dLo = Infinity, dHi = 0;
  for (let i = 0; i < W * H; i++) {
    if (!mask[i]) continue;
    const x = i % W, d = Math.hypot(x - cx, (i - x) / W - cy);
    if (d < dLo) dLo = d;
    if (d > dHi) dHi = d;
  }
  const reach = Math.max(1, dHi - dLo);
  for (let i = 0; i < W * H; i++) {
    if (!mask[i]) continue;
    const v = grey(last, i);
    sum += v;
    if (v <= 20) hist.nearBlack++;
    if (v >= 45) hist.visible++;
    if (v >= 90) hist.clear++;
    if (v >= 160) hist.bright++;
    if (v >= 220) hist.nearWhite++;
    // Only a pixel that is lit at the end has a "when it lit".
    if (v >= LIT && first[i] >= 0) {
      lit.push(stops[first[i]]);
      const x = i % W, y = (i - (i % W)) / W;
      ringOf.push(Math.min(4, Math.floor(((Math.hypot(x - cx, y - cy) - dLo) / reach) * 5)));
    }
  }

  // Each ring's 90 %, taken before lit[] is sorted: sorting it would leave
  // ringOf[] pointing at other pixels and every ring would read the same.
  const rings: number[] = [];
  for (let k = 0; k < 5; k++) {
    const of: number[] = [];
    for (let n = 0; n < lit.length; n++) if (ringOf[n] === k) of.push(lit[n]);
    of.sort((a, b) => a - b);
    rings.push(of.length ? of[Math.floor(of.length * 0.9)] : 0);
  }
  hist.mean = sum / inBoard;
  const pct = (n: number): number => (n / inBoard) * 100;

  lit.sort((a, b) => a - b);
  const q = (xs: number[], p: number): number => (xs.length ? xs[Math.min(xs.length - 1, Math.floor(xs.length * p))] : 0);

  /* ---- how many lines a scanline crosses ------------------------------
     At several thresholds, because the answer depends on where the line
     is drawn: the far layer is dim by design, and a count that includes
     it is a different number from one that does not.  CROSS is the one
     reported; the rest are there to show the count is not an artefact of
     it. */
  /* 150 counts the two upper depths' cores and not the far one's, which
     by design is dim (its cores land at 137..148 over the haze).  Counting
     all three gives 17.7 and the two upper ones 11.2; the band the check
     holds to fits the latter. */
  const CROSS = 150;
  const thresholds = [60, 90, 110, 140, 150, 160, 170, 180];
  const crossings = thresholds.map(() => 0);
  let scanned = 0;
  /* Rows, as a scanline is: the count the band is drawn around was taken
     that way.  It does under-count the traces that run level, which a
     row never crosses; taking columns as well puts the figure about 3 %
     lower still, and either way doubling the traces doubles it, which is
     what the check is for. */
  const sweep = (n: number, pixel: (k: number) => number): void => {
    const on = thresholds.map(() => false);
    for (let k = 0; k < n; k++) {
      const i = pixel(k);
      if (!mask[i]) { on.fill(false); continue; }
      scanned++;
      const v = grey(last, i);
      for (let c = 0; c < thresholds.length; c++) {
        const hot = v >= thresholds[c];
        if (hot && !on[c]) crossings[c]++;
        on[c] = hot;
      }
    }
  };
  for (let y = 0; y < H; y += 7) sweep(W, (x) => y * W + x);

  /* ---- what is left moving, and what it costs -------------------------
     Over a second of it, not one pair of frames: at any one moment a
     pulse may be between two traces, and a single pair would then report
     a settled board as still. */
  let diff = 0, pairs = 0;
  let prev = new Uint8ClampedArray(frame(grown + 2000));
  for (let n = 1; n <= 60; n++) {
    const now = frame(grown + 2000 + (n * 1000) / 60);
    for (let i = 0; i < W * H; i++) if (mask[i]) diff += Math.abs(grey(prev, i) - grey(now, i));
    prev = new Uint8ClampedArray(now);
    pairs++;
  }

  return {
    board: { width: W, height: H, pixels: inBoard },
    hist: { mean: hist.mean, nearBlack: pct(hist.nearBlack), visible: pct(hist.visible),
            clear: pct(hist.clear), bright: pct(hist.bright), nearWhite: pct(hist.nearWhite) },
    timing: { p10: q(lit, 0.10), p50: q(lit, 0.50), p90: q(lit, 0.90), p99: q(lit, 0.99),
              spread: q(lit, 0.90) - q(lit, 0.10), rings, litPixels: lit.length },
    density: (crossings[thresholds.indexOf(CROSS)] / scanned) * 1000,
    densityAt: thresholds.map((th, k) => [th, +((crossings[k] / scanned) * 1000).toFixed(2)]),
    idleMotion: diff / inBoard / pairs,
  };
}
