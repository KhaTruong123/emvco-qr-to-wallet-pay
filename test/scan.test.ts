import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parseEmvQr } from "../src/index.js";
import { decodeQrImage } from "../src/scan.js";
import { ROOT } from "./helpers.js";

const synthetic: Array<{ id: string; payload: string; image: string }> = JSON.parse(
  readFileSync(join(ROOT, "samples", "synthetic", "payloads.json"), "utf8"),
);

for (const s of synthetic) {
  test(`scan synthetic image ${s.id}`, async () => {
    const text = await decodeQrImage(join(ROOT, "samples", "synthetic", s.image));
    assert.equal(text, s.payload);
    assert.equal(parseEmvQr(text!).crc.valid, true);
  });
}

const realImagesFile = join(ROOT, "samples", "real", "images.json");
const realImages: Array<{ id: string; file: string; expectedPayload?: string }> = existsSync(realImagesFile)
  ? JSON.parse(readFileSync(realImagesFile, "utf8"))
  : [];

for (const img of realImages) {
  test(`scan real image ${img.id}`, async () => {
    const text = await decodeQrImage(join(ROOT, "samples", "real", img.file));
    assert.ok(text, "QR found");
    if (img.expectedPayload) assert.equal(text, img.expectedPayload);
    else assert.ok(text!.startsWith("000201"), `decoded text is not EMVCo: ${text!.slice(0, 40)}`);
  });
}
