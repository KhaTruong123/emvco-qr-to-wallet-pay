// Runs the parser over the whole corpus and writes docs/evidence/results.md and results.json.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EmvQrError, parseEmvQr } from "../src/index.js";
import { decodeQrImage } from "../src/scan.js";

const ROOT = process.cwd();
const read = (p: string) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));

interface Sample {
  id: string;
  scheme: string;
  payload: string;
  crcValid?: boolean | "noCrc";
}
const real: Sample[] = existsSync(join(ROOT, "samples/real/payloads.json")) ? read("samples/real/payloads.json") : [];
const synthetic: Sample[] = read("samples/synthetic/payloads.json");

interface RowResult {
  id: string;
  origin: "real" | "synthetic";
  expectedScheme: string;
  detectedScheme?: string;
  parsed: boolean;
  crcValid?: boolean;
  crcExpected: boolean | "noCrc";
  matchesExpectation: boolean;
  issues: string[];
  error?: string;
}

const rows: RowResult[] = [];
for (const [origin, list] of [["real", real], ["synthetic", synthetic]] as const) {
  for (const s of list) {
    const crcExpected = origin === "synthetic" ? true : (s.crcValid ?? true);
    try {
      const p = parseEmvQr(s.payload);
      const crcOk = crcExpected === "noCrc" ? !p.crc.present : p.crc.valid === crcExpected;
      rows.push({
        id: s.id,
        origin,
        expectedScheme: s.scheme,
        detectedScheme: p.scheme,
        parsed: true,
        crcValid: p.crc.valid,
        crcExpected,
        matchesExpectation: crcOk,
        issues: p.issues.map((i) => `${i.level}:${i.code}${i.tag ? `:${i.tag}` : ""}`),
      });
    } catch (e) {
      rows.push({ id: s.id, origin, expectedScheme: s.scheme, parsed: false, crcExpected, matchesExpectation: false, issues: [], error: e instanceof EmvQrError ? `${e.code}: ${e.message}` : String(e) });
    }
  }
}

interface ImageRow {
  id: string;
  origin: "real" | "synthetic";
  scheme: string;
  decoded: boolean;
  parsed: boolean;
  crcValid?: boolean;
  matchesExpected?: boolean;
}
const images: ImageRow[] = [];
const realImages: Array<{ id: string; file: string; scheme: string; expectedPayload?: string }> = existsSync(join(ROOT, "samples/real/images.json"))
  ? read("samples/real/images.json")
  : [];
const imageJobs = [
  ...realImages.map((i) => ({ id: i.id, origin: "real" as const, scheme: i.scheme, file: join(ROOT, "samples/real", i.file), expected: i.expectedPayload })),
  ...(synthetic as Array<Sample & { image: string }>).map((s) => ({ id: s.id, origin: "synthetic" as const, scheme: s.scheme, file: join(ROOT, "samples/synthetic", s.image), expected: s.payload })),
];
for (const job of imageJobs) {
  const text = await decodeQrImage(job.file);
  let parsed = false;
  let crcValid: boolean | undefined;
  if (text) {
    try {
      crcValid = parseEmvQr(text).crc.valid;
      parsed = true;
    } catch {
      parsed = false;
    }
  }
  images.push({ id: job.id, origin: job.origin, scheme: job.scheme, decoded: !!text, parsed, crcValid, matchesExpected: job.expected ? text === job.expected : undefined });
}

const schemes = [...new Set(rows.map((r) => r.expectedScheme))].sort();
const table = (origin: "real" | "synthetic") => {
  const lines = ["| Scheme | Samples | Parsed OK | CRC OK | CRC fail (expected) | No CRC | Matches recorded CRC status | Scheme detected as expected |", "|---|---|---|---|---|---|---|---|"];
  for (const sc of schemes) {
    const r = rows.filter((x) => x.origin === origin && x.expectedScheme === sc);
    if (!r.length) continue;
    const schemeOk = r.filter((x) => ["other", "emvco"].includes(sc) || x.detectedScheme === sc).length;
    lines.push(`| ${sc} | ${r.length} | ${r.filter((x) => x.parsed).length} | ${r.filter((x) => x.crcValid).length} | ${r.filter((x) => x.crcExpected === false).length} | ${r.filter((x) => x.crcExpected === "noCrc").length} | ${r.filter((x) => x.matchesExpectation).length} | ${schemeOk} |`);
  }
  const r = rows.filter((x) => x.origin === origin);
  lines.push(`| **total** | **${r.length}** | **${r.filter((x) => x.parsed).length}** | **${r.filter((x) => x.crcValid).length}** | **${r.filter((x) => x.crcExpected === false).length}** | **${r.filter((x) => x.crcExpected === "noCrc").length}** | **${r.filter((x) => x.matchesExpectation).length}** | |`);
  return lines.join("\n");
};
const imageTable = () => {
  const lines = ["| Origin | Scheme | Images | QR decoded | Parsed OK | CRC OK |", "|---|---|---|---|---|---|"];
  const keys = [...new Set(images.map((i) => `${i.origin}|${i.scheme}`))].sort();
  for (const k of keys) {
    const [origin, scheme] = k.split("|");
    const r = images.filter((i) => i.origin === origin && i.scheme === scheme);
    lines.push(`| ${origin} | ${scheme} | ${r.length} | ${r.filter((i) => i.decoded).length} | ${r.filter((i) => i.parsed).length} | ${r.filter((i) => i.crcValid).length} |`);
  }
  return lines.join("\n");
};

const mismatches = rows.filter((r) => !r.matchesExpectation || !r.parsed);
const md = `# Corpus results

Generated by \`npm run evidence\` (scripts/evidence.ts). Do not edit by hand.

- Generated: ${new Date().toISOString()}
- Node: ${process.version}

"CRC fail (expected)" counts real samples whose published CRC is wrong at the source. They are kept as negative test vectors, and the parser must report them as failing. See samples/SOURCES.md for each sample's origin.

## Real payloads (public sources)

${table("real")}

## Synthetic payloads (built by this library, not real merchants)

${table("synthetic")}

## QR images decoded by the scan CLI

${imageTable()}

## Samples that did not match the recorded expectation

${mismatches.length ? mismatches.map((m) => `- ${m.id}: ${m.error ?? `crcValid=${m.crcValid}, expected ${m.crcExpected}`}`).join("\n") : "None."}

## Issues reported by the parser (real payloads)

${rows.filter((r) => r.origin === "real" && r.issues.length).map((r) => `- ${r.id}: ${r.issues.join(", ")}`).join("\n") || "None."}
`;
writeFileSync(join(ROOT, "docs/evidence/results.md"), md);
writeFileSync(join(ROOT, "docs/evidence/results.json"), JSON.stringify({ payloads: rows, images }, null, 2) + "\n");
console.log(md);
