import { mkdir, readFile, writeFile } from "node:fs/promises";
import { GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { dirname, join, normalize, sep } from "node:path";
import { env } from "@/lib/env";
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
    assertKey(key);
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

/** Rejects keys that could escape a Carrier prefix or address another object. */
function assertKey(key: string) {
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._\/-]+$/.test(key) || key.includes("..") || key.startsWith("/")) throw new Error("invalid storage key");
}

/** Any S3-compatible bucket (AWS S3, Cloudflare R2, MinIO). The bucket must be private. */
export class S3Storage implements Storage {
  constructor(
    private readonly client: Pick<S3Client, "send">,
    private readonly bucket: string,
  ) {}

  async put(key: string, bytes: Uint8Array, contentType: string) {
    assertKey(key);
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: bytes, ContentType: contentType }));
  }

  async get(key: string) {
    assertKey(key);
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return res.Body ? new Uint8Array(await res.Body.transformToByteArray()) : null;
    } catch (e) {
      if (e instanceof NoSuchKey || (e as { name?: string }).name === "NoSuchKey") return null;
      throw e;
    }
  }
}

function createStorage(): Storage {
  const e = env();
  if (e.STORAGE_DRIVER === "s3") {
    if (!e.S3_BUCKET || !e.S3_ACCESS_KEY_ID || !e.S3_SECRET_ACCESS_KEY) throw new Error("STORAGE_DRIVER=s3 needs S3_BUCKET and credentials");
    const client = new S3Client({
      region: e.S3_REGION,
      endpoint: e.S3_ENDPOINT,
      credentials: { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY },
    });
    return new S3Storage(client, e.S3_BUCKET);
  }
  // STORAGE_DIR is an absolute path; the default is statically scoped so builds don't trace the whole project.
  return new FsStorage(e.STORAGE_DIR || join(process.cwd(), ".data", "storage"));
}

export function getStorage(): Storage {
  return processSingleton("storage", createStorage);
}
