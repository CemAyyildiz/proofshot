import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import { FsStorage, S3Storage, type Storage, captureKey } from "./storage";

/** In-memory stand-in for an S3 bucket, speaking the SDK's command objects. */
function fakeS3() {
  const objects = new Map<string, { body: Uint8Array; contentType?: string }>();
  return {
    objects,
    async send(cmd: unknown) {
      if (cmd instanceof PutObjectCommand) {
        objects.set(cmd.input.Key!, { body: cmd.input.Body as Uint8Array, contentType: cmd.input.ContentType });
        return {};
      }
      if (cmd instanceof GetObjectCommand) {
        const o = objects.get(cmd.input.Key!);
        if (!o) throw Object.assign(new Error("The specified key does not exist."), { name: "NoSuchKey" });
        return { Body: { transformToByteArray: async () => o.body } };
      }
      throw new Error("unexpected command");
    },
  };
}

/** Every Storage implementation must pass the same contract. */
function storageContract(name: string, make: () => Promise<Storage>) {
  describe(`${name} storage contract`, () => {
    const key = captureKey("0b6d1c2a-carrier", "3f1e-claim", `0x${"ab".repeat(32)}`);

    it("round-trips bytes exactly", async () => {
      const s = await make();
      const bytes = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3, 0]);
      await s.put(key, bytes, "image/jpeg");
      expect(await s.get(key)).toEqual(bytes);
    });

    it("returns null for a missing key", async () => {
      expect(await (await make()).get("carrier/claim/captures/missing.jpg")).toBeNull();
    });

    it("refuses keys that could escape a Carrier prefix", async () => {
      const s = await make();
      for (const bad of ["../escape.jpg", "/abs/path.jpg", "carrier/../other/x.jpg", "noslash"]) {
        await expect(s.put(bad, new Uint8Array([1]), "image/jpeg"), bad).rejects.toThrow();
        await expect(s.get(bad), bad).rejects.toThrow();
      }
    });
  });
}

storageContract("filesystem", async () => new FsStorage(await mkdtemp(join(tmpdir(), "ps-fs-"))));
storageContract("s3", async () => new S3Storage(fakeS3(), "proofshot-evidence"));

describe("S3Storage", () => {
  it("writes the content type and the exact key", async () => {
    const s3 = fakeS3();
    await new S3Storage(s3, "b").put("c1/f1/uploads/u1.preview.jpg", new Uint8Array([9]), "image/jpeg");
    expect(s3.objects.get("c1/f1/uploads/u1.preview.jpg")).toEqual({ body: new Uint8Array([9]), contentType: "image/jpeg" });
  });
});
