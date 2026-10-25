import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/** Repo root. Tests run from dist/test/, two levels below it. */
export const ROOT = fileURLToPath(new URL("../../", import.meta.url));

export interface CorpusSample {
  id: string;
  scheme: string;
  payload: string;
  crcValid: boolean | "noCrc";
  synthetic: boolean;
  sourceUrl?: string;
}

/** Real samples (samples/real/payloads.json) and synthetic samples, in one list. */
export function loadCorpus(): CorpusSample[] {
  const out: CorpusSample[] = [];
  const realFile = join(ROOT, "samples", "real", "payloads.json");
  if (existsSync(realFile)) {
    for (const s of JSON.parse(readFileSync(realFile, "utf8"))) out.push({ ...s, synthetic: false });
  }
  for (const s of JSON.parse(readFileSync(join(ROOT, "samples", "synthetic", "payloads.json"), "utf8"))) {
    out.push({ ...s, crcValid: true, synthetic: true });
  }
  return out;
}

/** Compares `value` with test/snapshots/<name>.json. Set UPDATE_SNAPSHOTS=1 to rewrite. */
export function matchSnapshot(name: string, value: unknown): void {
  const dir = join(ROOT, "test", "snapshots");
  const file = join(dir, `${name}.json`);
  const text = JSON.stringify(value, null, 2) + "\n";
  if (process.env.UPDATE_SNAPSHOTS === "1" || !existsSync(file)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, text);
    return;
  }
  assert.equal(text, readFileSync(file, "utf8"), `snapshot ${name} changed; rerun with UPDATE_SNAPSHOTS=1 if intended`);
}
