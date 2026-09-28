import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const OUT = resolve("e2e/fixtures/camera.y4m");
const W = 960;
const H = 720;
const FRAMES = 24;

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/**
 * Writes e2e/fixtures/camera.y4m for Chrome's fake camera: a textured "damage scene" (Chrome's default fake
 * stream is mostly flat, which makes PDQ tile hashes unstable) with one marker that moves per frame, so
 * consecutive photos differ in bytes but not in scene. ~25 MB, generated once and gitignored.
 */
export default async function globalSetup() {
  if (existsSync(OUT)) return;
  mkdirSync(resolve("e2e/fixtures"), { recursive: true });

  let seed = 3;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let shapes = "";
  for (let i = 0; i < 90; i++) {
    const c = `rgb(${(rnd() * 255) | 0},${(rnd() * 255) | 0},${(rnd() * 255) | 0})`;
    shapes +=
      i % 2
        ? `<circle cx="${rnd() * W}" cy="${rnd() * H}" r="${15 + rnd() * 110}" fill="${c}"/>`
        : `<rect x="${rnd() * W}" y="${rnd() * H}" width="${30 + rnd() * 220}" height="${30 + rnd() * 220}" fill="${c}"/>`;
  }

  const chunks = [Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\n`)];
  for (let f = 0; f < FRAMES; f++) {
    const marker = `<circle cx="${40 + f * 8}" cy="${H - 40}" r="14" fill="#fff"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#7a8f7e"/>${shapes}${marker}</svg>`;
    const { data } = await sharp(Buffer.from(svg)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const Y = Buffer.alloc(W * H);
    const U = Buffer.alloc((W / 2) * (H / 2));
    const V = Buffer.alloc((W / 2) * (H / 2));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 3;
        const r = data[i]!;
        const g = data[i + 1]!;
        const b = data[i + 2]!;
        Y[y * W + x] = clamp(0.299 * r + 0.587 * g + 0.114 * b);
        if (y % 2 === 0 && x % 2 === 0) {
          const j = (y / 2) * (W / 2) + x / 2;
          U[j] = clamp(-0.1687 * r - 0.3313 * g + 0.5 * b + 128);
          V[j] = clamp(0.5 * r - 0.4187 * g - 0.0813 * b + 128);
        }
      }
    }
    chunks.push(Buffer.from("FRAME\n"), Y, U, V);
  }
  writeFileSync(OUT, Buffer.concat(chunks));
}
