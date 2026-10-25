# EMVCo merchant QR to CAIP-358 `wallet_pay`

This page maps every EMVCo Merchant-Presented Mode (MPM) field to the CAIP-358 `wallet_pay` request, and lists what the spec has no place for.

Spec version used: [CAIP-358](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-358.md), status Draft, "updated: 2025-11-13", commit `23446e7` of ChainAgnostic/CAIPs. Field names below are copied from that text.

## The core mismatch

A merchant QR says "pay 150,000 VND to account 0123 at bank 970436". A `wallet_pay` request says "send 0x5F5E100 units of this CAIP-19 asset to this chain address". The two have no field in common.

To bridge them, someone has to quote a rate and receive the crypto, then pay the merchant over the local rail (NAPAS, BI-FAST, PromptPay, InstaPay, Pix). This library calls that party the **settlement provider**. `toWalletPayRequest` takes one or more settlement quotes and fills `paymentOptions` from them. The QR data itself goes into a non-standard `merchantQr` object, which is only added when the caller asks for it.

## Request fields

| CAIP-358 field | Source | Rule in this library |
|---|---|---|
| `version` | constant | `1` |
| `orderId` | tag 62 sub-tag 05 (reference label), then 62.01 (bill number), only when tag 01 = `12` (dynamic) | A static QR is printed once and reused, so its data cannot identify one order. Static QRs get a random UUIDv4 unless the caller passes `orderId`. The Pix placeholder `***` is never used. Max 128 characters. |
| `expiry` | none in the QR | `now + ttlSeconds`, default 300 seconds (the spec's SHOULD minimum). The caller can set it to the quote's validity. |
| `paymentOptions[].asset` | settlement quote | CAIP-19 asset ID, checked with a CAIP-19 pattern. |
| `paymentOptions[].amount` | tag 54 (or the payer's amount), tag 53, quote rate | `ceil(fiat / fiatPerToken * 10^decimals)` in integer math, written as `0x` uppercase hex. Rounded up so the merchant is never underpaid. A quote can also give the amount directly. |
| `paymentOptions[].recipient` | settlement quote | The settlement provider's address on that chain. **Not** the merchant: the merchant has a bank account, not a chain address. |
| `paymentOptions[].types` | settlement quote | Checked against the exclusive version 1 list: `native-transfer`, `erc20-transfer`, `erc20-approve`, `erc2612-permit`, `erc3009-authorization`, `spl-transfer`, `spl-approve`. |

## EMVCo tags

| EMVCo tag | Meaning | CAIP-358 field | `merchantQr` extension field | Notes |
|---|---|---|---|---|
| 00 | Payload format indicator | none | none | Must be `01`. Checked by the parser. |
| 01 | Point of initiation (`11` static, `12` dynamic) | indirect: decides `orderId` | `pointOfInitiation` | Static QRs need the payer to type the amount. |
| 02-25 | Card network account (Visa, Mastercard, UnionPay, ...) | none | `payload` only | Card rails cannot receive crypto. Parsed and labelled, not mapped. |
| 26-51 | Merchant account templates (NAPAS, QRIS, PromptPay, QR Ph, Pix, ...) | none | `scheme`, `payload` | The payee. Only the settlement provider can use it. See the per-scheme table below. |
| 52 | Merchant category code | none | `merchant.categoryCode` | |
| 53 | Currency, ISO 4217 numeric | none (used for `amount`) | `fiat.currency`, `fiat.currencyNumeric` | |
| 54 | Amount, decimal string | `paymentOptions[].amount` after conversion | `fiat.amount`, `fiat.amountSource` = `qr` | Missing on most static QRs. Then `fiat.amountSource` = `payer`. |
| 55, 56, 57 | Tip or convenience fee (prompt, fixed, percentage) | none | none | Parsed into `tip`. Not mapped: the spec has no way to show or add a fee. |
| 58 | Country code | none | `merchant.countryCode` | |
| 59 | Merchant name | none | `merchant.name` | The wallet cannot show who is being paid without it. |
| 60 | Merchant city | none | `merchant.city` | |
| 61 | Postal code | none | none | Parsed into `postalCode`. |
| 62.01 | Bill number | `orderId` (dynamic only, second choice) | `reference.billNumber` | |
| 62.05 | Reference label (Pix `txid`) | `orderId` (dynamic only, first choice) | `reference.referenceLabel` | |
| 62.08 | Purpose of transaction | none | `reference.purpose` | VietQR puts the transfer note here. |
| 62.09 | Additional consumer data request (address, mobile, email) | none | none | The spec has no way for a wallet to send payer data back. |
| 62 others | Store, loyalty, customer, terminal labels, tax ID, channel | none | none | Parsed into `additionalData`. |
| 63 | CRC | none | none | Checked first. No request is built from a QR with a missing or wrong CRC (`requireValidCrc`, default true). |
| 64 | Language template (alternate name and city) | none | none | Parsed into `language`. |
| 80-99 | Unreserved templates | none | none | Parsed into `unreserved`. |

## Merchant account templates by scheme

| Scheme | GUID (sub-tag 00) | Usual tag | Fields this library labels |
|---|---|---|---|
| VietQR (NAPAS) | `A000000727` | 38 | `01.00` bank BIN, `01.01` account or card number, `02` service code (`QRIBFTTA` account, `QRIBFTTC` card, `QRPUSH`, `QRCASH`) |
| VNPay | `A000000775` | 26 | GUID only, other sub-tags kept in `fields` |
| QRIS | `ID.CO.QRIS.WWW` (tag 51), acquirer reverse domain ending `.WWW` (tags 26-45) | 26, 51 | acquirer: `01` merchant PAN, `02` merchant ID, `03` criteria. national: `02` NMID, `03` criteria |
| PromptPay | `A000000677010111` credit transfer, `A000000677010112` bill payment | 29, 30 | `01` mobile (`0066...`, also given as E.164), `02` national or tax ID, `03` e-wallet ID. Bill payment: `01` biller ID, `02` and `03` references |
| QR Ph | `com.p2pqrpay` (P2P), `ph.ppmi.*` (P2M) | 27, 28 | `01` acquirer ID (BIC). Other sub-tags kept in `fields` |
| Pix | `br.gov.bcb.pix` (case-insensitive) | 26 | `01` key, `02` description, `25` payload URL (dynamic) |
| SGQR PayNow | `SG.PAYNOW` | 26 | `01` proxy type, `02` proxy value, `03` amount editable, `04` expiry |

When a QR carries several templates (for example a wallet's own tag 26 plus NAPAS tag 38), the national interbank template is the primary `scheme`.

## Gaps in CAIP-358 for merchant QR payments

These are the places where the spec text has no field or rule for data that a merchant QR carries. Each one is a candidate for an upstream discussion.

1. **No fiat amount.** `amount` MUST be a hex string in the asset's smallest unit. A merchant QR prices in VND, IDR, THB, PHP or BRL. The fiat amount, its currency and the rate used have nowhere to go, so a wallet cannot show "150,000 VND (5.77 USDC)" from the request alone. A possible fix is an optional request-level field such as `display: { amount: "150000", currency: "VND" }` using ISO 4217.
2. **No payee identity.** The request names a `recipient` address and nothing else. For a merchant QR that address belongs to the settlement provider, so the wallet cannot show the merchant's name and city. This makes it easy to swap the payee without the user noticing. A possible fix is an optional informative `merchant: { name, city, countryCode, categoryCode }` object.
3. **`recipient` must be a chain address.** A merchant QR pays a bank account on a local rail. An intermediary is required, and the spec has no way to say who it is or which rail it pays on. The original QR payload also has no place, so the provider has to receive it out of band.
4. **The QR is scanned by the wallet, but `wallet_pay` flows from dapp to wallet.** With a printed merchant QR there is no dapp. The wallet scans, then needs a quote from a settlement provider, then builds the request itself. The spec defines no QR or URI transport for `wallet_pay`, and its Rationale section rejected multi-address QR codes. A resolver step (QR payload in, `wallet_pay` params out) needs to be described, or the method stays dapp-only.
5. **Static QRs and payer-entered amounts.** Most merchant QRs in Vietnam, Thailand and Indonesia are static. The payer types the amount. The spec assumes the merchant sets every amount.
6. **`orderId` and idempotency for static QRs.** A static QR has no order. If the wallet derives `orderId` from QR data, two payments to the same sticker collide under the idempotency rules (the second payment would return the first result). This library uses a random UUID for static QRs. The spec could say this explicitly.
7. **Expiry versus quote validity.** The spec SHOULDs at least 300 seconds. An FX quote for local-currency payout can be valid for less time than that. The spec does not say what happens when the rate moves before the wallet signs.
8. **Tips and fees.** EMVCo tags 55-57 let the payer add a tip or require a convenience fee. The spec has no way to express either one.
9. **Payer data requests.** EMVCo 62.09 asks the payer app for an address, mobile number or email. The spec's response has no field for it, which matches its privacy goals but leaves these QRs unsupported.
10. **The receipt proves the on-chain leg only.** `receipt` shows the transfer to the settlement provider. Nothing carries the local rail's confirmation (a NAPAS trace number, a Pix end-to-end ID). Refunds and disputes are listed as future work in the Security Considerations section.
11. **Transfer types are EVM and Solana only.** The version 1 list is exclusive. Chains used for stablecoin payouts in Southeast Asia and Latin America, such as Stellar and Tron, have no transfer type.
12. **Editorial issues found while building test vectors.**
    - `ResponseResult.version` is typed `string` in the TypeScript block, but the text says it is an integer that must match the request.
    - The example request is missing a comma between the last two payment options.
    - The response examples have trailing commas.
    - The Test Cases section is `TODO`. A draft contribution is in [caip-358-test-cases-draft.md](caip-358-test-cases-draft.md).

## The `merchantQr` extension object

The spec neither allows nor forbids extra fields in `params`. This library only adds `merchantQr` when `includeMerchantQr: true` is passed. A strict wallet can ignore it. Its shape:

```jsonc
{
  "format": "emvco-mpm",
  "scheme": "napas",
  "payload": "000201010212...6304C6E0",
  "pointOfInitiation": "dynamic",
  "fiat": { "amount": "150000", "currency": "VND", "currencyNumeric": "704", "amountSource": "qr" },
  "merchant": { "name": "SYNTHETIC SHOP", "city": "HO CHI MINH", "countryCode": "VN", "categoryCode": "5812" },
  "reference": { "billNumber": "INV-0042", "purpose": "SYNTHETIC ORDER 42" }
}
```

It is a working proposal, not a standard.
