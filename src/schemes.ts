import { decodeTlv } from "./tlv.js";

export type SchemeId = "napas" | "vnpay" | "qris" | "promptpay" | "qrph" | "pix" | "paynow" | "khqr" | "card-network" | "unknown";

/** National interbank rails. When a QR carries several templates, these win as the primary scheme. */
export const NATIONAL_SCHEMES: readonly SchemeId[] = ["napas", "qris", "promptpay", "qrph", "pix", "paynow", "khqr"];

/** VietQR: NAPAS template, GUID A000000727. */
export interface NapasDetails {
  /** NAPAS acquirer / beneficiary bank BIN (6 digits), sub-tag 01.00. */
  acquirerBin?: string;
  /** Account number, card number or merchant ID, sub-tag 01.01. */
  consumerId?: string;
  /** Service code, sub-tag 02, e.g. QRIBFTTA. */
  serviceCode?: string;
  service?: "transfer-to-account" | "transfer-to-card" | "merchant-payment" | "cash-withdrawal";
}

/** PromptPay: GUID A000000677010111 (credit transfer) or A000000677010112 (bill payment). */
export interface PromptPayDetails {
  kind: "credit-transfer" | "bill-payment" | "other";
  mobile?: string;
  /** Mobile number in E.164 form, derived from the 0066 prefix used by PromptPay. */
  mobileE164?: string;
  nationalId?: string;
  eWalletId?: string;
  billerId?: string;
  reference1?: string;
  reference2?: string;
}

/** Pix BR Code: GUID br.gov.bcb.pix. */
export interface PixDetails {
  /** Pix key (chave), sub-tag 01. Present on static codes. */
  key?: string;
  /** Free text shown to the payer, sub-tag 02. */
  description?: string;
  /** Payload location URL for dynamic codes, sub-tag 25, without scheme. */
  url?: string;
}

/** QRIS (Indonesia). Tags 26-45 hold acquirer templates, tag 51 holds the national template. */
export interface QrisDetails {
  role: "national" | "acquirer";
  globalId: string;
  merchantPan?: string;
  merchantId?: string;
  /** National Merchant ID, tag 51 sub-tag 02. */
  nmid?: string;
  /** Merchant criteria code: UMI, UKE, UME, UBE or URE. */
  merchantCriteria?: string;
}

/** QR Ph (Philippines). Only the GUID and the acquirer ID are labelled; other sub-tags stay in `fields`. */
export interface QrPhDetails {
  kind: "p2p" | "p2m" | "other";
  /** Acquirer ID, usually a SWIFT BIC, sub-tag 01. */
  acquirerId?: string;
}

/** SGQR PayNow (Singapore): GUID SG.PAYNOW. */
export interface PayNowDetails {
  proxyType?: "mobile" | "uen" | string;
  proxyValue?: string;
  amountEditable?: boolean;
  expiry?: string;
}

/** KHQR (Cambodia): tag 29 (individual) or 30 (merchant), sub-tag 00 holds the Bakong account ID. */
export interface KhqrDetails {
  kind: "individual" | "merchant";
  bakongAccountId: string;
}

export interface MerchantAccount {
  tag: string;
  scheme: SchemeId;
  /** Globally unique identifier, sub-tag 00 of a template. Undefined for card network tags 02-25. */
  guid?: string;
  /** Card network name for primitive tags 02-25, e.g. "visa". */
  network?: string;
  raw: string;
  /** Sub-tags of the template. Nested templates are flattened as "01.00". */
  fields: Record<string, string>;
  napas?: NapasDetails;
  promptpay?: PromptPayDetails;
  pix?: PixDetails;
  qris?: QrisDetails;
  qrph?: QrPhDetails;
  paynow?: PayNowDetails;
  khqr?: KhqrDetails;
}

const CARD_NETWORKS: Record<string, string> = {
  "02": "visa",
  "03": "visa",
  "04": "mastercard",
  "05": "mastercard",
  "06": "emvco",
  "07": "emvco",
  "08": "emvco",
  "09": "discover",
  "10": "discover",
  "11": "amex",
  "12": "amex",
  "13": "jcb",
  "14": "jcb",
  "15": "unionpay",
  "16": "unionpay",
};

const NAPAS_SERVICES: Record<string, NapasDetails["service"]> = {
  QRIBFTTA: "transfer-to-account",
  QRIBFTTC: "transfer-to-card",
  QRPUSH: "merchant-payment",
  QRCASH: "cash-withdrawal",
};

export function detectScheme(guid: string, tag: string, countryCode?: string): SchemeId {
  const g = guid.toUpperCase();
  if (g === "A000000727") return "napas";
  if (g === "A000000775") return "vnpay";
  if (g.startsWith("A000000677")) return "promptpay";
  if (g === "BR.GOV.BCB.PIX") return "pix";
  if (g === "SG.PAYNOW") return "paynow";
  if (g === "COM.P2PQRPAY" || g.startsWith("PH.PPMI")) return "qrph";
  if (g === "ID.CO.QRIS.WWW") return "qris";
  // KHQR (Cambodia, Bakong) puts a Bakong account ID such as "name@bank" where other schemes put a GUID.
  if (countryCode === "KH" && (tag === "29" || tag === "30") && guid.includes("@")) return "khqr";
  // QRIS acquirer templates use the acquirer's reverse domain as GUID (e.g. ID.CO.BRI.WWW, COM.GO-JEK.WWW).
  if (countryCode === "ID" && Number(tag) >= 26 && Number(tag) <= 45 && g.endsWith(".WWW")) return "qris";
  return "unknown";
}

/** Decodes a template value into flat sub-tags. Returns undefined if the value is not valid TLV. */
export function decodeTemplate(value: string, nested: string[] = []): Record<string, string> | undefined {
  try {
    const out: Record<string, string> = {};
    for (const f of decodeTlv(value)) {
      out[f.tag] = f.value;
      if (nested.includes(f.tag)) {
        const inner = decodeTemplate(f.value);
        if (inner) for (const [k, v] of Object.entries(inner)) out[`${f.tag}.${k}`] = v;
      }
    }
    return out;
  } catch {
    return undefined;
  }
}

/**
 * Interprets a merchant account information field (tags 02-51).
 * Returns the account plus a warning message when a template does not decode as TLV.
 */
export function interpretMerchantAccount(
  tag: string,
  value: string,
  countryCode?: string,
): { account: MerchantAccount; warning?: string } {
  const n = Number(tag);
  if (n >= 2 && n <= 25) {
    return { account: { tag, scheme: "card-network", network: CARD_NETWORKS[tag] ?? "emvco-reserved", raw: value, fields: {} } };
  }
  const fields = decodeTemplate(value);
  if (!fields) {
    return {
      account: { tag, scheme: "unknown", raw: value, fields: {} },
      warning: `Merchant account template ${tag} is not valid TLV`,
    };
  }
  const guid = fields["00"];
  if (guid === undefined) {
    return {
      account: { tag, scheme: "unknown", raw: value, fields },
      warning: `Merchant account template ${tag} has no GUID (sub-tag 00)`,
    };
  }
  const scheme = detectScheme(guid, tag, countryCode);
  const account: MerchantAccount = { tag, scheme, guid, raw: value, fields };

  switch (scheme) {
    case "napas": {
      // NAPAS nests the beneficiary (bank BIN + account) as a template inside sub-tag 01.
      const beneficiary = fields["01"] === undefined ? undefined : decodeTemplate(fields["01"]);
      if (beneficiary) for (const [k, v] of Object.entries(beneficiary)) fields[`01.${k}`] = v;
      const serviceCode = fields["02"];
      account.napas = {
        acquirerBin: fields["01.00"],
        consumerId: fields["01.01"],
        serviceCode,
        service: serviceCode ? NAPAS_SERVICES[serviceCode.toUpperCase()] : undefined,
      };
      break;
    }
    case "promptpay": {
      const g = guid.toUpperCase();
      if (g === "A000000677010112") {
        account.promptpay = { kind: "bill-payment", billerId: fields["01"], reference1: fields["02"], reference2: fields["03"] };
      } else {
        const mobile = fields["01"];
        account.promptpay = {
          kind: g === "A000000677010111" ? "credit-transfer" : "other",
          mobile,
          mobileE164: mobile && /^0066\d{9}$/.test(mobile) ? `+66${mobile.slice(4)}` : undefined,
          nationalId: fields["02"],
          eWalletId: fields["03"],
        };
      }
      break;
    }
    case "pix":
      account.pix = { key: fields["01"], description: fields["02"], url: fields["25"] };
      break;
    case "qris":
      account.qris =
        guid.toUpperCase() === "ID.CO.QRIS.WWW"
          ? { role: "national", globalId: guid, nmid: fields["02"], merchantCriteria: fields["03"] }
          : {
              role: "acquirer",
              globalId: guid,
              merchantPan: fields["01"],
              merchantId: fields["02"],
              merchantCriteria: fields["03"],
            };
      break;
    case "qrph": {
      const g = guid.toUpperCase();
      account.qrph = { kind: g === "COM.P2PQRPAY" ? "p2p" : g.includes("P2M") ? "p2m" : "other", acquirerId: fields["01"] };
      break;
    }
    case "khqr":
      account.khqr = { kind: tag === "30" ? "merchant" : "individual", bakongAccountId: guid };
      break;
    case "paynow": {
      const proxyType = fields["01"];
      account.paynow = {
        proxyType: proxyType === "0" ? "mobile" : proxyType === "2" ? "uen" : proxyType,
        proxyValue: fields["02"],
        amountEditable: fields["03"] === undefined ? undefined : fields["03"] === "1",
        expiry: fields["04"],
      };
      break;
    }
  }
  return { account };
}
