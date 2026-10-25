import assert from "node:assert/strict";
import { test } from "node:test";
import { crc16Ccitt, crc16Hex, decodeTlv, encodeTlv, EmvQrError } from "../src/index.js";

test("CRC-16/CCITT-FALSE check value for '123456789' is 0x29B1", () => {
  assert.equal(crc16Ccitt("123456789"), 0x29b1);
  assert.equal(crc16Hex("123456789"), "29B1");
});

test("CRC hex is zero-padded to 4 characters", () => {
  assert.equal(crc16Hex("").length, 4);
  assert.equal(crc16Hex(""), "FFFF");
});

test("TLV decodes flat fields with offsets", () => {
  assert.deepEqual(decodeTlv("000201010211"), [
    { tag: "00", length: 2, value: "01", start: 0 },
    { tag: "01", length: 2, value: "11", start: 6 },
  ]);
});

test("TLV length counts characters, not UTF-8 bytes", () => {
  const [f] = decodeTlv("0104最佳运输");
  assert.equal(f?.value, "最佳运输");
});

test("TLV round trip", () => {
  const encoded = encodeTlv("59", "BEST TRANSPORT");
  assert.equal(encoded, "5914BEST TRANSPORT");
  assert.equal(decodeTlv(encoded)[0]?.value, "BEST TRANSPORT");
});

test("TLV errors name the problem", () => {
  const code = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      assert.ok(e instanceof EmvQrError);
      return e.code;
    }
    return "no error";
  };
  assert.equal(code(() => decodeTlv("0002")), "TRUNCATED");
  assert.equal(code(() => decodeTlv("0005ab")), "TRUNCATED");
  assert.equal(code(() => decodeTlv("0A0201")), "BAD_TAG");
  assert.equal(code(() => decodeTlv("00x201")), "BAD_LENGTH");
  assert.equal(code(() => encodeTlv("59", "x".repeat(100))), "BAD_LENGTH");
});
