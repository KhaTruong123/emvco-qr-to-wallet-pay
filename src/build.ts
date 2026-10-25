import { crc16Hex } from "./crc16.js";
import { EmvQrError } from "./errors.js";
import { encodeTlv, encodeTlvList } from "./tlv.js";

export interface BuildInput {
  pointOfInitiation?: "static" | "dynamic";
  /** Merchant account templates, tags 26-51. Fields are encoded in the order given. */
  merchantAccounts: Array<{ tag: string; fields: Array<[string, string]> }>;
  merchantCategoryCode: string;
  /** ISO 4217 numeric code, e.g. "704". */
  currency: string;
  amount?: string;
  countryCode: string;
  merchantName: string;
  merchantCity: string;
  postalCode?: string;
  /** Tag 62 sub-tags, e.g. [["01", "INV-1"], ["08", "coffee"]]. */
  additionalData?: Array<[string, string]>;
  /** Tag 64 sub-tags. */
  language?: Array<[string, string]>;
}

/** Builds a complete EMVCo MPM payload, CRC included. Tags are written in ascending order. */
export function buildEmvQr(input: BuildInput): string {
  const parts: Array<[string, string]> = [["00", "01"]];
  if (input.pointOfInitiation) parts.push(["01", input.pointOfInitiation === "dynamic" ? "12" : "11"]);
  for (const account of input.merchantAccounts) {
    const n = Number(account.tag);
    if (!(n >= 26 && n <= 51)) throw new EmvQrError("BAD_TAG", `Merchant account template tag must be 26-51, got ${account.tag}`);
    parts.push([account.tag, encodeTlvList(account.fields)]);
  }
  parts.push(["52", input.merchantCategoryCode], ["53", input.currency]);
  if (input.amount !== undefined) parts.push(["54", input.amount]);
  parts.push(["58", input.countryCode], ["59", input.merchantName], ["60", input.merchantCity]);
  if (input.postalCode !== undefined) parts.push(["61", input.postalCode]);
  if (input.additionalData?.length) parts.push(["62", encodeTlvList(input.additionalData)]);
  if (input.language?.length) parts.push(["64", encodeTlvList(input.language)]);
  parts.sort((a, b) => Number(a[0]) - Number(b[0]));
  const body = parts.map(([t, v]) => encodeTlv(t, v)).join("") + "6304";
  return body + crc16Hex(body);
}

type Common = Pick<BuildInput, "amount" | "merchantName" | "merchantCity" | "postalCode" | "additionalData" | "language"> & {
  merchantCategoryCode?: string;
};

const poiFor = (amount?: string) => (amount === undefined ? "static" : "dynamic");

/** VietQR (NAPAS) transfer to a bank account. */
export function buildVietQr(input: Common & { bankBin: string; accountNumber: string; serviceCode?: string; purpose?: string }): string {
  return buildEmvQr({
    ...input,
    pointOfInitiation: poiFor(input.amount),
    merchantAccounts: [
      {
        tag: "38",
        fields: [
          ["00", "A000000727"],
          ["01", encodeTlvList([["00", input.bankBin], ["01", input.accountNumber]])],
          ["02", input.serviceCode ?? "QRIBFTTA"],
        ],
      },
    ],
    merchantCategoryCode: input.merchantCategoryCode ?? "5812",
    currency: "704",
    countryCode: "VN",
    additionalData: input.purpose ? [["08", input.purpose], ...(input.additionalData ?? [])] : input.additionalData,
  });
}

/** QRIS with one acquirer template (tag 26) and the national template (tag 51). */
export function buildQris(input: Common & { acquirerGuid: string; merchantPan: string; merchantId: string; nmid: string; criteria?: string }): string {
  const criteria = input.criteria ?? "UMI";
  return buildEmvQr({
    ...input,
    pointOfInitiation: poiFor(input.amount),
    merchantAccounts: [
      { tag: "26", fields: [["00", input.acquirerGuid], ["01", input.merchantPan], ["02", input.merchantId], ["03", criteria]] },
      { tag: "51", fields: [["00", "ID.CO.QRIS.WWW"], ["02", input.nmid], ["03", criteria]] },
    ],
    merchantCategoryCode: input.merchantCategoryCode ?? "5814",
    currency: "360",
    countryCode: "ID",
  });
}

/** PromptPay credit transfer to a Thai mobile number (format 0066XXXXXXXXX) or a 13-digit national ID. */
export function buildPromptPay(input: Common & { mobile?: string; nationalId?: string }): string {
  const target: [string, string] = input.mobile ? ["01", input.mobile] : ["02", input.nationalId ?? ""];
  return buildEmvQr({
    ...input,
    pointOfInitiation: poiFor(input.amount),
    merchantAccounts: [{ tag: "29", fields: [["00", "A000000677010111"], target] }],
    merchantCategoryCode: input.merchantCategoryCode ?? "0000",
    currency: "764",
    countryCode: "TH",
  });
}

/** QR Ph person-to-merchant code. Sub-tags after 01 are passed as given. */
export function buildQrPh(input: Common & { guid?: string; acquirerId: string; extraFields?: Array<[string, string]> }): string {
  return buildEmvQr({
    ...input,
    pointOfInitiation: poiFor(input.amount),
    merchantAccounts: [{ tag: "28", fields: [["00", input.guid ?? "ph.ppmi.p2m"], ["01", input.acquirerId], ...(input.extraFields ?? [])] }],
    merchantCategoryCode: input.merchantCategoryCode ?? "5411",
    currency: "608",
    countryCode: "PH",
  });
}

/** Pix static BR Code with a Pix key. `txid` goes to tag 62 sub-tag 05 ("***" when absent, as the BR Code manual requires). */
export function buildPix(input: Common & { key: string; description?: string; txid?: string }): string {
  const fields: Array<[string, string]> = [["00", "br.gov.bcb.pix"], ["01", input.key]];
  if (input.description) fields.push(["02", input.description]);
  return buildEmvQr({
    ...input,
    merchantAccounts: [{ tag: "26", fields }],
    merchantCategoryCode: input.merchantCategoryCode ?? "0000",
    currency: "986",
    countryCode: "BR",
    additionalData: [["05", input.txid ?? "***"]],
  });
}
