import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEmvQr } from "../src/index.js";
import { loadCorpus } from "./helpers.js";

const corpus = loadCorpus();

test("corpus is not empty", () => {
  assert.ok(corpus.length > 0);
});

for (const s of corpus) {
  test(`${s.synthetic ? "synthetic" : "real"} ${s.id}: parses, CRC as recorded`, () => {
    const p = parseEmvQr(s.payload);
    if (s.crcValid === "noCrc") assert.equal(p.crc.present, false);
    else assert.equal(p.crc.valid, s.crcValid, `CRC ${p.crc.value} vs computed ${p.crc.computed}`);
    if (s.scheme !== "other" && s.scheme !== "emvco") assert.equal(p.scheme, s.scheme);
  });

  if (s.crcValid === true) {
    test(`${s.id}: a one-character change breaks the CRC`, () => {
      // Change one character inside a value (merchant name, else country, else currency), keeping the TLV structure intact.
      const p = parseEmvQr(s.payload);
      const name = ["59", "58", "53"].map((t) => p.fields.find((f) => f.tag === t && f.length > 0)).find(Boolean);
      assert.ok(name, "sample has a field to change");
      const chars = Array.from(s.payload);
      const at = name.start + 4;
      chars[at] = chars[at] === "Z" ? "Y" : "Z";
      assert.equal(parseEmvQr(chars.join("")).crc.valid, false);
    });
  }
}
