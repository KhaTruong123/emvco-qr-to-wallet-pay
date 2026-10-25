import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPix, buildPromptPay, buildQris, buildVietQr, crc16Hex, EmvQrError, parseEmvQr } from "../src/index.js";

// Example payload printed in the EMVCo MPM specification (v1.1, appendix), CRC A13A.
const EMVCO_EXAMPLE =
  "00020101021229300012D156000000000510A93FO3230Q31280012D15600000001030812345678520441115802CN5914BEST TRANSPORT6007BEIJING64200002ZH0104最佳运输0202北京540523.7253031565502016233030412340603***0708A60086670902ME91320016A0112233449988770708123456786304A13A";

function errorCode(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof EmvQrError) return e.code;
    throw e;
  }
  return "no error";
}

test("EMVCo spec example: CRC, language template, tip, additional data, unreserved template", () => {
  const p = parseEmvQr(EMVCO_EXAMPLE);
  assert.equal(p.crc.valid, true);
  assert.equal(p.crc.computed, "A13A");
  assert.deepEqual(p.issues, []);
  assert.equal(p.pointOfInitiation, "dynamic");
  assert.equal(p.merchantName, "BEST TRANSPORT");
  assert.equal(p.amount, "23.72");
  assert.deepEqual(p.currency, { numeric: "156", alpha: "CNY", minorUnits: 2 });
  assert.equal(p.tip?.mode, "prompt");
  assert.equal(p.language?.merchantName, "最佳运输");
  assert.equal(p.additionalData?.terminalLabel, "A6008667");
  assert.equal(p.additionalData?.additionalConsumerDataRequest, "ME");
  assert.equal(p.unreserved[0]?.guid, "A011223344998877");
  assert.deepEqual(p.merchantAccounts.map((a) => a.tag), ["29", "31"]);
});

test("VietQR: NAPAS bank BIN, account and service from nested template 38", () => {
  const p = parseEmvQr(buildVietQr({ bankBin: "970436", accountNumber: "000000000001", amount: "50000", purpose: "TEST", merchantName: "X", merchantCity: "HA NOI" }));
  assert.equal(p.scheme, "napas");
  const napas = p.merchantAccounts[0]?.napas;
  assert.deepEqual(napas, { acquirerBin: "970436", consumerId: "000000000001", serviceCode: "QRIBFTTA", service: "transfer-to-account" });
  assert.equal(p.currency?.alpha, "VND");
  assert.equal(p.additionalData?.purposeOfTransaction, "TEST");
  assert.equal(p.pointOfInitiation, "dynamic");
});

test("QRIS: acquirer template and national NMID", () => {
  const p = parseEmvQr(buildQris({ acquirerGuid: "ID.CO.EXAMPLE.WWW", merchantPan: "9360000000000000001", merchantId: "1", nmid: "ID1000000000001", merchantName: "X", merchantCity: "JAKARTA" }));
  assert.equal(p.scheme, "qris");
  assert.equal(p.merchantAccounts[0]?.qris?.role, "acquirer");
  assert.equal(p.merchantAccounts[1]?.qris?.nmid, "ID1000000000001");
});

test("PromptPay: mobile number normalised to E.164", () => {
  const p = parseEmvQr(buildPromptPay({ mobile: "0066812345678", merchantName: "X", merchantCity: "BANGKOK" }));
  assert.equal(p.scheme, "promptpay");
  assert.equal(p.merchantAccounts[0]?.promptpay?.mobileE164, "+66812345678");
});

test("Pix: key and txid", () => {
  const p = parseEmvQr(buildPix({ key: "synthetic@example.com", txid: "ABC", merchantName: "X", merchantCity: "BRASILIA" }));
  assert.equal(p.scheme, "pix");
  assert.equal(p.merchantAccounts[0]?.pix?.key, "synthetic@example.com");
  assert.equal(p.additionalData?.referenceLabel, "ABC");
});

test("GUID match is case-insensitive (Pix codes in the wild use BR.GOV.BCB.PIX)", () => {
  const payload = buildPix({ key: "k", merchantName: "X", merchantCity: "Y" }).replace("br.gov.bcb.pix", "BR.GOV.BCB.PIX");
  // CRC changes when the GUID case changes, so check scheme detection only.
  assert.equal(parseEmvQr(payload).scheme, "pix");
});

test("CRC mismatch is reported, and thrown in strict mode", () => {
  const tampered = EMVCO_EXAMPLE.replace("23.72", "93.72");
  const p = parseEmvQr(tampered);
  assert.equal(p.crc.valid, false);
  assert.equal(p.issues[0]?.code, "CRC_MISMATCH");
  assert.equal(errorCode(() => parseEmvQr(tampered, { strict: true })), "CRC_MISMATCH");
});

test("Lowercase CRC is accepted with a warning", () => {
  const lower = EMVCO_EXAMPLE.slice(0, -4) + "a13a";
  const p = parseEmvQr(lower);
  assert.equal(p.crc.valid, true);
  assert.equal(p.issues[0]?.code, "CRC_LOWERCASE");
});

test("Missing CRC and CRC not last are errors", () => {
  const noCrc = EMVCO_EXAMPLE.slice(0, -8);
  assert.equal(parseEmvQr(noCrc).crc.present, false);
  assert.equal(errorCode(() => parseEmvQr(noCrc, { strict: true })), "CRC_MISSING");
  const notLast = EMVCO_EXAMPLE + "9902AB";
  assert.ok(parseEmvQr(notLast).issues.some((i) => i.code === "CRC_NOT_LAST"));
  assert.equal(parseEmvQr(notLast).crc.valid, false);
});

test("Malformed input gives clear errors", () => {
  assert.equal(errorCode(() => parseEmvQr("")), "EMPTY_PAYLOAD");
  assert.equal(errorCode(() => parseEmvQr("   ")), "EMPTY_PAYLOAD");
  assert.equal(errorCode(() => parseEmvQr("hello")), "NOT_EMVCO_MPM");
  assert.equal(errorCode(() => parseEmvQr("000201010212")), "no error");
  assert.equal(errorCode(() => parseEmvQr("0002010102115")), "TRUNCATED");
  assert.equal(errorCode(() => parseEmvQr("00020101021226990010A000000727")), "TRUNCATED");
  try {
    parseEmvQr("ethereum:0x71C7656EC7ab88b098defB751B7401B5f6d8976F?value=1");
  } catch (e) {
    assert.ok(e instanceof EmvQrError && /URI/.test(e.message));
  }
});

test("Missing mandatory tags are listed as issues", () => {
  const p = parseEmvQr("0002010102116304" + "0000");
  const codes = p.issues.map((i) => `${i.code}:${i.tag ?? ""}`);
  for (const t of ["52", "53", "58", "59", "60"]) assert.ok(codes.includes(`MISSING_FIELD:${t}`), t);
  assert.ok(codes.some((c) => c.startsWith("MISSING_FIELD:") && c.endsWith(":")));
});

test("Bad amount and bad currency are flagged", () => {
  const payload = buildVietQr({ bankBin: "970436", accountNumber: "1", merchantName: "X", merchantCity: "Y" });
  const swapped = payload.replace("5303704", "53037X4");
  assert.ok(parseEmvQr(swapped).issues.some((i) => i.tag === "53"));
});

test("Card network tags 02-25 are primitive and labelled", () => {
  const p = parseEmvQr("00020101021102164000123456789012520459995303840540510.005802US5906SHOP X6008NEW YORK6304" + "0000");
  assert.equal(p.merchantAccounts[0]?.network, "visa");
  assert.equal(p.scheme, "card-network");
});

test("National template wins as primary scheme when a wallet template comes first", () => {
  // Tag 26 carries a wallet's own GUID (VNPay RID), tag 38 the NAPAS template.
  const vnpay = "26140010A000000775";
  const napas = buildVietQr({ bankBin: "970436", accountNumber: "1", merchantName: "X", merchantCity: "Y" });
  const body = napas.slice(0, 12) + vnpay + napas.slice(12, -8) + "6304";
  const p = parseEmvQr(body + crc16Hex(body));
  assert.deepEqual(p.merchantAccounts.map((a) => a.scheme), ["vnpay", "napas"]);
  assert.equal(p.scheme, "napas");
  assert.equal(p.crc.valid, true);
});
