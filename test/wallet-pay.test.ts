import assert from "node:assert/strict";
import { test } from "node:test";
import { buildVietQr, EmvQrError, parseEmvQr, toJsonRpcRequest, tokenUnitsFor, toWalletPayRequest } from "../src/index.js";
import { usdcQuotes, PAYER_AMOUNT } from "./fixtures.js";
import { loadCorpus, matchSnapshot } from "./helpers.js";

const NOW = 1761350400; // 2025-10-25T00:00:00Z, fixed so snapshots are stable

function errorCode(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof EmvQrError) return e.code;
    throw e;
  }
  return "no error";
}

test("tokenUnitsFor uses exact integer math and rounds up", () => {
  assert.equal(tokenUnitsFor("150000", "26000", 6), 5_769_231n); // 5.769230769... USDC
  assert.equal(tokenUnitsFor("100", "1", 6), 100_000_000n);
  assert.equal(tokenUnitsFor("120.50", "33.5", 6), 3_597_015n);
  assert.equal(tokenUnitsFor("0.01", "3", 0), 1n);
});

test("dynamic VietQR maps to a spec-shaped request; orderId comes from the bill number", () => {
  const parsed = parseEmvQr(buildVietQr({ bankBin: "970422", accountNumber: "000000000002", amount: "150000", additionalData: [["01", "INV-0042"]], merchantName: "SYNTHETIC SHOP", merchantCity: "HO CHI MINH" }));
  const req = toWalletPayRequest(parsed, { quotes: usdcQuotes("VND"), now: NOW });
  assert.deepEqual(Object.keys(req), ["version", "orderId", "expiry", "paymentOptions"]);
  assert.equal(req.version, 1);
  assert.equal(req.orderId, "INV-0042");
  assert.equal(req.expiry, NOW + 300);
  assert.equal(req.paymentOptions[0]?.amount, "0x" + (5_769_231).toString(16).toUpperCase());
  assert.deepEqual(Object.keys(req.paymentOptions[0] ?? {}), ["asset", "amount", "recipient", "types"]);
  const rpc = toJsonRpcRequest(req, 7);
  assert.equal(rpc.method, "wallet_pay");
  assert.equal(rpc.jsonrpc, "2.0");
});

test("static QR needs the payer's amount", () => {
  const parsed = parseEmvQr(buildVietQr({ bankBin: "970436", accountNumber: "1", merchantName: "X", merchantCity: "Y" }));
  assert.equal(errorCode(() => toWalletPayRequest(parsed, { quotes: usdcQuotes("VND"), now: NOW })), "AMOUNT_REQUIRED");
  const req = toWalletPayRequest(parsed, { quotes: usdcQuotes("VND"), now: NOW, fiatAmount: "65000", includeMerchantQr: true });
  assert.equal(req.merchantQr?.fiat.amountSource, "payer");
  // A static QR is reused for many payments, so its data cannot be the orderId.
  assert.match(req.orderId, /^[0-9a-f-]{36}$/);
});

test("option validation", () => {
  const parsed = parseEmvQr(buildVietQr({ bankBin: "970436", accountNumber: "1", amount: "1000", merchantName: "X", merchantCity: "Y" }));
  assert.equal(errorCode(() => toWalletPayRequest(parsed, { quotes: [], now: NOW })), "QUOTE_REQUIRED");
  assert.equal(errorCode(() => toWalletPayRequest(parsed, { quotes: usdcQuotes("VND"), now: NOW, fiatAmount: "2000" })), "INVALID_OPTION");
  assert.equal(errorCode(() => toWalletPayRequest(parsed, { quotes: [{ ...usdcQuotes("VND")[0]!, asset: "usdc" }], now: NOW })), "INVALID_OPTION");
  assert.equal(errorCode(() => toWalletPayRequest(parsed, { quotes: [{ ...usdcQuotes("VND")[0]!, types: ["ach-transfer" as never] }], now: NOW })), "INVALID_OPTION");
  assert.equal(errorCode(() => toWalletPayRequest(parsed, { quotes: usdcQuotes("VND"), now: NOW, orderId: "x".repeat(129) })), "INVALID_OPTION");
  assert.equal(errorCode(() => toWalletPayRequest(parsed, { quotes: usdcQuotes("VND"), now: NOW, expiry: NOW - 1 })), "INVALID_OPTION");
  const bad = parseEmvQr(parsed.payload.slice(0, -1) + (parsed.payload.endsWith("0") ? "1" : "0"));
  assert.equal(errorCode(() => toWalletPayRequest(bad, { quotes: usdcQuotes("VND"), now: NOW })), "CRC_MISMATCH");
});

test("explicit quote amount is passed through as hex", () => {
  const parsed = parseEmvQr(buildVietQr({ bankBin: "970436", accountNumber: "1", amount: "1000", merchantName: "X", merchantCity: "Y" }));
  const req = toWalletPayRequest(parsed, { quotes: [{ ...usdcQuotes("VND")[0]!, rate: undefined, amount: "100000000" }], now: NOW, orderId: "o" });
  assert.equal(req.paymentOptions[0]?.amount, "0x5F5E100");
});

test("mapping snapshots for every CRC-valid sample", () => {
  const out: Record<string, unknown> = {};
  for (const s of loadCorpus()) {
    if (s.crcValid !== true) continue;
    const parsed = parseEmvQr(s.payload);
    const currency = parsed.currency?.alpha ?? "USD";
    try {
      out[s.id] = toWalletPayRequest(parsed, {
        quotes: usdcQuotes(currency),
        now: NOW,
        orderId: `order-${s.id}`.slice(0, 128),
        fiatAmount: parsed.amount === undefined ? (PAYER_AMOUNT[currency] ?? "10") : undefined,
        includeMerchantQr: true,
      });
    } catch (e) {
      out[s.id] = { error: e instanceof EmvQrError ? e.code : String(e) };
    }
  }
  matchSnapshot("wallet-pay-requests", out);
});
