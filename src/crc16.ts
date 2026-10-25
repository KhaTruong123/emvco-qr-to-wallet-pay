/**
 * CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF, no reflection, no final XOR),
 * as required by EMVCo MPM for tag 63. Input is hashed as UTF-8 bytes.
 */
export function crc16Ccitt(input: string | Uint8Array | number[]): number {
  const bytes = typeof input === "string" ? utf8(input) : input;
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

/** CRC as the 4-character uppercase hex string that goes into tag 63. */
export function crc16Hex(input: string | Uint8Array | number[]): string {
  return crc16Ccitt(input).toString(16).toUpperCase().padStart(4, "0");
}

/** UTF-8 encoder without TextEncoder, so the library runs on JS engines that lack it (e.g. Hermes without polyfills). */
function utf8(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return out;
}
