# Sample sources

Every real sample in `samples/real/` comes from a public source. This file lists the source and licence of each one. Retrieved on 2026-10-25.

## Rules used to pick samples

- Only public sources: official specification documents, open-source repositories under MIT, Apache-2.0 or BSD-2-Clause, and Wikimedia Commons files under CC0 or CC BY 4.0. Repositories with no licence or a copyleft licence (GPL family) were skipped.
- Payloads were copied verbatim. None was edited. Payloads whose published CRC is wrong are kept as negative test vectors (`crcValid: false`).
- Samples were left out when an account value looked like a real private person's bank account, phone number or ID number. VietQR and PromptPay samples are kept only when the account value is plainly made up (for example `0123456789` or `1111111111111`). Samples with a private person's name as merchant name were also left out. Business names and business merchant IDs from public test fixtures and public photos are kept.
- Exact duplicates are listed once. Other places where the same payload appears are in `alsoSeenAt` in `payloads.json`.
- No data from any company's private systems or customers is included.
- Licence texts of the source repositories are in [real/THIRD_PARTY_NOTICES.md](real/THIRD_PARTY_NOTICES.md).

## Counts

| Scheme | Real payloads |
|---|---|
| khqr | 2 |
| napas | 7 |
| other | 12 |
| paynow | 1 |
| pix | 9 |
| promptpay | 31 |
| qris | 16 |
| qrph | 13 |
| vnpay | 5 |
| **total** | **96** |

`other` holds EMVCo payloads from rails without a dedicated scheme label here (SGQR NETS, ShopeePay Vietnam, a Vietnamese utility biller, Colombia) plus edge cases with missing mandatory tags.

## Open-source repositories

Each payload's exact file and line is in the `sourceUrl` field of `payloads.json`, pinned to the commit below.

| Repository | Licence | Commit | Payloads used |
|---|---|---|---|
| [Xractz/qris-editor](https://github.com/Xractz/qris-editor) | MIT | `3b97c1261ca7` | 2 |
| [chrisbassi/pix-brcode](https://github.com/chrisbassi/pix-brcode) | MIT | `286d0ea4ca6c` | 1 |
| [creasico/qris-saurus](https://github.com/creasico/qris-saurus) | MIT | `e4b8db524d5e` | 3 |
| [dtinth/promptpay-qr](https://github.com/dtinth/promptpay-qr) | MIT | `a9e4f2d13fe1` | 6 |
| [ezha-payment/qris-go](https://github.com/ezha-payment/qris-go) | MIT | `2fc7c8fbf466` | 7 |
| [fyvri/go-qris](https://github.com/fyvri/go-qris) | MIT | `f4902ae53dd3` | 1 |
| [igorgbr/pix_brcode](https://github.com/igorgbr/pix_brcode) | MIT | `13681abe9a97` | 2 |
| [jojoee/promptpay](https://github.com/jojoee/promptpay) | MIT | `c60cc4f4a53b` | 11 |
| [kedirinesia/qris_parser](https://github.com/kedirinesia/qris_parser) | MIT | `59b7a019ac04` | 3 |
| [kittinan/php-promptpay-qr](https://github.com/kittinan/php-promptpay-qr) | MIT | `4bd989e383e3` | 3 |
| [maythiwat/promptparse](https://github.com/maythiwat/promptparse) | MIT | `7487a97dfc3b` | 9 |
| [miguelfercamargo/emvco-qr-sdk](https://github.com/miguelfercamargo/emvco-qr-sdk) | MIT | `d189e4b8897f` | 3 |
| [mrrhak/khqr_sdk](https://github.com/mrrhak/khqr_sdk) | MIT | `d55a437ec104` | 2 |
| [openhoangnc/vietqr](https://github.com/openhoangnc/vietqr) | MIT | `25b2bfbc7b04` | 4 |
| [polvalente/ex-pix-brcode](https://github.com/polvalente/ex-pix-brcode) | Apache-2.0 | `bfd6afd5b525` | 5 |
| [qrph/qrph](https://github.com/qrph/qrph) | Apache-2.0 | `9f6f5a3d2d65` | 13 |
| [rapoii/qris-generator](https://github.com/rapoii/qris-generator) | MIT | `3dcca490ada0` | 1 |
| [subiz/vietqr](https://github.com/subiz/vietqr) | MIT | `973be1f8620b` | 1 |
| [ttwrpz/promptparse-rs](https://github.com/ttwrpz/promptparse-rs) | MIT | `f84f0880766b` | 3 |
| [vn-contrib/napas-qr](https://github.com/vn-contrib/napas-qr) | MIT | `e5494999d8cd` | 1 |
| [xuannghia/vietnam-qr-pay](https://github.com/xuannghia/vietnam-qr-pay) | MIT | `a7e5b8954815` | 8 |
| [zionsg/sgqr-parser](https://github.com/zionsg/sgqr-parser) | BSD-2-Clause | `df928a9040bd` | 2 |

## Specification documents

| Sample | Source | Terms |
|---|---|---|
| `other-emvco-spec-appendix-01` | [EMV QR Code Specification for Payment Systems, Merchant-Presented Mode v1.1, example payload](https://www.emvco.com/emv-technologies/qr-codes/) | Short quotation from the publicly downloadable EMVCo specification (one example payload), used only for interoperability testing. Not covered by this repository's MIT licence. Use is subject to EMVCo's terms of use. [EMVCo terms of use](https://www.emvco.com/terms-of-use/) |

## Photos (Wikimedia Commons)

Decoded with `emvco-qr scan`. The decoded payload is in `images.json` (`expectedPayload`) and in `payloads.json`.

| File | Source | Author | Licence | Notes |
|---|---|---|---|---|
| `images/pix-commons-qrcode-pix-4.png` | [Commons page](https://commons.wikimedia.org/wiki/File:Qrcode-pix_(4).png) | Alvineokwokq1o2k2 | [CC0](http://creativecommons.org/publicdomain/zero/1.0/deed.en) |  |
| `images/qris-commons-valfar-store.png` | [Commons page](https://commons.wikimedia.org/wiki/File:Qris_allpay.png) | K1NK VALFAR | [CC0](http://creativecommons.org/publicdomain/zero/1.0/deed.en) |  |
| `images/qris-commons-qris-payment.jpg` | [Commons page](https://commons.wikimedia.org/wiki/File:Qris_payment.jpg) | Pian2011 | [CC0](http://creativecommons.org/publicdomain/zero/1.0/deed.en) |  |
| `images/other-commons-sgqr-liho-tea.jpg` | [Commons page](https://commons.wikimedia.org/wiki/File:SGQR_NETS_pay_at_Liho_Tea_in_Queensway_Shopping_Centre,_Singapore_(2025).jpg) | Chainwit. | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0) | Resized to 2400 px on the long side (original 4032 px, 2.2 MB) to keep the repo small. |

## Synthetic samples

`samples/synthetic/` holds 11 payloads and QR images built by this library (`scripts/generate-synthetic.ts`). Merchant names start with `SYNTHETIC`, and account numbers are made up. They are labelled `synthetic: true` and are never counted as real samples. Licence: MIT, same as this repository.
