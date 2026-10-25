import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { EmvQrError, parseEmvQr, toWalletPayRequest, validateWalletPayRequest } from "../src/index.js";
import { ROOT } from "./helpers.js";

// The vectors in docs/ are what the upstream draft quotes, so they must match the code.
const vectors = JSON.parse(readFileSync(join(ROOT, "docs", "caip-358-test-vectors.json"), "utf8"));

for (const v of vectors.requestVectors) {
  test(`CAIP-358 request vector ${v.id}`, () => {
    const result = validateWalletPayRequest(v.params, { now: v.now });
    assert.deepEqual(result, v.expected);
    assert.equal(result.valid, v.id.startsWith("request-valid"));
  });
}

for (const v of vectors.mappingVectors) {
  test(`merchant QR mapping vector ${v.id}`, () => {
    const parsed = parseEmvQr(v.qr);
    const req = toWalletPayRequest(parsed, {
      quotes: v.expected.paymentOptions.map((o: { asset: string; recipient: string; types: string[] }) => ({ ...o, amount: undefined, rate: { fiatPerToken: v.input.fiatPerToken, decimals: v.input.tokenDecimals } })),
      now: v.input.now,
      orderId: v.input.orderId,
      fiatAmount: v.input.payerAmount,
      includeMerchantQr: true,
    });
    assert.deepEqual(JSON.parse(JSON.stringify(req)), v.expected);
    assert.equal(validateWalletPayRequest(req, { now: v.input.now }).valid, true);
  });
}

for (const v of vectors.negativeMappingVectors) {
  test(`negative mapping vector ${v.id}`, () => {
    let code = "none";
    try {
      toWalletPayRequest(parseEmvQr(v.qr), { quotes: [{ asset: "solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ/spl:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", recipient: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", types: ["spl-transfer"], rate: { fiatPerToken: "26000", decimals: 6 } }], now: 1740672089, orderId: "x" });
    } catch (e) {
      code = e instanceof EmvQrError ? e.code : String(e);
    }
    assert.equal(code, v.expectedError);
  });
}
