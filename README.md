# emvco-qr-to-wallet-pay

Read the merchant QR codes used across Asia and Latin America (VietQR, QRIS, PromptPay, QR Ph, Pix) and turn them into a [CAIP-358](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-358.md) `wallet_pay` request.

Wallet builders have asked whether crypto has a QR payment standard. For merchant payments, most of the world already has one: EMVCo Merchant-Presented Mode. Every national QR rail listed above uses it. A payload starts with `000201`, holds two-digit tag and length fields, and ends with a CRC16 in tag 63. This library reads it, checks it, and maps it to `wallet_pay`, so wallet teams can test against real merchant QRs without building a parser first.

## What it does

- **Parser.** Decodes EMVCo MPM TLV, including nested templates (26-51 merchant accounts, 62 additional data, 64 language, 80-99 unreserved). Checks the CRC16-CCITT in tag 63 over UTF-8 bytes. Returns typed fields for merchant name and city, country, ISO 4217 currency, amount, static or dynamic, tip, and per-scheme account data.
- **Schemes.** VietQR (NAPAS `A000000727`: bank BIN, account, service code), QRIS (acquirer and national NMID), PromptPay (`A000000677010111` mobile or ID, bill payment), QR Ph (`com.p2pqrpay`, `ph.ppmi.*`), Pix (`br.gov.bcb.pix` key, URL), KHQR (Bakong account ID), SGQR PayNow, VNPay, and card network tags 02-25. Unknown templates keep every sub-tag.
- **Errors.** Malformed input throws `EmvQrError` with a code (`NOT_EMVCO_MPM`, `TRUNCATED`, `BAD_LENGTH`, `CRC_MISMATCH`, ...) and a position. Content problems are listed in `issues`, or thrown with `{ strict: true }`.
- **CAIP-358 mapping.** `toWalletPayRequest(parsed, options)` builds `wallet_pay` params from the QR and one or more settlement quotes. [docs/mapping.md](docs/mapping.md) has the field-by-field table and the gaps in the spec.
- **Scanner CLI.** `emvco-qr scan <image-or-folder>` decodes PNG and JPEG QR images and parses each one. You need a folder of photos, not a wallet.
- **Builder.** `buildEmvQr` and per-scheme builders make valid payloads for tests. Every built sample in this repo is labelled synthetic.
- **Runtime.** No Node built-ins in the core. It ships ESM and CommonJS builds. Image decoding is a separate `./scan` entry point that uses `jsqr`, `pngjs` and `jpeg-js`.

## Install and run

Node 20 or later.

```bash
npm install
```

```bash
npm test
```

```bash
node dist/src/cli.js scan samples/synthetic/images
```

```bash
node dist/src/cli.js parse "00020101021138560010A0000007270126000697043601120000000000010208QRIBFTTA5204581253037045802VN5914SYNTHETIC CAFE6006HA NOI63041B37"
```

Add `--quotes quotes.json` to also print the `wallet_pay` JSON-RPC request, and `--fiat-amount 65000` for a static QR without an amount. `--json` prints machine-readable output.

## Use as a library

```ts
import { parseEmvQr, toWalletPayRequest, toJsonRpcRequest } from "emvco-qr-to-wallet-pay";

const qr = parseEmvQr(scannedText);
// qr.scheme === "napas", qr.merchantAccounts[0].napas.acquirerBin === "970422", qr.amount === "150000"

const params = toWalletPayRequest(qr, {
  quotes: [
    {
      asset: "solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ/spl:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      recipient: "<settlement provider address>",
      types: ["spl-transfer"],
      rate: { fiatPerToken: "26000", decimals: 6 },
    },
  ],
  includeMerchantQr: true,
});
const request = toJsonRpcRequest(params);
```

The settlement quote matters. A merchant QR names a bank account and a fiat amount. CAIP-358 needs a chain address and a token amount. A settlement provider receives the tokens and pays the merchant on the local rail. The quote comes from that provider. This library does not pick one, and it does not fetch rates.

## Sample corpus and evidence

- `samples/real/` holds payloads and images from public sources: official specifications, permissively licensed open-source test fixtures, and openly licensed photos. Every sample's source URL and licence is in [samples/SOURCES.md](samples/SOURCES.md).
- `samples/synthetic/` holds payloads and QR images built by this library with made-up merchants.
- [docs/evidence/results.md](docs/evidence/results.md) has the per-scheme table: sample count, parsed, CRC OK. [docs/evidence/test-run.txt](docs/evidence/test-run.txt) is the full test output.

Run `npm run evidence` to rebuild the table and `npm run synthetic` to rebuild the synthetic corpus.

## CAIP-358 test cases

The CAIP-358 Test Cases section is still `TODO`. [docs/caip-358-test-cases-draft.md](docs/caip-358-test-cases-draft.md) is a draft contribution. It has request validation vectors, merchant QR mapping vectors, and an informative note on merchant QR rails. The vectors live in [docs/caip-358-test-vectors.json](docs/caip-358-test-vectors.json), and the test suite checks them against the code.

## Limits

- Merchant-Presented Mode only. Consumer-Presented Mode (the payer shows a code) is out of scope.
- Scheme field labels come from public documents and public examples. Sub-tags this library does not label are still returned in `fields`.
- The image scanner uses `jsqr`. Blurred or angled photos may not decode. Crop them first.
- This is not a payment app. It does not move money, verify merchants, or check sanctions lists.

## Licence

MIT. See [LICENSE](LICENSE). Samples keep their own licences, listed in [samples/SOURCES.md](samples/SOURCES.md).
