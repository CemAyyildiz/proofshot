/**
 * Spike A / SM-2 benchmark. Measures how the Verdict engine treats real-world copies of sealed photos.
 *
 *   pnpm --filter @proofshot/benchmark bench              # real dataset in benchmark/data (see README)
 *   pnpm --filter @proofshot/benchmark bench:synthetic    # generated scenes; validates the harness only
 *
 * Writes README.md (or README.synthetic.md) and raw JSON under results/.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { parseArgs } from "node:util";
import {
  DEFAULT_THRESHOLDS,
  type Fingerprint,
  type RegistryEntry,
  type Thresholds,
  computeVerdict,
  hamming,
} from "@proofshot/fingerprint";
import { fingerprintFile } from "@proofshot/fingerprint/node";
import { EXPECTED, TRANSFORMS, type TransformName } from "./transforms";
import { syntheticDataset } from "./synthetic";

const { values } = parseArgs({ options: { synthetic: { type: "boolean", default: false }, n: { type: "string", default: "20" } } });
const ROOT = new URL("..", import.meta.url).pathname;
const DATA = join(ROOT, "data");
const IMAGE = /\.(jpe?g|png|webp|heic|heif)$/i;

interface Sample {
  kind: TransformName | "whatsapp-real" | "x-real" | "edit" | "negative";
  name: string;
  original?: string;
  fp: Fingerprint;
  /** Tiles that contain the edit (synthetic edits only). */
  editTiles?: number[];
}

const stem = (f: string) => basename(f, extname(f));
const files = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((f) => IMAGE.test(f)).map((f) => join(dir, f)) : []);

async function load() {
  if (values.synthetic) {
    const n = Number(values.n);
    const ds = await syntheticDataset(n);
    return {
      label: `synthetic (${n} generated scenes, 2016×1512)`,
      originals: ds.originals.map((o) => ({ name: o.name, bytes: o.bytes })),
      edits: ds.edits.map((e) => ({ ...e, editTiles: undefined as number[] | undefined })),
      negatives: ds.negatives,
      real: { whatsapp: [] as { name: string; original: string; bytes: Buffer }[], x: [] as { name: string; original: string; bytes: Buffer }[] },
    };
  }
  const originals = files(join(DATA, "originals")).map((p) => ({ name: stem(p), bytes: readFileSync(p) }));
  if (originals.length === 0) throw new Error(`No photos in ${join(DATA, "originals")}. See benchmark/README.md → "Dataset".`);
  const byStem = (dir: string) =>
    files(join(DATA, dir)).map((p) => ({ name: stem(p), original: stem(p).split("--")[0]!, bytes: readFileSync(p) }));
  return {
    label: `real (${originals.length} photos)`,
    originals,
    edits: byStem("edits").map((e) => ({ ...e, editTiles: undefined as number[] | undefined })),
    negatives: files(join(DATA, "negatives")).map((p) => ({ name: stem(p), bytes: readFileSync(p) })),
    real: { whatsapp: byStem("whatsapp"), x: byStem("x") },
  };
}

function sealed(fp: Fingerprint, i: number): RegistryEntry {
  return {
    kind: "sealed",
    exactHash: fp.exactHash,
    pHash: fp.pHash,
    tiles: fp.tiles,
    width: fp.width,
    height: fp.height,
    carrierId: `0x${"00".repeat(32)}`,
    blockNumber: BigInt(i),
    txHash: `0x${"00".repeat(32)}`,
    blockTimestamp: 0,
  };
}

const outcome = (v: ReturnType<typeof computeVerdict>) => ("alterationCheck" in v ? `${v.kind}:${v.alterationCheck}` : v.kind);
const pct = (a: number, b: number) => (b === 0 ? "—" : `${((100 * a) / b).toFixed(1)}%`);

function histogram(values: number[], bucket = 8, max = 128) {
  const counts = new Map<number, number>();
  for (const v of values) {
    const b = Math.min(max, Math.floor(v / bucket) * bucket);
    counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  const peak = Math.max(1, ...counts.values());
  return [...counts.keys()]
    .sort((a, b) => a - b)
    .map((b) => `${String(b).padStart(3)}${b === max ? "+" : `–${b + bucket - 1}`.padEnd(4)} ${"█".repeat(Math.ceil((30 * counts.get(b)!) / peak))} ${counts.get(b)}`)
    .join("\n");
}

async function main() {
  const t0 = Date.now();
  const ds = await load();
  const originals = new Map<string, Fingerprint>();
  for (const o of ds.originals) originals.set(o.name, await fingerprintFile(o.bytes));
  const registry = [...originals.values()].map(sealed);

  const samples: Sample[] = [];
  for (const o of ds.originals) {
    for (const [name, fn] of Object.entries(TRANSFORMS) as [TransformName, (b: Buffer) => Promise<Buffer>][]) {
      samples.push({ kind: name, name: `${o.name}/${name}`, original: o.name, fp: await fingerprintFile(await fn(o.bytes)) });
    }
  }
  for (const w of ds.real.whatsapp) samples.push({ kind: "whatsapp-real", name: w.name, original: w.original, fp: await fingerprintFile(w.bytes) });
  for (const x of ds.real.x) samples.push({ kind: "x-real", name: x.name, original: x.original, fp: await fingerprintFile(x.bytes) });
  for (const e of ds.edits) samples.push({ kind: "edit", name: e.name, original: e.original, fp: await fingerprintFile(e.bytes), editTiles: e.editTiles });
  for (const n of ds.negatives) samples.push({ kind: "negative", name: n.name, fp: await fingerprintFile(n.bytes) });

  const evaluate = (t: Thresholds) =>
    samples.map((s) => {
      const v = computeVerdict(s.fp, registry, t);
      const matchedOwn = "record" in v && s.original !== undefined && v.record.exactHash === originals.get(s.original)?.exactHash;
      return { s, v, got: outcome(v), matchedOwn };
    });

  // ── Threshold sweep for T_tile under the SM-C1 ceiling ──────────────────────────────────────────────────
  const sweep = [];
  for (let tTile = 24; tTile <= 80; tTile += 4) {
    const r = evaluate({ ...DEFAULT_THRESHOLDS, tTile });
    const copies = r.filter((x) => x.s.kind !== "edit" && x.s.kind !== "negative");
    const falseAltered = copies.filter((x) => x.v.kind === "altered").length / Math.max(1, copies.length);
    const edits = r.filter((x) => x.s.kind === "edit");
    const alteredRecall = edits.filter((x) => x.v.kind === "altered").length / Math.max(1, edits.length);
    sweep.push({ tTile, falseAltered, alteredRecall });
  }
  const eligible = sweep.filter((s) => s.falseAltered <= 0.05);
  // Highest Altered recall; ties go to fewer false Altered, then the most conservative (largest) T_tile, which
  // protects honest policyholders (SM-C1) at no cost in recall.
  const chosen = (
    eligible.length
      ? [...eligible].sort((a, b) => b.alteredRecall - a.alteredRecall || a.falseAltered - b.falseAltered || b.tTile - a.tTile)[0]
      : sweep.at(-1)
  )!;
  const thresholds = { ...DEFAULT_THRESHOLDS, tTile: chosen.tTile };
  const results = evaluate(thresholds);

  // ── Metrics ──────────────────────────────────────────────────────────────────────────────────────────────
  const kinds = [...new Set(results.map((r) => r.s.kind))];
  const rows = kinds.map((k) => {
    const rs = results.filter((r) => r.s.kind === k);
    const expected = EXPECTED[k as keyof typeof EXPECTED] ?? ["derived-copy:passed"];
    const ok = rs.filter((r) => expected.includes(r.got) && (k === "negative" || r.matchedOwn)).length;
    const dist = new Map<string, number>();
    for (const r of rs) dist.set(r.got, (dist.get(r.got) ?? 0) + 1);
    return { kind: k, n: rs.length, expected: expected.join(" / "), ok, breakdown: [...dist].map(([g, c]) => `${g} ${c}`).join(", ") };
  });

  const recompress = results.filter((r) => ["whatsapp-like", "x-like", "resize-50", "screenshot-like", "whatsapp-real", "x-real"].includes(r.s.kind));
  const derivedRecall = recompress.filter((r) => r.v.kind === "derived-copy" && r.matchedOwn).length / Math.max(1, recompress.length);
  const edits = results.filter((r) => r.s.kind === "edit");
  const alteredRecall = edits.filter((r) => r.v.kind === "altered").length / Math.max(1, edits.length);
  const copies = results.filter((r) => r.s.kind !== "edit" && r.s.kind !== "negative");
  const falseAltered = copies.filter((r) => r.v.kind === "altered").length / Math.max(1, copies.length);
  const negatives = results.filter((r) => r.s.kind === "negative");
  const falseMatch = negatives.filter((r) => r.v.kind !== "no-record").length / Math.max(1, negatives.length);
  const crops = results.filter((r) => r.s.kind.startsWith("crop"));
  const cleanCrops = crops.filter((r) => r.got === "derived-copy:passed").length;

  // Distances to the sample's own original.
  const own = (r: (typeof results)[number]) => originals.get(r.s.original!)!;
  const pDist = (k: string) => results.filter((r) => r.s.kind === k).map((r) => hamming(r.s.fp.pHash, own(r).pHash));
  const tileDist = (rs: typeof results) =>
    rs.filter((r) => Math.abs(r.s.fp.width / r.s.fp.height - own(r).width / own(r).height) < 0.02).flatMap((r) => r.s.fp.tiles.map((t, i) => hamming(t, own(r).tiles[i]!)));

  const sm2 = [
    ["Derived Copy recall, recompression & resize", pct(derivedRecall * 100, 100), "≥ 95%", derivedRecall >= 0.95],
    ["Altered recall, localized edits ≥ 5% area", pct(alteredRecall * 100, 100), "≥ 80%", alteredRecall >= 0.8],
    ["SM-C1 false Altered on unedited copies", pct(falseAltered * 100, 100), "≤ 5%", falseAltered <= 0.05],
    ["SM-C2 false match on different scenes", pct(falseMatch * 100, 100), "≤ 1%", falseMatch <= 0.01],
    ["Crops shown as a clean result", String(cleanCrops), "0", cleanCrops === 0],
  ] as const;

  const synthetic = values.synthetic;
  const md = `# Proofshot verification benchmark${synthetic ? " — synthetic harness check" : ""}

${synthetic ? "> **Synthetic data.** Generated vector scenes, not photographs. This run only shows that the harness works; it is **not** the SM-2 result. The published result comes from `pnpm bench` on real photos.\n\n" : ""}Dataset: ${ds.label}, ${results.length} verifications. Run ${new Date().toISOString()} in ${((Date.now() - t0) / 1000).toFixed(0)} s.

## Result against SM-2 and counter-metrics

| Metric | Measured | Target | |
|---|---|---|---|
${sm2.map(([m, v, t, ok]) => `| ${m} | ${v} | ${t} | ${ok ? "✅" : "❌"} |`).join("\n")}

Thresholds used: \`T_match\`=${thresholds.tMatch}, \`T_tile\`=${thresholds.tTile} (chosen by the sweep below), tile-majority match ≥ ${thresholds.minTileMatches}/16, aspect tolerance ${thresholds.aspectTolerance * 100}%, more than ${thresholds.maxAlteredTiles} changed tiles ⇒ geometry change.

## Verdicts by copy type

| Copy | n | Expected | Correct | Breakdown |
|---|---|---|---|---|
${rows.map((r) => `| ${r.kind} | ${r.n} | ${r.expected} | ${pct(r.ok, r.n)} | ${r.breakdown} |`).join("\n")}

## \`T_tile\` sweep (SM-C1 ceiling 5%)

| T_tile | false Altered | Altered recall |
|---|---|---|
${sweep
  .sort((a, b) => a.tTile - b.tTile)
  .map((s) => `| ${s.tTile}${s.tTile === chosen.tTile ? " ←" : ""} | ${pct(s.falseAltered * 100, 100)} | ${pct(s.alteredRecall * 100, 100)} |`)
  .join("\n")}

## Distance histograms (bits of 256)

Whole-image PDQ distance to the sealed original:

${(["whatsapp-like", "x-like", "screenshot-like", "resize-50", "crop-3-centred", "crop-10", "edit"] as const)
  .map((k) => `**${k}**\n\`\`\`\n${histogram(pDist(k))}\n\`\`\``)
  .join("\n\n")}

Per-tile distance, unedited copies with comparable tiles vs. edited copies:

**unedited tiles**
\`\`\`
${histogram(tileDist(results.filter((r) => r.s.kind !== "edit" && r.s.kind !== "negative")))}
\`\`\`

**tiles of edited copies (includes unchanged tiles)**
\`\`\`
${histogram(tileDist(edits))}
\`\`\`

## Method

- Every original is fingerprinted and registered as a sealed record; each copy is verified against all of them with \`computeVerdict\` from \`packages/fingerprint\` — the same code the Public Verifier and \`proofshot-verify\` run.
- Synthetic transforms: WhatsApp-like (1600 px, JPEG q60), X-like (1200 px, q85), screenshot-like (PNG at 90%), 50% resize, 10% one-edge crop, 3% centred crop. Real platform round-trips are included when present in \`data/whatsapp\` and \`data/x\`.
- Edits are localized changes covering ≥ 5% of the image. Negatives are different scenes that look alike (same car model, same room type).
- Recall counts a copy as correct only when it matched its own original.
- Raw per-sample results: \`results/${synthetic ? "synthetic" : "real"}.json\`.

## Dataset (real run)

Put files under \`benchmark/data/\` (gitignored; \`data/MANIFEST.md\` is committed):

- \`originals/<name>.jpg\` — photos taken on a phone of damage-like scenes (cars, walls, windows).
- \`edits/<name>--<label>.jpg\` — generative inpaint edits of \`<name>\` (add a dent, remove a crack, add a water stain).
- \`negatives/<any>.jpg\` — near-duplicate *different* scenes.
- optional \`whatsapp/<name>.jpg\`, \`x/<name>.jpg\` — the photo after a real send/receive or upload/download.

Then run \`pnpm --filter @proofshot/benchmark bench\`.
`;

  mkdirSync(join(ROOT, "results"), { recursive: true });
  writeFileSync(join(ROOT, synthetic ? "README.synthetic.md" : "README.md"), md);
  writeFileSync(
    join(ROOT, "results", `${synthetic ? "synthetic" : "real"}.json`),
    JSON.stringify(
      {
        thresholds,
        samples: results.map((r) => ({
          kind: r.s.kind,
          name: r.s.name,
          original: r.s.original ?? null,
          verdict: r.got,
          matchedOwn: r.matchedOwn,
          pDistance: r.s.original ? hamming(r.s.fp.pHash, own(r).pHash) : null,
          alteredTiles: r.v.kind === "altered" ? r.v.alteredTiles : [],
        })),
      },
      null,
      2,
    ),
  );
  console.log(sm2.map(([m, v, t, ok]) => `${ok ? "✓" : "✗"} ${m}: ${v} (target ${t})`).join("\n"));
  console.log(`T_tile=${thresholds.tTile}; wrote ${synthetic ? "README.synthetic.md" : "README.md"}`);
}

await main();
