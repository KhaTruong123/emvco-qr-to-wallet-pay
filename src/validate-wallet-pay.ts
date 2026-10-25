import { TRANSFER_TYPES } from "./wallet-pay.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const CAIP19 = /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}\/[-a-z0-9]{3,8}:[-.%a-zA-Z0-9]{1,128}$/;
const HEX = /^0x[0-9a-fA-F]+$/;

/**
 * Checks `wallet_pay` request params against the MUST rules of CAIP-358 version 1.
 * `now` (UNIX seconds) enables the expiry check. Unknown extra fields are allowed.
 */
export function validateWalletPayRequest(params: unknown, options: { now?: number } = {}): ValidationResult {
  const errors: string[] = [];
  if (typeof params !== "object" || params === null || Array.isArray(params)) {
    return { valid: false, errors: ["params must be an object"] };
  }
  const p = params as Record<string, unknown>;

  if (p.version === undefined) errors.push("version is required");
  else if (!Number.isInteger(p.version)) errors.push("version must be an integer");
  else if (p.version !== 1) errors.push(`version ${p.version} is not defined; only 1 is`);

  if (typeof p.orderId !== "string" || p.orderId.length === 0) errors.push("orderId must be a non-empty string");
  else if (p.orderId.length > 128) errors.push("orderId must not be longer than 128 characters");

  if (typeof p.expiry !== "number" || !Number.isInteger(p.expiry)) errors.push("expiry must be an integer UNIX timestamp in seconds");
  else if (options.now !== undefined && p.expiry <= options.now) errors.push("expiry is in the past");

  if (!Array.isArray(p.paymentOptions) || p.paymentOptions.length === 0) {
    errors.push("paymentOptions must be an array with at least one entry");
  } else {
    p.paymentOptions.forEach((o: unknown, i: number) => {
      const at = `paymentOptions[${i}]`;
      if (typeof o !== "object" || o === null) {
        errors.push(`${at} must be an object`);
        return;
      }
      const opt = o as Record<string, unknown>;
      if (typeof opt.asset !== "string" || !CAIP19.test(opt.asset)) errors.push(`${at}.asset must be a CAIP-19 asset ID`);
      if (typeof opt.amount !== "string" || !HEX.test(opt.amount)) errors.push(`${at}.amount must be a 0x-prefixed hex string`);
      if (typeof opt.recipient !== "string" || opt.recipient.length === 0) errors.push(`${at}.recipient must be a non-empty address`);
      if (!Array.isArray(opt.types) || opt.types.length === 0) errors.push(`${at}.types must be a non-empty array`);
      else {
        for (const t of opt.types) {
          if (!(TRANSFER_TYPES as readonly unknown[]).includes(t)) errors.push(`${at}.types has unknown transfer type "${String(t)}"`);
        }
      }
    });
  }
  return { valid: errors.length === 0, errors };
}
