export type EmvQrErrorCode =
  | "EMPTY_PAYLOAD"
  | "NOT_EMVCO_MPM"
  | "BAD_TAG"
  | "BAD_LENGTH"
  | "TRUNCATED"
  | "CRC_MISSING"
  | "CRC_NOT_LAST"
  | "CRC_MISMATCH"
  | "MISSING_FIELD"
  | "INVALID_FIELD"
  | "AMOUNT_REQUIRED"
  | "QUOTE_REQUIRED"
  | "INVALID_OPTION";

/** Every error this library throws. `position` is a character offset in the payload when known. */
export class EmvQrError extends Error {
  readonly code: EmvQrErrorCode;
  readonly position?: number;
  readonly tag?: string;

  constructor(code: EmvQrErrorCode, message: string, details: { position?: number; tag?: string } = {}) {
    super(message);
    this.name = "EmvQrError";
    this.code = code;
    this.position = details.position;
    this.tag = details.tag;
  }
}
