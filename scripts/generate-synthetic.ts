// Generates the synthetic corpus in samples/synthetic/: payloads.json plus one PNG per payload.
// Every payload is built by this library's builders with made-up merchant data, so it is
// labelled synthetic and must never be counted as a real-world sample.
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import QRCode from "qrcode";
import { buildPix, buildPromptPay, buildQrPh, buildQris, buildVietQr } from "../src/build.js";

const OUT = join(process.cwd(), "samples", "synthetic");

const samples: Array<{ id: string; scheme: string; description: string; payload: string }> = [
  {
    id: "synthetic-vietqr-static-account",
    scheme: "napas",
    description: "VietQR static, transfer to account, no amount",
    payload: buildVietQr({ bankBin: "970436", accountNumber: "000000000001", merchantName: "SYNTHETIC CAFE", merchantCity: "HA NOI" }),
  },
  {
    id: "synthetic-vietqr-dynamic-amount-purpose",
    scheme: "napas",
    description: "VietQR dynamic, 150000 VND, purpose and bill number in tag 62",
    payload: buildVietQr({
      bankBin: "970422",
      accountNumber: "000000000002",
      amount: "150000",
      purpose: "SYNTHETIC ORDER 42",
      additionalData: [["01", "INV-0042"]],
      merchantName: "SYNTHETIC SHOP",
      merchantCity: "HO CHI MINH",
    }),
  },
  {
    id: "synthetic-vietqr-card",
    scheme: "napas",
    description: "VietQR transfer to card (service QRIBFTTC)",
    payload: buildVietQr({ bankBin: "970415", accountNumber: "9704150000000003", serviceCode: "QRIBFTTC", merchantName: "SYNTHETIC CARD", merchantCity: "DA NANG" }),
  },
  {
    id: "synthetic-qris-static",
    scheme: "qris",
    description: "QRIS static, acquirer template 26 and national template 51",
    payload: buildQris({
      acquirerGuid: "ID.CO.EXAMPLE.WWW",
      merchantPan: "9360000000000000001",
      merchantId: "000000000000001",
      nmid: "ID1000000000001",
      merchantName: "SYNTHETIC WARUNG",
      merchantCity: "JAKARTA",
      postalCode: "10110",
    }),
  },
  {
    id: "synthetic-qris-dynamic",
    scheme: "qris",
    description: "QRIS dynamic, 25000 IDR, bill number and terminal label",
    payload: buildQris({
      acquirerGuid: "ID.CO.EXAMPLE.WWW",
      merchantPan: "9360000000000000002",
      merchantId: "000000000000002",
      nmid: "ID1000000000002",
      criteria: "UKE",
      amount: "25000",
      additionalData: [["01", "BILL-7"], ["07", "T01"]],
      merchantName: "SYNTHETIC TOKO",
      merchantCity: "BANDUNG",
      postalCode: "40111",
    }),
  },
  {
    id: "synthetic-promptpay-mobile",
    scheme: "promptpay",
    description: "PromptPay static to mobile number",
    payload: buildPromptPay({ mobile: "0066800000001", merchantName: "SYNTHETIC SOMTAM", merchantCity: "BANGKOK" }),
  },
  {
    id: "synthetic-promptpay-national-id-amount",
    scheme: "promptpay",
    description: "PromptPay dynamic to 13-digit ID, 120.50 THB",
    payload: buildPromptPay({ nationalId: "0000000000001", amount: "120.50", merchantName: "SYNTHETIC MARKET", merchantCity: "CHIANG MAI" }),
  },
  {
    id: "synthetic-qrph-p2m",
    scheme: "qrph",
    description: "QR Ph person-to-merchant, static",
    payload: buildQrPh({ acquirerId: "EXAMPHM1XXX", extraFields: [["03", "000000000001"]], merchantName: "SYNTHETIC SARI-SARI", merchantCity: "MANILA" }),
  },
  {
    id: "synthetic-qrph-p2m-amount",
    scheme: "qrph",
    description: "QR Ph person-to-merchant, dynamic 350.00 PHP with reference label",
    payload: buildQrPh({
      acquirerId: "EXAMPHM1XXX",
      extraFields: [["03", "000000000002"]],
      amount: "350.00",
      additionalData: [["05", "REF-0001"]],
      merchantName: "SYNTHETIC CARINDERIA",
      merchantCity: "CEBU",
    }),
  },
  {
    id: "synthetic-pix-static-email-key",
    scheme: "pix",
    description: "Pix static, email key, no amount",
    payload: buildPix({ key: "synthetic@example.com", merchantName: "SYNTHETIC LOJA", merchantCity: "SAO PAULO" }),
  },
  {
    id: "synthetic-pix-static-amount-txid",
    scheme: "pix",
    description: "Pix static with amount, description and txid",
    payload: buildPix({
      key: "123e4567-e89b-12d3-a456-426614174000",
      description: "SYNTHETIC PEDIDO",
      amount: "10.00",
      txid: "SYNTH0001",
      merchantName: "SYNTHETIC PADARIA",
      merchantCity: "BRASILIA",
    }),
  },
];

await rm(OUT, { recursive: true, force: true });
await mkdir(join(OUT, "images"), { recursive: true });
for (const s of samples) {
  await QRCode.toFile(join(OUT, "images", `${s.id}.png`), s.payload, { errorCorrectionLevel: "M", margin: 4, scale: 6 });
}
await writeFile(
  join(OUT, "payloads.json"),
  JSON.stringify(samples.map((s) => ({ ...s, synthetic: true, image: `images/${s.id}.png` })), null, 2) + "\n",
);
console.log(`wrote ${samples.length} synthetic samples to ${OUT}`);
