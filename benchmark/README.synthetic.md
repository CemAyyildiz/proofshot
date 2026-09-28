# Proofshot verification benchmark — synthetic harness check

> **Synthetic data.** Generated vector scenes, not photographs. This run only shows that the harness works; it is **not** the SM-2 result. The published result comes from `pnpm bench` on real photos.

Dataset: synthetic (20 generated scenes, 2016×1512), 180 verifications. Run 2026-09-28T11:51:01.093Z in 65 s.

## Result against SM-2 and counter-metrics

| Metric | Measured | Target | |
|---|---|---|---|
| Derived Copy recall, recompression & resize | 100.0% | ≥ 95% | ✅ |
| Altered recall, localized edits ≥ 5% area | 100.0% | ≥ 80% | ✅ |
| SM-C1 false Altered on unedited copies | 0.0% | ≤ 5% | ✅ |
| SM-C2 false match on different scenes | 0.0% | ≤ 1% | ✅ |
| Crops shown as a clean result | 0 | 0 | ✅ |

Thresholds used: `T_match`=31, `T_tile`=36 (chosen by the sweep below), tile-majority match ≥ 12/16, aspect tolerance 2%, more than 8 changed tiles ⇒ geometry change.

## Verdicts by copy type

| Copy | n | Expected | Correct | Breakdown |
|---|---|---|---|---|
| whatsapp-like | 20 | derived-copy:passed | 100.0% | derived-copy:passed 20 |
| x-like | 20 | derived-copy:passed | 100.0% | derived-copy:passed 20 |
| screenshot-like | 20 | derived-copy:passed | 100.0% | derived-copy:passed 20 |
| resize-50 | 20 | derived-copy:passed | 100.0% | derived-copy:passed 20 |
| crop-10 | 20 | derived-copy:unavailable | 0.0% | no-record 20 |
| crop-3-centred | 20 | derived-copy:unavailable | 90.0% | derived-copy:unavailable 18, no-record 2 |
| edit | 40 | altered:failed | 100.0% | altered:failed 40 |
| negative | 20 | no-record | 100.0% | no-record 20 |

## `T_tile` sweep (SM-C1 ceiling 5%)

| T_tile | false Altered | Altered recall |
|---|---|---|
| 24 | 2.5% | 100.0% |
| 28 | 0.0% | 100.0% |
| 32 | 0.0% | 100.0% |
| 36 ← | 0.0% | 100.0% |
| 40 | 0.0% | 97.5% |
| 44 | 0.0% | 97.5% |
| 48 | 0.0% | 87.5% |
| 52 | 0.0% | 82.5% |
| 56 | 0.0% | 72.5% |
| 60 | 0.0% | 62.5% |
| 64 | 0.0% | 60.0% |
| 68 | 0.0% | 47.5% |
| 72 | 0.0% | 37.5% |
| 76 | 0.0% | 37.5% |
| 80 | 0.0% | 30.0% |

## Distance histograms (bits of 256)

Whole-image PDQ distance to the sealed original:

**whatsapp-like**
```
  0–7   ██████████████████████████████ 20
```

**x-like**
```
  0–7   ██████████████████████████████ 20
```

**screenshot-like**
```
  0–7   ██████████████████████████████ 20
```

**resize-50**
```
  0–7   ██████████████████████████████ 20
```

**crop-3-centred**
```
 16–23  █████████ 4
 24–31  ██████████████████████████████ 14
 32–39  ███ 1
 40–47  ███ 1
```

**crop-10**
```
 88–95  ████ 1
 96–103 ███████████████████ 5
104–111 ██████████████████████████████ 8
112–119 ████████████ 3
120–127 ████████ 2
128+ ████ 1
```

**edit**
```
  8–15  ██████████ 5
 16–23  ██████████████████████████████ 15
 24–31  ██████████████████████████ 13
 32–39  ██████████ 5
 40–47  ████ 2
```

Per-tile distance, unedited copies with comparable tiles vs. edited copies:

**unedited tiles**
```
  0–7   █████████████████████████████ 528
  8–15  ██████████████████████████████ 555
 16–23  ███████████ 189
 24–31  █ 8
 32–39  █ 2
 40–47  █ 11
 48–55  ██ 27
 56–63  ██ 23
 64–71  █ 14
 72–79  █ 7
 80–87  █ 18
 88–95  ██ 37
 96–103 ███ 46
104–111 ███ 52
112–119 ███ 42
120–127 ██ 23
128+ █ 18
```

**tiles of edited copies (includes unchanged tiles)**
```
  0–7   ██████████████████████████████ 507
  8–15  █ 5
 16–23  █ 12
 24–31  ██ 25
 32–39  █ 15
 40–47  █ 11
 48–55  ██ 17
 56–63  █ 15
 64–71  █ 13
 72–79  █ 4
 80–87  █ 7
 88–95  █ 6
 96–103 █ 1
104–111 █ 1
112–119 █ 1
```

## Method

- Every original is fingerprinted and registered as a sealed record; each copy is verified against all of them with `computeVerdict` from `packages/fingerprint` — the same code the Public Verifier and `proofshot-verify` run.
- Synthetic transforms: WhatsApp-like (1600 px, JPEG q60), X-like (1200 px, q85), screenshot-like (PNG at 90%), 50% resize, 10% one-edge crop, 3% centred crop. Real platform round-trips are included when present in `data/whatsapp` and `data/x`.
- Edits are localized changes covering ≥ 5% of the image. Negatives are different scenes that look alike (same car model, same room type).
- Recall counts a copy as correct only when it matched its own original.
- Raw per-sample results: `results/synthetic.json`.

## Dataset (real run)

Put files under `benchmark/data/` (gitignored; `data/MANIFEST.md` is committed):

- `originals/<name>.jpg` — photos taken on a phone of damage-like scenes (cars, walls, windows).
- `edits/<name>--<label>.jpg` — generative inpaint edits of `<name>` (add a dent, remove a crack, add a water stain).
- `negatives/<any>.jpg` — near-duplicate *different* scenes.
- optional `whatsapp/<name>.jpg`, `x/<name>.jpg` — the photo after a real send/receive or upload/download.

Then run `pnpm --filter @proofshot/benchmark bench`.
