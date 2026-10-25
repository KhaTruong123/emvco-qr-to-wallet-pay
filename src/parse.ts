import { crc16Hex } from "./crc16.js";
import { currencyByNumeric } from "./currency.js";
import { EmvQrError } from "./errors.js";
import { decodeTemplate, interpretMerchantAccount, NATIONAL_SCHEMES, type MerchantAccount, type SchemeId } from "./schemes.js";
import { decodeTlv, type TlvField } from "./tlv.js";

export interface Issue {
  level: "error" | "warning";
  code: string;
  message: string;
  tag?: string;
}

/** Tag 62. Sub-tag names follow EMVCo MPM section 4.8. */
export interface AdditionalData {
  billNumber?: string;
  mobileNumber?: string;
  storeLabel?: string;
  loyaltyNumber?: string;
  referenceLabel?: string;
  customerLabel?: string;
  terminalLabel?: string;
  purposeOfTransaction?: string;
  /** Sub-tag 09: letters A (address), M (mobile), E (email) the payer app should ask for. */
  additionalConsumerDataRequest?: string;
  merchantTaxId?: string;
  merchantChannel?: string;
  fields: Record<string, string>;
}

/** Tag 64. */
export interface LanguageTemplate {
  languagePreference?: string;
  merchantName?: string;
  merchantCity?: string;
  fields: Record<string, string>;
}

export interface UnreservedTemplate {
  tag: string;
  guid?: string;
  raw: string;
  fields: Record<string, string>;
}

export interface CrcCheck {
  present: boolean;
  /** Value found in tag 63, as written in the payload. */
  value?: string;
  /** CRC computed over the payload up to and including "6304". */
  computed: string;
  valid: boolean;
}

export interface ParsedEmvQr {
  payload: string;
  payloadFormatIndicator: string;
  pointOfInitiation?: "static" | "dynamic";
  /**
   * Primary rail of this QR: the first national interbank template (e.g. NAPAS tag 38 wins over a
   * wallet's own tag 26), else the first known scheme, else a card network.
   */
  scheme: SchemeId;
  merchantAccounts: MerchantAccount[];
  merchantCategoryCode?: string;
  currency?: { numeric: string; alpha?: string; minorUnits?: number };
  /** Transaction amount as written in tag 54 (decimal string). Absent on most static QRs. */
  amount?: string;
  tip?: { mode: "prompt" | "fixed" | "percentage" | "unknown"; indicator: string; fixed?: string; percentage?: string };
  countryCode?: string;
  merchantName?: string;
  merchantCity?: string;
  postalCode?: string;
  additionalData?: AdditionalData;
  language?: LanguageTemplate;
  unreserved: UnreservedTemplate[];
  crc: CrcCheck;
  /** Top-level TLV fields in payload order. */
  fields: TlvField[];
  issues: Issue[];
}

export interface ParseOptions {
  /** Throw on CRC mismatch, missing CRC, or any error-level issue. Default false: report them in `issues`. */
  strict?: boolean;
}

const ADDITIONAL_DATA_NAMES: Record<string, keyof Omit<AdditionalData, "fields">> = {
  "01": "billNumber",
  "02": "mobileNumber",
  "03": "storeLabel",
  "04": "loyaltyNumber",
  "05": "referenceLabel",
  "06": "customerLabel",
  "07": "terminalLabel",
  "08": "purposeOfTransaction",
  "09": "additionalConsumerDataRequest",
  "10": "merchantTaxId",
  "11": "merchantChannel",
};

const URI_HINT = /^(ethereum|bitcoin|solana|tron|lightning|http|https|upi|bitcoincash|litecoin):/i;

/**
 * Parses an EMVCo Merchant-Presented Mode QR payload.
 * Throws EmvQrError for input that is not EMVCo MPM or whose TLV structure is broken.
 * Content problems (bad CRC, missing mandatory tags) go to `issues` unless `strict` is set.
 */
export function parseEmvQr(input: string, options: ParseOptions = {}): ParsedEmvQr {
  if (typeof input !== "string" || input.trim() === "") {
    throw new EmvQrError("EMPTY_PAYLOAD", "Payload is empty");
  }
  const payload = input.trim();
  if (!payload.startsWith("000201")) {
    const hint = URI_HINT.test(payload) ? " It looks like a URI, which is a different QR format." : "";
    throw new EmvQrError("NOT_EMVCO_MPM", `Payload must start with "000201" (payload format indicator 01).${hint}`, {
      position: 0,
    });
  }

  const fields = decodeTlv(payload);
  const issues: Issue[] = [];
  const top = new Map<string, TlvField>();
  for (const f of fields) {
    if (top.has(f.tag)) issues.push({ level: "warning", code: "DUPLICATE_TAG", message: `Tag ${f.tag} appears more than once; the first one is used`, tag: f.tag });
    else top.set(f.tag, f);
  }
  const get = (tag: string) => top.get(tag)?.value;

  const crc = checkCrc(payload, fields, issues);

  const countryCode = get("58");
  const merchantAccounts: MerchantAccount[] = [];
  const unreserved: UnreservedTemplate[] = [];
  for (const f of fields) {
    const n = Number(f.tag);
    if (n >= 2 && n <= 51) {
      const { account, warning } = interpretMerchantAccount(f.tag, f.value, countryCode);
      merchantAccounts.push(account);
      if (warning) issues.push({ level: "warning", code: "BAD_TEMPLATE", message: warning, tag: f.tag });
    } else if (n >= 80 && n <= 99) {
      const sub = decodeTemplate(f.value);
      unreserved.push({ tag: f.tag, guid: sub?.["00"], raw: f.value, fields: sub ?? {} });
      if (!sub) issues.push({ level: "warning", code: "BAD_TEMPLATE", message: `Unreserved template ${f.tag} is not valid TLV`, tag: f.tag });
    }
  }
  if (merchantAccounts.length === 0) {
    issues.push({ level: "error", code: "MISSING_FIELD", message: "No merchant account information (tags 02-51)" });
  }

  const poi = get("01");
  let pointOfInitiation: ParsedEmvQr["pointOfInitiation"];
  if (poi === "11") pointOfInitiation = "static";
  else if (poi === "12") pointOfInitiation = "dynamic";
  else if (poi !== undefined) issues.push({ level: "warning", code: "INVALID_FIELD", message: `Point of initiation must be 11 or 12, got "${poi}"`, tag: "01" });

  for (const [tag, name] of [["52", "merchant category code"], ["53", "transaction currency"], ["58", "country code"], ["59", "merchant name"], ["60", "merchant city"]] as const) {
    if (get(tag) === undefined) issues.push({ level: "error", code: "MISSING_FIELD", message: `Mandatory tag ${tag} (${name}) is missing`, tag });
  }

  const mcc = get("52");
  if (mcc !== undefined && !/^\d{4}$/.test(mcc)) issues.push({ level: "warning", code: "INVALID_FIELD", message: `Merchant category code must be 4 digits, got "${mcc}"`, tag: "52" });

  let currency: ParsedEmvQr["currency"];
  const currencyNumeric = get("53");
  if (currencyNumeric !== undefined) {
    if (!/^\d{3}$/.test(currencyNumeric)) issues.push({ level: "error", code: "INVALID_FIELD", message: `Currency must be a 3-digit ISO 4217 code, got "${currencyNumeric}"`, tag: "53" });
    const info = currencyByNumeric(currencyNumeric);
    currency = { numeric: currencyNumeric, alpha: info?.alpha, minorUnits: info?.minorUnits };
    if (!info && /^\d{3}$/.test(currencyNumeric)) issues.push({ level: "warning", code: "UNKNOWN_CURRENCY", message: `Currency ${currencyNumeric} is not in this library's ISO 4217 table`, tag: "53" });
  }

  const amount = get("54");
  if (amount !== undefined && !/^(\d+(\.\d*)?|\.\d+)$/.test(amount)) {
    issues.push({ level: "error", code: "INVALID_FIELD", message: `Amount must be a decimal number, got "${amount}"`, tag: "54" });
  }

  let tip: ParsedEmvQr["tip"];
  const tipIndicator = get("55");
  if (tipIndicator !== undefined) {
    const mode = tipIndicator === "01" ? "prompt" : tipIndicator === "02" ? "fixed" : tipIndicator === "03" ? "percentage" : "unknown";
    tip = { mode, indicator: tipIndicator, fixed: get("56"), percentage: get("57") };
  }

  if (countryCode !== undefined && !/^[A-Z]{2}$/.test(countryCode)) {
    issues.push({ level: "warning", code: "INVALID_FIELD", message: `Country code should be ISO 3166-1 alpha-2, got "${countryCode}"`, tag: "58" });
  }

  let additionalData: AdditionalData | undefined;
  const ad = get("62");
  if (ad !== undefined) {
    const sub = decodeTemplate(ad);
    if (!sub) issues.push({ level: "warning", code: "BAD_TEMPLATE", message: "Additional data template 62 is not valid TLV", tag: "62" });
    additionalData = { fields: sub ?? {} };
    for (const [k, v] of Object.entries(sub ?? {})) {
      const name = ADDITIONAL_DATA_NAMES[k];
      if (name) additionalData[name] = v;
    }
  }

  let language: LanguageTemplate | undefined;
  const lang = get("64");
  if (lang !== undefined) {
    const sub = decodeTemplate(lang);
    if (!sub) issues.push({ level: "warning", code: "BAD_TEMPLATE", message: "Language template 64 is not valid TLV", tag: "64" });
    language = { languagePreference: sub?.["00"], merchantName: sub?.["01"], merchantCity: sub?.["02"], fields: sub ?? {} };
  }

  const primary =
    merchantAccounts.find((a) => NATIONAL_SCHEMES.includes(a.scheme)) ??
    merchantAccounts.find((a) => a.scheme !== "unknown" && a.scheme !== "card-network") ??
    merchantAccounts.find((a) => a.scheme === "card-network") ??
    merchantAccounts[0];

  const result: ParsedEmvQr = {
    payload,
    payloadFormatIndicator: get("00") ?? "",
    pointOfInitiation,
    scheme: primary?.scheme ?? "unknown",
    merchantAccounts,
    merchantCategoryCode: mcc,
    currency,
    amount,
    tip,
    countryCode,
    merchantName: get("59"),
    merchantCity: get("60"),
    postalCode: get("61"),
    additionalData,
    language,
    unreserved,
    crc,
    fields,
    issues,
  };

  if (options.strict) {
    const firstError = issues.find((i) => i.level === "error");
    if (firstError) {
      const code = firstError.code === "CRC_MISMATCH" || firstError.code === "CRC_MISSING" || firstError.code === "CRC_NOT_LAST" || firstError.code === "MISSING_FIELD" ? firstError.code : "INVALID_FIELD";
      throw new EmvQrError(code, firstError.message, { tag: firstError.tag });
    }
  }
  return result;
}

function checkCrc(payload: string, fields: TlvField[], issues: Issue[]): CrcCheck {
  const crcField = fields.find((f) => f.tag === "63");
  if (!crcField) {
    issues.push({ level: "error", code: "CRC_MISSING", message: "Tag 63 (CRC) is missing", tag: "63" });
    return { present: false, computed: crc16Hex(payload + "6304"), valid: false };
  }
  const chars = Array.from(payload);
  const signed = chars.slice(0, crcField.start + 4).join("");
  const computed = crc16Hex(signed);
  if (fields[fields.length - 1] !== crcField) {
    issues.push({ level: "error", code: "CRC_NOT_LAST", message: "Tag 63 (CRC) must be the last field", tag: "63" });
  }
  if (crcField.length !== 4) {
    issues.push({ level: "error", code: "CRC_MISMATCH", message: `Tag 63 must have length 04, got ${crcField.length}`, tag: "63" });
    return { present: true, value: crcField.value, computed, valid: false };
  }
  const valid = crcField.value.toUpperCase() === computed;
  if (!valid) {
    issues.push({ level: "error", code: "CRC_MISMATCH", message: `CRC mismatch: payload says ${crcField.value}, computed ${computed}`, tag: "63" });
  } else if (crcField.value !== computed) {
    issues.push({ level: "warning", code: "CRC_LOWERCASE", message: "CRC is valid but written in lowercase hex", tag: "63" });
  }
  return { present: true, value: crcField.value, computed, valid };
}
