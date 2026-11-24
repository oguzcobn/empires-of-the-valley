import { makeRng } from '../core/rng';
import { inverse } from '../rendering/three/portSpectrum';

/** Four surface intervals per game tile, eight metres per tile for the wave model. */
export const WATER_INTERVALS = 4;
export const WATER_METRES_PER_TILE = 8;
export const SPECTRUM_SIZE = 32;
const N = SPECTRUM_SIZE;
const COUNT = N * N;
const SPACING = WATER_METRES_PER_TILE / WATER_INTERVALS;
const PATCH = N * SPACING;
const G = 9.81;
const TAU = 2 * Math.PI;

/**
 * Periodic height field in metres. Tessendorf, Simulating Ocean Water, eqs. 39–44,
 * https://jtessen.people.clemson.edu/reports/papers_files/coursenotes2002.pdf
 * A travelling random-phase realization of the Phillips spectrum. Each independent
 * mode has an explicit conjugate. Constant modulus conserves wave variance over time.
 * The same initialized coefficients drive every tile, including shared bank edges.
 */
export class OceanSpectrum {
  readonly heights = new Float64Array(COUNT);
  readonly normals = new Float32Array(COUNT * 3);
  private readonly conjugate = new Uint16Array(COUNT);
  private readonly amplitude = new Float64Array(COUNT);
  private readonly phase = new Float64Array(COUNT);
  private readonly frequency = new Float64Array(COUNT);
  private readonly imaginary = new Float64Array(COUNT);
  private readonly lineR = new Float64Array(N);
  private readonly lineI = new Float64Array(N);

  constructor(seed = 184, rmsMetres = .12, windMetresPerSecond = 5) {
    const rng = makeRng(seed);
    const windLength = windMetresPerSecond ** 2 / G;
    let totalPower = 0;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = z * N + x;
      const partner = ((N - z) % N) * N + (N - x) % N;
      this.conjugate[i] = partner;
      // Exclude both Nyquist axes to avoid ambiguous signed directions.
      if (i >= partner || z === N / 2 || x === N / 2) continue;
      const kx = TAU * (x > N / 2 ? x - N : x) / PATCH;
      const kz = TAU * (z > N / 2 ? z - N : z) / PATCH;
      const k = Math.hypot(kx, kz);
      const alignment = (kx * .8 + kz * .6) / k;
      const power = Math.exp(-1 / (k * windLength) ** 2 - (k * .15) ** 2) * alignment ** 2 / k ** 4;
      const amplitude = Math.sqrt(-Math.log((rng.int(100000) + 1) / 100001) * power);
      this.amplitude[i] = amplitude;
      this.phase[i] = TAU * rng.int(100000) / 100000;
      this.frequency[i] = -Math.sign(alignment) * Math.sqrt(G * k);
      totalPower += 2 * amplitude ** 2;
    }
    // Parseval for the 1/N²-normalized inverse transform.
    const scale = totalPower > 0 ? rmsMetres * COUNT / Math.sqrt(totalPower) : 0;
    for (let i = 0; i < COUNT; i++) this.amplitude[i] = this.amplitude[i]! * scale;
    this.update(0);
  }

  update(seconds: number): void {
    const real = this.heights, imag = this.imaginary;
    real.fill(0); imag.fill(0);
    for (let i = 0; i < COUNT; i++) {
      const amplitude = this.amplitude[i]!;
      if (amplitude === 0) continue;
      const partner = this.conjugate[i]!;
      const theta = this.phase[i]! + this.frequency[i]! * seconds;
      real[i] = real[partner] = amplitude * Math.cos(theta);
      imag[i] = amplitude * Math.sin(theta);
      imag[partner] = -imag[i]!;
    }
    for (let z = 0; z < N; z++) {
      inverse(real.subarray(z * N, (z + 1) * N), imag.subarray(z * N, (z + 1) * N));
    }
    for (let x = 0; x < N; x++) {
      for (let z = 0; z < N; z++) {
        this.lineR[z] = real[z * N + x]!;
        this.lineI[z] = imag[z * N + x]!;
      }
      inverse(this.lineR, this.lineI);
      for (let z = 0; z < N; z++) real[z * N + x] = this.lineR[z]!;
    }
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = z * N + x;
      const dx = (real[z * N + ((x - 1 + N) % N)]! - real[z * N + ((x + 1) % N)]!) / (2 * SPACING);
      const dz = (real[((z - 1 + N) % N) * N + x]! - real[((z + 1) % N) * N + x]!) / (2 * SPACING);
      const length = Math.hypot(dx, 1, dz);
      this.normals[i * 3] = dx / length;
      this.normals[i * 3 + 1] = 1 / length;
      this.normals[i * 3 + 2] = dz / length;
    }
  }
}
