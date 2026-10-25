import { EmvQrError } from "./errors.js";
import type { ParsedEmvQr } from "./parse.js";
import type { SchemeId } from "./schemes.js";

/** Transfer types allowed by CAIP-358 version 1 (an exclusive list in the spec). */
export const TRANSFER_TYPES = [
  "native-transfer",
  "erc20-transfer",
  "erc20-approve",
  "erc2612-permit",
  "erc3009-authorization",
  "spl-transfer",
  "spl-approve",
] as const;
export type TransferType = (typeof TRANSFER_TYPES)[number];

/** CAIP-358 `PaymentOption`, field names copied from the spec. */
export interface PaymentOption {
  asset: string;
  amount: string;
  recipient: string;
  types: string[];
}

/**
 * Non-standard extension. CAIP-358 has no field for fiat amount, merchant identity or the
 * QR rail, so this object carries them for a settlement provider. Wallets that follow the
 * spec strictly can ignore it. Only added when `includeMerchantQr` is true.
 */
export interface MerchantQrExtension {
  format: "emvco-mpm";
  scheme: SchemeId;
  /** The original QR payload, so the settlement provider can pay the merchant on the local rail. */
  payload: string;
  pointOfInitiation?: "static" | "dynamic";
  fiat: { amount: string; currency?: string; currencyNumeric: string; amountSource: "qr" | "payer" };
  merchant: { name?: string; city?: string; countryCode?: string; categoryCode?: string };
  reference?: { billNumber?: string; referenceLabel?: string; purpose?: string };
}

/** CAIP-358 `RequestParams` for version 1, plus the optional extension. */
export interface WalletPayRequest {
  version: 1;
  orderId: string;
  expiry: number;
  paymentOptions: PaymentOption[];
  merchantQr?: MerchantQrExtension;
}

/**
 * A quote from a settlement provider: the wallet pays `asset` to `recipient`, and the provider
 * pays the merchant in fiat over the QR rail. Give either `amount` or `rate`.
 */
export interface SettlementQuote {
  /** CAIP-19 asset ID, chain ID prefix included. */
  asset: string;
  recipient: string;
  types: TransferType[];
  /** Token amount in smallest units: bigint, decimal string, or 0x hex string. */
  amount?: bigint | string;
  /** Fiat units per one whole token (decimal string) and the token's decimals. Amount is rounded up. */
  rate?: { fiatPerToken: string; decimals: number };
}

export interface WalletPayOptions {
  quotes: SettlementQuote[];
  /** Overrides the derived order ID. Max 128 characters. */
  orderId?: string;
  /** UNIX seconds. Default: now + ttlSeconds. */
  expiry?: number;
  /** Default 300, the minimum CAIP-358 recommends. */
  ttlSeconds?: number;
  /** UNIX seconds, for deterministic output in tests. */
  now?: number;
  /** Fiat amount the payer typed, required when the QR has no amount (static QR). */
  fiatAmount?: string;
  /** Add the non-standard `merchantQr` extension object. Default false. */
  includeMerchantQr?: boolean;
  /** Refuse QRs whose CRC is missing or wrong. Default true. */
  requireValidCrc?: boolean;
}

const CAIP19 = /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}\/[-a-z0-9]{3,8}:[-.%a-zA-Z0-9]{1,128}$/;

/**
 * Maps a parsed merchant QR to CAIP-358 `wallet_pay` request params.
 * The QR only names a fiat amount and a bank-side payee, so each payment option comes from a
 * settlement quote. See docs/mapping.md for the field-by-field table and the spec gaps.
 */
export function toWalletPayRequest(parsed: ParsedEmvQr, options: WalletPayOptions): WalletPayRequest {
  if ((options.requireValidCrc ?? true) && !parsed.crc.valid) {
    throw new EmvQrError(parsed.crc.present ? "CRC_MISMATCH" : "CRC_MISSING", "Refusing to build a payment request from a QR with a missing or wrong CRC");
  }
  if (!parsed.currency) throw new EmvQrError("MISSING_FIELD", "QR has no transaction currency (tag 53)", { tag: "53" });

  let fiatAmount = parsed.amount;
  let amountSource: "qr" | "payer" = "qr";
  if (fiatAmount === undefined) {
    if (options.fiatAmount === undefined) {
      throw new EmvQrError("AMOUNT_REQUIRED", "QR has no amount (tag 54); pass options.fiatAmount with the amount the payer entered", { tag: "54" });
    }
    fiatAmount = options.fiatAmount;
    amountSource = "payer";
  } else if (options.fiatAmount !== undefined && !sameDecimal(options.fiatAmount, fiatAmount)) {
    throw new EmvQrError("INVALID_OPTION", `options.fiatAmount ${options.fiatAmount} differs from the QR amount ${fiatAmount}`);
  }
  if (!/^\d+(\.\d+)?$/.test(fiatAmount) || /^0+(\.0+)?$/.test(fiatAmount)) {
    throw new EmvQrError("INVALID_FIELD", `Fiat amount must be a positive decimal, got "${fiatAmount}"`, { tag: "54" });
  }

  if (!options.quotes?.length) throw new EmvQrError("QUOTE_REQUIRED", "At least one settlement quote is required to fill paymentOptions");
  const paymentOptions = options.quotes.map((q, i) => toPaymentOption(q, fiatAmount, i));

  const orderId = options.orderId ?? deriveOrderId(parsed);
  if (orderId.length === 0 || orderId.length > 128) throw new EmvQrError("INVALID_OPTION", "orderId must be 1-128 characters");

  const now = options.now ?? Math.floor(Date.now() / 1000);
  const expiry = options.expiry ?? now + (options.ttlSeconds ?? 300);
  if (!Number.isInteger(expiry) || expiry <= now) throw new EmvQrError("INVALID_OPTION", "expiry must be an integer UNIX timestamp in the future");

  const request: WalletPayRequest = { version: 1, orderId, expiry, paymentOptions };
  if (options.includeMerchantQr) {
    const ad = parsed.additionalData;
    const reference = ad && (ad.billNumber || ad.referenceLabel || ad.purposeOfTransaction)
      ? { billNumber: ad.billNumber, referenceLabel: ad.referenceLabel, purpose: ad.purposeOfTransaction }
      : undefined;
    request.merchantQr = {
      format: "emvco-mpm",
      scheme: parsed.scheme,
      payload: parsed.payload,
      pointOfInitiation: parsed.pointOfInitiation,
      fiat: { amount: fiatAmount, currency: parsed.currency.alpha, currencyNumeric: parsed.currency.numeric, amountSource },
      merchant: { name: parsed.merchantName, city: parsed.merchantCity, countryCode: parsed.countryCode, categoryCode: parsed.merchantCategoryCode },
      reference,
    };
  }
  return request;
}

/** Wraps request params in a JSON-RPC 2.0 envelope for the `wallet_pay` method. */
export function toJsonRpcRequest(params: WalletPayRequest, id: number | string = 1) {
  return { jsonrpc: "2.0" as const, id, method: "wallet_pay" as const, params };
}

/**
 * Dynamic QRs carry the merchant's own reference, which identifies one order.
 * Static QRs are printed once and reused, so their reference cannot identify an order.
 */
function deriveOrderId(parsed: ParsedEmvQr): string {
  if (parsed.pointOfInitiation === "dynamic") {
    const ad = parsed.additionalData;
    for (const ref of [ad?.referenceLabel, ad?.billNumber]) {
      if (ref && ref !== "***" && ref.length <= 128) return ref;
    }
  }
  const uuid = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID?.();
  if (!uuid) throw new EmvQrError("INVALID_OPTION", "No crypto.randomUUID in this runtime; pass options.orderId");
  return uuid;
}

function toPaymentOption(q: SettlementQuote, fiatAmount: string, index: number): PaymentOption {
  if (!CAIP19.test(q.asset)) throw new EmvQrError("INVALID_OPTION", `quotes[${index}].asset is not a CAIP-19 asset ID: ${q.asset}`);
  if (!q.recipient) throw new EmvQrError("INVALID_OPTION", `quotes[${index}].recipient is empty`);
  if (!q.types?.length) throw new EmvQrError("INVALID_OPTION", `quotes[${index}].types is empty`);
  for (const t of q.types) {
    if (!(TRANSFER_TYPES as readonly string[]).includes(t)) throw new EmvQrError("INVALID_OPTION", `quotes[${index}].types has "${t}", which CAIP-358 v1 does not define`);
  }
  let units: bigint;
  if (q.amount !== undefined) {
    units = typeof q.amount === "bigint" ? q.amount : BigInt(q.amount);
  } else if (q.rate) {
    units = tokenUnitsFor(fiatAmount, q.rate.fiatPerToken, q.rate.decimals);
  } else {
    throw new EmvQrError("INVALID_OPTION", `quotes[${index}] needs amount or rate`);
  }
  if (units <= 0n) throw new EmvQrError("INVALID_OPTION", `quotes[${index}] gives a non-positive amount`);
  return { asset: q.asset, amount: "0x" + units.toString(16).toUpperCase(), recipient: q.recipient, types: [...q.types] };
}

/** ceil(fiat / fiatPerToken * 10^decimals), in exact integer math. */
export function tokenUnitsFor(fiat: string, fiatPerToken: string, decimals: number): bigint {
  const [f, fScale] = toScaled(fiat);
  const [r, rScale] = toScaled(fiatPerToken);
  if (r === 0n) throw new EmvQrError("INVALID_OPTION", "fiatPerToken must be positive");
  const num = f * 10n ** BigInt(rScale) * 10n ** BigInt(decimals);
  const den = r * 10n ** BigInt(fScale);
  return (num + den - 1n) / den;
}

function toScaled(decimal: string): [bigint, number] {
  if (!/^\d+(\.\d+)?$/.test(decimal)) throw new EmvQrError("INVALID_OPTION", `Not a positive decimal: "${decimal}"`);
  const [int, frac = ""] = decimal.split(".");
  return [BigInt(int + frac), frac.length];
}

function sameDecimal(a: string, b: string): boolean {
  const [x, xs] = toScaled(a);
  const [y, ys] = toScaled(b);
  return x * 10n ** BigInt(ys) === y * 10n ** BigInt(xs);
}
