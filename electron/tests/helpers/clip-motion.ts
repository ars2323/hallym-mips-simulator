/* How a clip moves (tests/renderer/start-clip.test.ts, docs/PORTING.md 31): every frame decoded by
   ffmpeg, grey, 240x135, and the mean absolute difference between neighbours -- a "step".  What is
   read from the steps:
     stall     the smallest step over the mean step (a frame shown twice: about 0)
     period3   index % 3: the three phases' mean steps, their range over the mean step
     period18  the same with 18 phases: 25-fps material slowed three times into 30 fps puts 5 shot
               frames in every 18 (2.7.0's copies, one in every 6 shot frames, stood still every 18)
     seam      the step from the last frame to the first, where the player loops, over the median
               step */

import { execFileSync, spawnSync } from 'node:child_process';

export const hasFfmpeg = (): boolean => spawnSync('ffmpeg', ['-version']).status === 0;

export function steps(file: string): { steps: number[]; seam: number } {
  const W = 240, H = 135, n = W * H;
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `scale=${W}:${H},format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 30 });
  const frames = raw.length / n;
  const apart = (a: number, b: number) => { let s = 0; for (let i = 0; i < n; i++) s += Math.abs(raw[a * n + i] - raw[b * n + i]); return s / n; };
  return { steps: Array.from({ length: frames - 1 }, (_, k) => apart(k, k + 1)), seam: apart(frames - 1, 0) };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const period = (d: number[], p: number) => {
  const phases = Array.from({ length: p }, (_, q) => mean(d.filter((_, i) => i % p === q)));
  return (Math.max(...phases) - Math.min(...phases)) / mean(d);
};

export function motion(file: string) {
  const { steps: d, seam } = steps(file);
  const sorted = [...d].sort((a, b) => a - b);
  return {
    frames: d.length + 1,
    mean: mean(d),
    stall: Math.min(...d) / mean(d),
    stills: d.filter((x) => x < 0.3).length,
    period3: period(d, 3),
    period18: period(d, 18),
    seam: seam / sorted[Math.floor(sorted.length / 2)],
  };
}
