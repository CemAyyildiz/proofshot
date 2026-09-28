import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import { processSingleton } from "./singleton";

/**
 * Carrier-scoped image storage (FR-6, NFR-5). Keys always start with the Carrier's id, so one Carrier's
 * files can never be addressed through another Carrier's scope. Image bytes never go onchain.
 */
export interface Storage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
}

export const captureKey = (carrierId: string, claimFileId: string, exactHash: string) =>
  `${carrierId}/${claimFileId}/captures/${exactHash}.jpg`;

/** Local filesystem storage for development, tests and single-node deployments. */
export class FsStorage implements Storage {
  constructor(private readonly root: string) {}

  private path(key: string) {
    const p = normalize(join(this.root, key));
    if (!p.startsWith(normalize(this.root) + sep)) throw new Error("invalid storage key");
    return p;
  }

  // Content type only matters to object stores; files keep their extension.
  async put(key: string, bytes: Uint8Array) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, bytes);
  }

  async get(key: string) {
    try {
      return new Uint8Array(await readFile(this.path(key)));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }
}

export function getStorage(): Storage {
  return processSingleton("storage", () => new FsStorage(join(process.cwd(), process.env.STORAGE_DIR ?? ".data/storage")));
}
