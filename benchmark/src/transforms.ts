import sharp from "sharp";

/**
 * Synthetic stand-ins for how claim photos travel. Real platform round-trips (WhatsApp, X) are measured from
 * files placed in data/whatsapp and data/x; these keep the benchmark runnable without them.
 */
export const TRANSFORMS = {
  /** WhatsApp "standard quality": longest side 1600 px, heavy JPEG. */
  "whatsapp-like": (b: Buffer) => sharp(b).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 60 }).toBuffer(),
  /** X/Twitter upload: longest side 1200 px, JPEG q85. */
  "x-like": (b: Buffer) => sharp(b).rotate().resize(1200, 1200, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer(),
  /** Screenshot of the photo on screen: PNG at 90% scale. */
  "screenshot-like": async (b: Buffer) => {
    const m = await sharp(b).rotate().metadata();
    return sharp(b).rotate().resize(Math.round((m.autoOrient?.width ?? m.width!) * 0.9)).png().toBuffer();
  },
  "resize-50": async (b: Buffer) => {
    const m = await sharp(b).rotate().metadata();
    return sharp(b).rotate().resize(Math.round((m.autoOrient?.width ?? m.width!) * 0.5)).jpeg({ quality: 85 }).toBuffer();
  },
  /** 10% crop from one edge — the FR-8 crop case. */
  "crop-10": async (b: Buffer) => {
    const { data, info } = await sharp(b).rotate().toBuffer({ resolveWithObject: true });
    return sharp(data).extract({ left: 0, top: 0, width: Math.round(info.width * 0.9), height: info.height }).jpeg({ quality: 90 }).toBuffer();
  },
  /** 3% centred crop (zoom): same aspect ratio, every tile shifts. */
  "crop-3-centred": async (b: Buffer) => {
    const { data, info } = await sharp(b).rotate().toBuffer({ resolveWithObject: true });
    const w = Math.round(info.width * 0.97);
    const h = Math.round(info.height * 0.97);
    return sharp(data).extract({ left: Math.round((info.width - w) / 2), top: Math.round((info.height - h) / 2), width: w, height: h }).jpeg({ quality: 90 }).toBuffer();
  },
} as const;

export type TransformName = keyof typeof TRANSFORMS;

/** What the Verdict should be for each kind of copy (FR-8, FR-11). */
export const EXPECTED: Record<TransformName | "edit" | "negative", string[]> = {
  "whatsapp-like": ["derived-copy:passed"],
  "x-like": ["derived-copy:passed"],
  "screenshot-like": ["derived-copy:passed"],
  "resize-50": ["derived-copy:passed"],
  "crop-10": ["derived-copy:unavailable"],
  "crop-3-centred": ["derived-copy:unavailable"],
  edit: ["altered:failed"],
  negative: ["no-record"],
};
