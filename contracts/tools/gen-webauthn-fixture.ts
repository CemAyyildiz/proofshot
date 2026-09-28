/**
 * Writes test/fixtures/webauthn-software.json: a Seal assertion from a software P-256 authenticator.
 * Real-device fixtures come from the /spike/passkey page in the web app.
 *
 *   pnpm --filter @proofshot/contracts fixtures
 */
import { writeFileSync } from "node:fs";
import { hexToBytes, sealChallenge, type CaptureRecord } from "@proofshot/shared";
import { FLAGS_UP_BE_BS, SoftwareAuthenticator, sampleRecordFields } from "./software-authenticator";

const record: CaptureRecord = { ...sampleRecordFields("fixture"), deviceTime: 1_790_000_000n, refBlock: 1_000n };
const authenticator = new SoftwareAuthenticator();
const challenge = sealChallenge(record);

const fixture = {
  source: "software P-256 (tools/software-authenticator.ts)",
  keyId: authenticator.keyId,
  qx: authenticator.qx,
  qy: authenticator.qy,
  record: { ...record, deviceTime: Number(record.deviceTime), refBlock: Number(record.refBlock) },
  challenge,
  auth: authenticator.assert(hexToBytes(challenge)),
  authNoUV: authenticator.assert(hexToBytes(challenge), FLAGS_UP_BE_BS),
};
const out = new URL("../test/fixtures/webauthn-software.json", import.meta.url);
writeFileSync(out, JSON.stringify(fixture, null, 2) + "\n");
console.log(`wrote ${out.pathname}`);
