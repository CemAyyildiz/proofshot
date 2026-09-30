"use client";

import type { Hex } from "@proofshot/shared";
import type { SealFailure } from "./seal-pipeline";

/**
 * On-device store for Captures. The photo stays here until it is sent to the insurer or discarded, so a
 * failed Seal or a closed tab never loses evidence (FR-5).
 */
export type CaptureStatus = "processing" | "sealing" | "sealed" | "failed" | "sent";

export interface StoredCapture {
  id: string;
  token: string;
  createdAt: number;
  blob: Blob;
  status: CaptureStatus;
  error?: string;
  /** Why it failed; offline failures are retried automatically when the connection returns. */
  failure?: SealFailure;
  exactHash?: Hex;
  receiptUrl?: string;
  sealMs?: number;
  /** Location Commitment inputs; never leave the device except the salt, which goes to the Carrier. */
  location?: { lat: number; lon: number; salt: Hex };
}

const DB_NAME = "proofshot";
const STORE = "captures";

let dbPromise: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("token", "token");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const putCapture = (c: StoredCapture) => run("readwrite", (s) => s.put(c)).then(() => undefined);
export const deleteCapture = (id: string) => run("readwrite", (s) => s.delete(id)).then(() => undefined);

export async function listCaptures(token: string): Promise<StoredCapture[]> {
  const rows = await run<StoredCapture[]>("readonly", (s) => s.index("token").getAll(token));
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}
