import sharp from "sharp";

/** Deterministic textured "damage scenes" and localized edits, to exercise the harness without real photos. */
function scene(seed: number, w: number, h: number, overlay = "") {
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let shapes = "";
  for (let i = 0; i < 120; i++) {
    const c = `rgb(${(rnd() * 255) | 0},${(rnd() * 255) | 0},${(rnd() * 255) | 0})`;
    shapes +=
      i % 3 === 0
        ? `<circle cx="${rnd() * w}" cy="${rnd() * h}" r="${10 + rnd() * 120}" fill="${c}"/>`
        : `<rect x="${rnd() * w}" y="${rnd() * h}" width="${20 + rnd() * 260}" height="${20 + rnd() * 260}" fill="${c}" transform="rotate(${rnd() * 50 - 25} ${rnd() * w} ${rnd() * h})"/>`;
  }
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#8a9"/>${shapes}${overlay}</svg>`))
    .jpeg({ quality: 92 })
    .toBuffer();
}

export async function syntheticDataset(n: number) {
  const W = 2016;
  const H = 1512;
  const originals: { name: string; bytes: Buffer }[] = [];
  const edits: { name: string; original: string; bytes: Buffer }[] = [];
  const negatives: { name: string; bytes: Buffer }[] = [];
  for (let i = 0; i < n; i++) {
    const seed = 1000 + i * 7;
    originals.push({ name: `scene-${i}`, bytes: await scene(seed, W, H) });
    // "Generative" edit stand-ins: a dent (dark ellipse), a removed crack (patch of local colour), a stain.
    const cx = 200 + ((i * 331) % (W - 400));
    const cy = 200 + ((i * 197) % (H - 400));
    const r = Math.sqrt((0.05 * W * H) / Math.PI); // ≥ 5% of the image area
    edits.push({ name: `scene-${i}-dent`, original: `scene-${i}`, bytes: await scene(seed, W, H, `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r * 0.8}" fill="#222" opacity="0.85"/>`) });
    edits.push({
      name: `scene-${i}-stain`,
      original: `scene-${i}`,
      bytes: await scene(seed, W, H, `<circle cx="${W - cx}" cy="${H - cy}" r="${r}" fill="#6b4f2a" opacity="0.7"/>`),
    });
    negatives.push({ name: `other-${i}`, bytes: await scene(50_000 + i * 13, W, H) });
  }
  return { originals, edits, negatives };
}
