# Draft: CAIP-358 Test Cases contribution

Status: draft, not submitted. Written against [CAIP-358](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-358.md) at commit `23446e7` (Draft, updated 2025-11-13), whose Test Cases section reads `TODO`.

The proposal has three parts:

1. Request validation vectors (normative candidates): one valid or invalid `wallet_pay` request per MUST rule in the spec.
2. Merchant QR mapping vectors (informative): how a wallet or a settlement provider can turn an EMVCo merchant QR into a `wallet_pay` request.
3. A short informative note on merchant QR rails, for the spec text.

All vectors are in machine-readable form in [caip-358-test-vectors.json](caip-358-test-vectors.json). The test suite in this repository checks every vector against a reference implementation (`validateWalletPayRequest` and `toWalletPayRequest`), so the expected values are reproducible with `npm test`.

---

## Proposed text for the "Test Cases" section

### Request validation

Each vector is a `params` object for `wallet_pay` and the expected result. A wallet SHOULD reject an invalid request with JSON-RPC error `-32602` (Invalid params). The spec does not define its own error code for this case.

Unless a vector says otherwise, the wallet's current time is `1740672089` (300 seconds before the `expiry` of the spec's example).

| ID | What it tests | Expected |
|---|---|---|
| `request-valid-spec-example` | The example request from this CAIP, with the missing comma restored | valid |
| `request-valid-single-option` | One `spl-transfer` option | valid |
| `request-valid-extra-field` | An unknown extra field at params level | valid (unknown fields are ignored) |
| `request-invalid-missing-version` | `version` omitted | invalid: version is required |
| `request-invalid-version-string` | `"version": "1"` | invalid: version must be an integer |
| `request-invalid-order-id-too-long` | `orderId` of 129 characters | invalid: longer than 128 characters |
| `request-invalid-expiry-not-integer` | `"expiry": 1740672389.5` | invalid: must be an integer UNIX timestamp |
| `request-invalid-expired` | wallet time `1740672390`, after `expiry` | invalid: error `8003` "Payment request expired" |
| `request-invalid-empty-options` | `"paymentOptions": []` | invalid: at least one entry |
| `request-invalid-amount-decimal` | `"amount": "100000000"` | invalid: must be a hex string |
| `request-invalid-asset-not-caip19` | `"asset": "USDC"` | invalid: must be a CAIP-19 asset ID |
| `request-invalid-unknown-type` | `"types": ["spl-transfer", "bank-transfer"]` | invalid: types come from the exclusive version 1 list |
| `request-invalid-empty-types` | `"types": []` | invalid: must not be empty |

Base request used by the single-option vectors:

```json
{
  "version": 1,
  "orderId": "643f31f2-67cd-4172-83cf-3176e8443ab8",
  "expiry": 1740672389,
  "paymentOptions": [
    {
      "asset": "solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ/spl:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "amount": "0x5F5E100",
      "recipient": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      "types": ["spl-transfer"]
    }
  ]
}
```

Two questions for the authors came up while writing these:

- Should a wallet ignore unknown params fields, or reject them? The vectors assume "ignore", which helps forward compatibility.
- Is an expired request (`8003`) a validation failure, or a payment failure? The vectors treat it as a payment failure with code `8003`.

### Merchant QR mapping (informative)

These vectors show one way to build a `wallet_pay` request from an EMVCo Merchant-Presented Mode QR code. They are informative: CAIP-358 does not define this mapping.

Inputs for every vector:

- `qr`: the scanned QR payload.
- A settlement quote: USDC on Solana, recipient `9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM`, type `spl-transfer`, 6 decimals, and a fixed rate in fiat per USDC. The rates are round numbers for testing, not market data.
- `now = 1740672089`, `expiry = now + 300`, and a fixed `orderId`.

Rule: `amount = ceil(fiatAmount / fiatPerToken * 10^6)`, written as hex. The amount is rounded up so the merchant is never paid less than the QR asks.

Example: the payload printed in the EMVCo MPM specification (merchant "BEST TRANSPORT", 23.72 CNY, dynamic). Rate 7.2 CNY per USDC gives 3.294445 USDC.

```text
00020101021229300012D156000000000510A93FO3230Q31280012D15600000001030812345678520441115802CN5914BEST TRANSPORT6007BEIJING64200002ZH0104最佳运输0202北京540523.7253031565502016233030412340603***0708A60086670902ME91320016A0112233449988770708123456786304A13A
```

```json
{
  "version": 1,
  "orderId": "order-emvco-spec-appendix-example",
  "expiry": 1740672389,
  "paymentOptions": [
    {
      "asset": "solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ/spl:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "amount": "0x3244ED",
      "recipient": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      "types": ["spl-transfer"]
    }
  ]
}
```

All mapping vectors (full input and expected output in the JSON file). Real samples come from the public corpus in this repository, see samples/SOURCES.md. "qr" means the amount is in the QR. "payer" means the QR is static and the vector supplies the amount a payer would type.

| ID | Origin | Scheme | Fiat amount (source) | Fiat per USDC | Expected `amount` |
|---|---|---|---|---|---|
| `merchant-qr-napas-vietqr-03` | real | napas | 2345123 VND (qr) | 26000 | `0x5604C2F` |
| `merchant-qr-qris-qris-saurus-02` | real | qris | 25000.00 IDR (qr) | 16500 | `0x171E90` |
| `merchant-qr-promptpay-promptpay-qr-06` | real | promptpay | 4.22 THB (qr) | 33.5 | `0x1EC13` |
| `merchant-qr-qrph-qrph-01` | real | qrph | 120 PHP (payer) | 58.2 | `0x1F7620` |
| `merchant-qr-pix-pix-brcode-02` | real | pix | 0.01 BRL (qr) | 5.6 | `0x6FA` |
| `merchant-qr-emvco-spec-appendix-example` | real | unknown | 23.72 CNY (qr) | 7.2 | `0x3244ED` |

Negative vectors. A wallet MUST NOT produce a request in these cases:

| ID | Input | Expected |
|---|---|---|
| `merchant-qr-negative-crc-mismatch` | A dynamic VietQR whose amount was edited after the CRC (tag 63) was computed | no request: CRC check fails |
| `merchant-qr-negative-static-no-amount` | A static VietQR (tag 01 = `11`, no tag 54) and no amount typed by the payer | no request: amount required |

### Proposed informative note: merchant QR rails

> Many countries run national QR payment rails on the EMVCo QR Code Specification for Payment Systems, Merchant-Presented Mode. Examples are VietQR (Vietnam, NAPAS), QRIS (Indonesia), PromptPay (Thailand), QR Ph (Philippines), SGQR (Singapore), DuitNow (Malaysia) and Pix (Brazil). The payload is a string of two-digit tag and length fields that starts with `000201` and ends with a CRC-16/CCITT checksum in tag 63.
>
> A merchant QR names a fiat amount (tags 53 and 54, often absent on printed static codes) and a payee account on a local rail (templates in tags 26 to 51). It does not name a chain address or a token. A wallet that wants to pay such a QR with `wallet_pay` needs a settlement provider. The provider quotes a token amount, receives the transfer at its own `recipient` address, and pays the merchant on the local rail.
>
> In that flow the wallet scans the code, so there is no dapp to send the request. The request comes from the wallet itself or from a resolver service operated by the settlement provider.
>
> Wallets SHOULD verify the QR checksum before building a request. They SHOULD show the merchant name (tag 59) and the fiat amount next to the token amount. For static QRs, wallets SHOULD NOT derive `orderId` from QR data, because a static code is reused for many payments and the idempotency rules would merge them.

## Related editorial fixes

Found while writing the vectors. Each is small and could go in the same pull request:

1. In the Response section, `ResponseResult.version` is typed `string`, but the text says it "is an integer and MUST match the same value used in the request".
2. The example request has no comma between the `0.025 ETH` option and the `0.5 SOL` option, so no JSON or JSONC parser accepts it.
3. Both response examples have trailing commas after `receipt` and after the last `data` field. Some JSONC parsers accept them, but strict JSON parsers do not, and the request example has none. Removing them makes the examples safe to copy into tests.

## Gaps this does not fix

The mapping vectors only work by putting fiat and merchant data outside the spec's fields. [mapping.md](mapping.md) lists the gaps: no fiat amount, no payee identity, no QR or URI transport, no rule for static QRs, no tip or fee, no local-rail receipt, and transfer types limited to EVM and Solana. These need discussion with the authors before anyone proposes new fields.
