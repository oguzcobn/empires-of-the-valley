import { makeRng } from '../../core/rng';

const SIZE = 64;
const PATCH_M = 18;

/** In-place radix-2 inverse FFT, applied along both axes of a periodic spectral tile. */
export function inverse(real: Float64Array, imag: Float64Array): void {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
    j ^= bit;
    if (i >= j) continue;
    [real[i], real[j]] = [real[j]!, real[i]!];
    [imag[i], imag[j]] = [imag[j]!, imag[i]!];
  }
  for (let len = 2; len <= n; len <<= 1) {
    for (let start = 0; start < n; start += len) {
      for (let j = 0; j < len / 2; j++) {
        const a = start + j, b = a + len / 2;
        const angle = Math.PI * 2 * j / len, c = Math.cos(angle), s = Math.sin(angle);
        const x = real[b]! * c - imag[b]! * s, y = imag[b]! * c + real[b]! * s;
        real[b] = real[a]! - x;
        imag[b] = imag[a]! - y;
        real[a] = real[a]! + x;
        imag[a] = imag[a]! + y;
      }
    }
  }
  for (let i = 0; i < n; i++) { real[i] = real[i]! / n; imag[i] = imag[i]! / n; }
}

/** Tessendorf-style spectral patch. Uses a Phillips spectrum and conjugate frequencies so the
 * inverse transform produces real heights. Scaled to a 4 cm RMS for sheltered port water. */
export function portSpectrum(): { bytes: Uint8Array; size: number; rms: number } {
  const real = new Float64Array(SIZE * SIZE), imag = new Float64Array(real.length);
  const rng = makeRng(184);
  const L = 4 ** 2 / 9.81;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const i = y * SIZE + x;
    const opposite = ((SIZE - y) % SIZE) * SIZE + ((SIZE - x) % SIZE);
    if (i === 0 || opposite < i) continue;
    const kx = Math.PI * 2 * (x > SIZE / 2 ? x - SIZE : x) / PATCH_M;
    const ky = Math.PI * 2 * (y > SIZE / 2 ? y - SIZE : y) / PATCH_M;
    const k2 = kx * kx + ky * ky;
    const alignment = (kx * .8 + ky * .6) / Math.sqrt(k2);
    const power = (Math.exp(-1 / (k2 * L * L)) / (k2 * k2)) * alignment ** 2 * Math.exp(-.035 * k2);
    const sample = Math.sqrt(-Math.log((rng.int(99999) + 1) / 100001) * power);
    const phase = 2 * Math.PI * rng.int(100000) / 100000;
    real[i] = real[opposite] = sample * Math.cos(phase);
    imag[i] = opposite === i ? 0 : sample * Math.sin(phase);
    imag[opposite] = -imag[i]!;
  }
  for (let row = 0; row < SIZE; row++) inverse(real.subarray(row * SIZE, (row + 1) * SIZE), imag.subarray(row * SIZE, (row + 1) * SIZE));
  const lineR = new Float64Array(SIZE), lineI = new Float64Array(SIZE);
  for (let x = 0; x < SIZE; x++) {
    for (let y = 0; y < SIZE; y++) { lineR[y] = real[y * SIZE + x]!; lineI[y] = imag[y * SIZE + x]!; }
    inverse(lineR, lineI);
    for (let y = 0; y < SIZE; y++) real[y * SIZE + x] = lineR[y]!;
  }
  const roughness = Math.sqrt(real.reduce((sum, h) => sum + h * h, 0) / real.length);
  const scale = .04 / Math.max(1e-8, roughness);
  const slope = scale / (2 * PATCH_M / SIZE);
  const at = (x: number, y: number) => real[((y + SIZE) % SIZE) * SIZE + (x + SIZE) % SIZE]!;
  const bytes = new Uint8Array(real.length * 4);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4;
    const dx = (at(x - 1, y) - at(x + 1, y)) * slope;
    const dy = (at(x, y - 1) - at(x, y + 1)) * slope;
    const length = Math.hypot(dx, dy, 1);
    bytes[i] = Math.round(127.5 * (1 + dx / length));
    bytes[i + 1] = Math.round(127.5 * (1 + dy / length));
    bytes[i + 2] = Math.round(127.5 * (1 + 1 / length));
    bytes[i + 3] = 255;
  }
  return { bytes, size: SIZE, rms: roughness * scale };
}
