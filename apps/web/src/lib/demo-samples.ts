/**
 * Sample images for trying the product without a phone: an illustrated parked car that was sealed on Monad mainnet
 * through the ordinary capture flow, and copies made from that exact file. They only mean something against the
 * Registry they were sealed in, so they are offered on that deployment and nowhere else.
 */
export interface DemoSample {
  id: "original" | "recompressed" | "edited" | "unrelated";
  /** Public path of the file. */
  src: string;
  thumb: string;
  filename: string;
  label: string;
  detail: string;
}

export const DEMO_SAMPLES_SEALED_ON = {
  chainId: 143,
  registry: "0xa6989c9f93d70526c1b982a5a408df240575e433",
  sealedOn: "7 October 2026",
  /** The sample's Seal Receipt. */
  receipt: "/r/0x1e6588ab77ec6141583674e3bba43e04a51736639bb4811b20eb2ed20bc8a87e",
} as const;

export const DEMO_SAMPLES: DemoSample[] = [
  {
    id: "original",
    src: "/demo/sealed-original.jpg",
    thumb: "/demo/thumb-sealed-original.jpg",
    filename: "sealed-original.jpg",
    label: "The sealed original",
    detail: "Exactly the file that was sealed.",
  },
  {
    id: "recompressed",
    src: "/demo/whatsapp-copy.jpg",
    thumb: "/demo/thumb-whatsapp-copy.jpg",
    filename: "recompressed-copy.jpg",
    label: "A recompressed copy",
    detail: "Shrunk and re-saved, as a messaging app does.",
  },
  {
    id: "edited",
    src: "/demo/edited-copy.jpg",
    thumb: "/demo/thumb-edited-copy.jpg",
    filename: "edited-copy.jpg",
    label: "An edited copy",
    detail: "A dent painted onto the door after sealing.",
  },
  {
    id: "unrelated",
    src: "/demo/unrelated-photo.jpg",
    thumb: "/demo/thumb-unrelated-photo.jpg",
    filename: "unrelated-photo.jpg",
    label: "A different photo",
    detail: "A cracked wall that was never sealed.",
  },
];

/** The samples, if this deployment reads the Registry they were sealed in; otherwise none. */
export function demoSamples(chainId: number, registry: string | undefined): DemoSample[] {
  return chainId === DEMO_SAMPLES_SEALED_ON.chainId && registry?.toLowerCase() === DEMO_SAMPLES_SEALED_ON.registry ? DEMO_SAMPLES : [];
}

/** Fetches a sample as the `File` a person would have picked. */
export async function loadDemoSample(sample: DemoSample): Promise<File> {
  const res = await fetch(sample.src);
  if (!res.ok) throw new Error(`sample ${sample.id} responded ${res.status}`);
  return new File([await res.blob()], sample.filename, { type: "image/jpeg" });
}
