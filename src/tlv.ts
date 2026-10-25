import { EmvQrError } from "./errors.js";

/** One TLV data object. `start` is the character offset of the tag in the decoded string. */
export interface TlvField {
  tag: string;
  length: number;
  value: string;
  start: number;
}

/**
 * Splits an EMVCo TLV string into fields. Tag is 2 digits, length is 2 digits,
 * and length counts characters (Unicode code points), not bytes: the EMVCo
 * language template example stores four Chinese characters with length 04.
 */
export function decodeTlv(input: string, baseOffset = 0): TlvField[] {
  const chars = Array.from(input);
  const fields: TlvField[] = [];
  let i = 0;
  while (i < chars.length) {
    const position = baseOffset + i;
    if (i + 4 > chars.length) {
      throw new EmvQrError("TRUNCATED", `Truncated TLV header at position ${position}`, { position });
    }
    const tag = chars.slice(i, i + 2).join("");
    const lengthText = chars.slice(i + 2, i + 4).join("");
    if (!/^\d{2}$/.test(tag)) {
      throw new EmvQrError("BAD_TAG", `Tag must be 2 digits, got "${tag}" at position ${position}`, { position });
    }
    if (!/^\d{2}$/.test(lengthText)) {
      throw new EmvQrError("BAD_LENGTH", `Length of tag ${tag} must be 2 digits, got "${lengthText}"`, {
        position,
        tag,
      });
    }
    const length = Number(lengthText);
    if (i + 4 + length > chars.length) {
      throw new EmvQrError(
        "TRUNCATED",
        `Tag ${tag} declares length ${length} but only ${chars.length - i - 4} characters remain`,
        { position, tag },
      );
    }
    fields.push({ tag, length, value: chars.slice(i + 4, i + 4 + length).join(""), start: position });
    i += 4 + length;
  }
  return fields;
}

/** Encodes one TLV data object. Throws if the value is longer than 99 characters. */
export function encodeTlv(tag: string, value: string): string {
  if (!/^\d{2}$/.test(tag)) throw new EmvQrError("BAD_TAG", `Tag must be 2 digits, got "${tag}"`);
  const length = Array.from(value).length;
  if (length > 99) throw new EmvQrError("BAD_LENGTH", `Value of tag ${tag} is ${length} characters, max is 99`, { tag });
  return tag + String(length).padStart(2, "0") + value;
}

/** Encodes fields in the order given, so callers control tag ordering. */
export function encodeTlvList(fields: Array<[string, string]>): string {
  return fields.map(([tag, value]) => encodeTlv(tag, value)).join("");
}
