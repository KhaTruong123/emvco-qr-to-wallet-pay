// Writes docs/caip-358-test-vectors.json: request validation vectors for CAIP-358 and
// informative merchant QR mapping vectors. test/vectors.test.ts checks the file against the code.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EmvQrError, parseEmvQr, toWalletPayRequest, validateWalletPayRequest, type SettlementQuote } from "../src/index.js";

const ROOT = process.cwd();
const NOW = 1740672089;

// The example request from the CAIP-358 text, with the missing comma between the last two options restored.
const SPEC_EXAMPLE = {
  version: 1,
  orderId: "643f31f2-67cd-4172-83cf-3176e8443ab8",
  expiry: 1740672389,
  paymentOptions: [
    { asset: "eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", amount: "0x5F5E100", recipient: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F", types: ["erc3009-authorization"] },
    { asset: "eip155:1/erc20:0x4c9edd5852cd905f086c759e8383e09bff1e68b3", amount: "0x56BC75E2D63100000", recipient: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F", types: ["erc20-transfer", "erc20-approve", "erc2612-permit"] },
    { asset: "solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ/spl:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", amount: "0x5F5E100", recipient: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", types: ["spl-transfer"] },
    { asset: "eip155:1/slip44:60", amount: "0x58D15E17628000", recipient: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F", types: ["native-transfer"] },
    { asset: "solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ/slip44:501", amount: "0x1DCD6500", recipient: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", types: ["native-transfer"] },
  ],
};
const ONE = { ...SPEC_EXAMPLE, paymentOptions: [SPEC_EXAMPLE.paymentOptions[2]!] };
const opt = SPEC_EXAMPLE.paymentOptions[2]!;

const requestVectors = [
  { id: "request-valid-spec-example", description: "Example request from the CAIP-358 text (comma restored)", params: SPEC_EXAMPLE },
  { id: "request-valid-single-option", description: "One SPL transfer option", params: ONE },
  { id: "request-valid-extra-field", description: "Unknown extra field at params level is ignored", params: { ...ONE, merchantQr: { format: "emvco-mpm" } } },
  { id: "request-invalid-missing-version", description: "version is REQUIRED", params: { ...ONE, version: undefined } },
  { id: "request-invalid-version-string", description: "version is an integer, not a string", params: { ...ONE, version: "1" } },
  { id: "request-invalid-order-id-too-long", description: "orderId MUST NOT be longer than 128 characters", params: { ...ONE, orderId: "o".repeat(129) } },
  { id: "request-invalid-expiry-not-integer", description: "expiry is a UNIX timestamp in seconds", params: { ...ONE, expiry: 1740672389.5 } },
  { id: "request-invalid-expired", description: "expiry before the wallet's current time (now = 1740672089 + 301)", params: ONE, now: 1740672390 },
  { id: "request-invalid-empty-options", description: "paymentOptions needs at least one entry", params: { ...ONE, paymentOptions: [] } },
  { id: "request-invalid-amount-decimal", description: "amount is a hex string in smallest units", params: { ...ONE, paymentOptions: [{ ...opt, amount: "100000000" }] } },
  { id: "request-invalid-asset-not-caip19", description: "asset follows CAIP-19", params: { ...ONE, paymentOptions: [{ ...opt, asset: "USDC" }] } },
  { id: "request-invalid-unknown-type", description: "types come from the exclusive version 1 list", params: { ...ONE, paymentOptions: [{ ...opt, types: ["spl-transfer", "bank-transfer"] }] } },
  { id: "request-invalid-empty-types", description: "types is a non-empty array", params: { ...ONE, paymentOptions: [{ ...opt, types: [] }] } },
].map((v) => {
  const params = JSON.parse(JSON.stringify(v.params));
  const result = validateWalletPayRequest(params, { now: v.now ?? NOW });
  return { ...v, params, now: v.now ?? NOW, expected: result };
});

// Illustrative settlement quote: USDC on Solana, rate given per scheme. Not market data.
const solanaUsdc = (fiatPerToken: string): SettlementQuote[] => [
  {
    asset: "solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ/spl:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    recipient: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    types: ["spl-transfer"],
    rate: { fiatPerToken, decimals: 6 },
  },
];
// Amount a payer would type for a static QR, per currency.
const PAYER_AMOUNT: Record<string, string> = { VND: "65000", IDR: "15000", THB: "80", PHP: "120", BRL: "12.50" };
const RATES: Record<string, string> = { VND: "26000", IDR: "16500", THB: "33.5", PHP: "58.2", BRL: "5.6", CNY: "7.2", SGD: "1.3", MYR: "4.4", KHR: "4100", USD: "1" };

const synthetic: Array<{ id: string; scheme: string; payload: string }> = JSON.parse(readFileSync(join(ROOT, "samples/synthetic/payloads.json"), "utf8"));
const realFile = join(ROOT, "samples/real/payloads.json");
const real: Array<{ id: string; scheme: string; payload: string; crcValid: boolean | "noCrc"; sourceUrl: string }> = existsSync(realFile) ? JSON.parse(readFileSync(realFile, "utf8")) : [];

// One real CRC-valid sample per scheme when the corpus has one, else the synthetic sample.
const picks: Array<{ id: string; origin: string; payload: string; sourceUrl?: string }> = [];
for (const scheme of ["napas", "qris", "promptpay", "qrph", "pix"]) {
  // Prefer a dynamic QR that carries its own amount.
  const usable = real.filter((s) => s.scheme === scheme && s.crcValid === true && parseEmvQr(s.payload).currency);
  const r = usable.find((s) => parseEmvQr(s.payload).amount !== undefined) ?? usable[0];
  if (r) picks.push({ id: r.id, origin: "real", payload: r.payload, sourceUrl: r.sourceUrl });
  for (const s of synthetic.filter((x) => x.scheme === scheme).slice(0, r ? 0 : 2)) picks.push({ id: s.id, origin: "synthetic", payload: s.payload });
}
picks.push({
  id: "emvco-spec-appendix-example",
  origin: "real",
  payload: "00020101021229300012D156000000000510A93FO3230Q31280012D15600000001030812345678520441115802CN5914BEST TRANSPORT6007BEIJING64200002ZH0104最佳运输0202北京540523.7253031565502016233030412340603***0708A60086670902ME91320016A0112233449988770708123456786304A13A",
  sourceUrl: "https://www.emvco.com/specifications/emv-qr-code-specification-for-payment-systems-emv-qrcps-merchant-presented-mode/",
});

const mappingVectors = picks.map((pick) => {
  const parsed = parseEmvQr(pick.payload);
  const currency = parsed.currency?.alpha ?? "USD";
  const options = {
    quotes: solanaUsdc(RATES[currency] ?? "1"),
    now: NOW,
    orderId: `order-${pick.id}`.slice(0, 128),
    fiatAmount: parsed.amount === undefined ? (PAYER_AMOUNT[currency] ?? "100") : undefined,
    includeMerchantQr: true,
  };
  return {
    id: `merchant-qr-${pick.id}`,
    origin: pick.origin,
    sourceUrl: pick.sourceUrl,
    qr: pick.payload,
    input: { fiatPerToken: options.quotes[0]!.rate!.fiatPerToken, tokenDecimals: 6, payerAmount: options.fiatAmount, now: NOW, orderId: options.orderId },
    expected: toWalletPayRequest(parsed, options),
  };
});

const tampered = synthetic[1]!.payload.replace("150000", "750000");
const negative = [
  { id: "merchant-qr-negative-crc-mismatch", description: "Amount edited after the CRC was computed. No request may be built.", qr: tampered },
  { id: "merchant-qr-negative-static-no-amount", description: "Static QR and no payer amount. No request may be built.", qr: synthetic[0]!.payload },
].map((v) => {
  let code = "none";
  try {
    toWalletPayRequest(parseEmvQr(v.qr), { quotes: solanaUsdc("26000"), now: NOW, orderId: "x" });
  } catch (e) {
    code = e instanceof EmvQrError ? e.code : String(e);
  }
  return { ...v, expectedError: code };
});

const out = { generatedBy: "scripts/generate-vectors.ts", spec: "CAIP-358 at ChainAgnostic/CAIPs commit 23446e7", requestVectors, mappingVectors, negativeMappingVectors: negative };
writeFileSync(join(ROOT, "docs/caip-358-test-vectors.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`request vectors: ${requestVectors.length}, mapping vectors: ${mappingVectors.length}, negative: ${negative.length}`);
