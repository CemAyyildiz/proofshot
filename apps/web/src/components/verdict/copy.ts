import { formatDateTime } from "@/lib/format";

export type VerdictKind = "original" | "derived-copy" | "altered" | "no-record";
export type AlterationCheck = "passed" | "failed" | "unavailable" | null;

export interface VerdictView {
  verdict: VerdictKind;
  alterationCheck: AlterationCheck;
  alteredTiles: number[];
  record: { kind: "sealed" | "imported"; sealedAt: Date } | null;
}

export const CROP_WARNING = "Cropped copy — alteration check not possible. Request the original from the sender.";

/**
 * What each Verdict means and does not mean (PRD §12 "Honest Verdicts"). One place, so the Verifier, the
 * Receipts and the Console never drift apart.
 */
export function verdictCopy(v: VerdictView) {
  const imported = v.record?.kind === "imported";
  const when = v.record ? `${imported ? "imported" : "sealed"} ${formatDateTime(v.record.sealedAt)}` : "";
  const subject = imported ? "an imported record" : "a photo";
  switch (v.verdict) {
    case "original":
      return {
        title: "Original",
        summary: `Identical to a photo ${when}.`,
        means: "This file is exactly the photo that was sealed. Not a single byte has changed.",
        doesNotMean: "A Seal proves when and on which device the photo was sealed. It does not prove the scene is what anyone says it is.",
      };
    case "derived-copy":
      return v.alterationCheck === "unavailable"
        ? {
            title: "Derived Copy",
            warning: CROP_WARNING,
            summary: `Matches ${subject} ${when}, but this copy was cropped or reframed, so changes can't be ruled out.`,
            means: "The picture matches the sealed one, but its regions no longer line up for comparison.",
            doesNotMean: "It does not mean the copy is unaltered.",
          }
        : {
            title: "Derived Copy",
            summary: `A re-saved copy of ${subject} ${when}. No regions were changed.`,
            means: "The picture matches; only the file changed, for example when a messaging app compressed it.",
            doesNotMean: "A Seal proves when and on which device the photo was sealed. It does not prove the scene is what anyone says it is.",
          };
    case "altered": {
      const n = v.alteredTiles.length;
      return {
        title: "Altered",
        summary: `Matches ${subject} ${when}, but ${n} of 16 regions were changed after ${imported ? "import" : "sealing"}.`,
        means: "The highlighted regions differ from the sealed photo.",
        doesNotMean: "It does not say who changed the photo or why. Ask the sender for the original.",
      };
    }
    case "no-record":
      return {
        title: "No Record",
        summary: "This image was not sealed with Proofshot.",
        means: "There is no Seal to check this image against.",
        doesNotMean: "No Record does not mean the image is fake.",
      };
  }
}

export const IMPORTED_NOTE =
  "This match is against fingerprints a carrier imported from its own records. Imported records carry no device signature.";
