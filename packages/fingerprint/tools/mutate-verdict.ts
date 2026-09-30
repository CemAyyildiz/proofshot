/**
 * pnpm --filter @proofshot/fingerprint mutate — mutation test for the Verdict rules.
 * Applies one small change at a time to src/verdict.ts (a flipped comparison, a threshold ±1, a reversed tie-break)
 * and runs the package tests. Every mutant must be "killed" (some test fails); a survivor is an untested rule.
 * The source file is always restored, even on Ctrl-C.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const FILE = new URL("../src/verdict.ts", import.meta.url);
const original = readFileSync(FILE, "utf8");

const MUTANTS: [name: string, from: string, to: string][] = [
  ["whole-image match exclusive", "c.distance <= t.tMatch", "c.distance < t.tMatch"],
  ["tile majority exclusive", "c.tileMatches >= t.minTileMatches", "c.tileMatches > t.minTileMatches"],
  ["tile match exclusive", "filter((d) => d <= t.tTile)", "filter((d) => d < t.tTile)"],
  ["altered tile inclusive", "d > t.tTile &&", "d >= t.tTile &&"],
  ["geometry cap inclusive", "alteredTiles.length > t.maxAlteredTiles", "alteredTiles.length >= t.maxAlteredTiles"],
  ["one altered tile ignored", "alteredTiles.length > 0)", "alteredTiles.length > 1)"],
  ["aspect tolerance exclusive", "/ rb <= tolerance", "/ rb < tolerance"],
  ["aspect check removed", "!aspectCompatible(fp, record, t.aspectTolerance) ||", "false ||"],
  ["tile count check removed", "|| record.tiles.length !== TILE_COUNT", ""],
  ["imported yields Original", 'record.kind === "sealed" && record.exactHash === fp.exactHash', "record.exactHash === fp.exactHash"],
  ["fewer tiles preferred", "return a.tileMatches > b.tileMatches;", "return a.tileMatches < b.tileMatches;"],
  ["larger distance preferred", "return a.distance < b.distance;", "return a.distance > b.distance;"],
  ["sealed not preferred", 'return a.record.kind === "sealed" && b.record.kind !== "sealed";', "return false;"],
  ["featureless tiles judged", ">= t.minTileQuality", "> t.minTileQuality"],
  ["exact match not first", "(a.exact ? -1 : 1)", "(a.exact ? 1 : -1)"],
  ["nearest distance dropped", "nearest = Math.min(nearest, c.distance);", ""],
  ["tMatch 32", "tMatch: 31,", "tMatch: 32,"],
  ["tMatch 30", "tMatch: 31,", "tMatch: 30,"],
  ["tTile 41", "tTile: 40,", "tTile: 41,"],
  ["tTile 39", "tTile: 40,", "tTile: 39,"],
  ["minTileMatches 11", "minTileMatches: 12,", "minTileMatches: 11,"],
  ["minTileMatches 13", "minTileMatches: 12,", "minTileMatches: 13,"],
  ["maxAlteredTiles 7", "maxAlteredTiles: 8,", "maxAlteredTiles: 7,"],
  ["maxAlteredTiles 9", "maxAlteredTiles: 8,", "maxAlteredTiles: 9,"],
  ["aspectTolerance 0.03", "aspectTolerance: 0.02,", "aspectTolerance: 0.03,"],
  ["aspectTolerance 0.01", "aspectTolerance: 0.02,", "aspectTolerance: 0.01,"],
];

const restore = () => writeFileSync(FILE, original);
process.on("SIGINT", () => {
  restore();
  process.exit(130);
});

const survivors: string[] = [];
try {
  for (const [name, from, to] of MUTANTS) {
    if (original.split(from).length !== 2) throw new Error(`mutant "${name}": pattern must occur exactly once: ${from}`);
    writeFileSync(FILE, original.replace(from, to));
    const killed = spawnSync("pnpm", ["exec", "vitest", "run", "--bail", "1"], { stdio: "ignore" }).status !== 0;
    if (!killed) survivors.push(name);
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${name}`);
  }
} finally {
  restore();
}
console.log(`\n${MUTANTS.length - survivors.length}/${MUTANTS.length} mutants killed`);
if (survivors.length) process.exit(1);
