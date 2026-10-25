#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { EmvQrError } from "./errors.js";
import { parseEmvQr, type ParsedEmvQr } from "./parse.js";
import { decodeQrImage, listImages } from "./scan.js";
import { toJsonRpcRequest, toWalletPayRequest, type SettlementQuote } from "./wallet-pay.js";

const USAGE = `Usage:
  emvco-qr scan <image-or-folder> [--json] [--quotes <file.json>] [--fiat-amount <n>]
  emvco-qr parse <payload> [--json] [--quotes <file.json>] [--fiat-amount <n>]

scan   decodes PNG/JPEG QR images (a folder is read recursively) and parses each payload.
parse  parses one payload string.
--quotes       JSON array of settlement quotes; also prints the CAIP-358 wallet_pay request.
--fiat-amount  amount the payer enters, for static QRs without tag 54.
--json         machine-readable output.`;

interface Row {
  source: string;
  payload?: string;
  ok: boolean;
  error?: { code: string; message: string };
  parsed?: ParsedEmvQr;
  walletPay?: unknown;
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function summarize(p: ParsedEmvQr): string[] {
  const lines = [
    `scheme: ${p.scheme}  point of initiation: ${p.pointOfInitiation ?? "-"}  CRC: ${p.crc.valid ? "ok" : `FAIL (${p.crc.value ?? "missing"} vs ${p.crc.computed})`}`,
    `merchant: ${p.merchantName ?? "-"}, ${p.merchantCity ?? "-"}, ${p.countryCode ?? "-"}  MCC ${p.merchantCategoryCode ?? "-"}`,
    `amount: ${p.amount ?? "(payer enters)"} ${p.currency?.alpha ?? p.currency?.numeric ?? ""}`,
  ];
  for (const a of p.merchantAccounts) {
    const detail = a.napas ?? a.promptpay ?? a.pix ?? a.qris ?? a.qrph ?? a.paynow ?? (a.network ? { network: a.network } : a.fields);
    lines.push(`account tag ${a.tag} ${a.guid ?? ""}: ${JSON.stringify(detail)}`);
  }
  for (const i of p.issues) lines.push(`${i.level}: ${i.message}`);
  return lines;
}

async function main(argv: string[]): Promise<number> {
  const [command, target] = argv;
  if (!command || !target || command === "--help") {
    console.log(USAGE);
    return command ? 0 : 1;
  }
  const json = argv.includes("--json");
  const quotesFile = flag(argv, "--quotes");
  const fiatAmount = flag(argv, "--fiat-amount");
  const quotes: SettlementQuote[] | undefined = quotesFile ? JSON.parse(await readFile(quotesFile, "utf8")) : undefined;

  const inputs: Array<{ source: string; payload?: string }> = [];
  if (command === "parse") {
    inputs.push({ source: "argument", payload: target });
  } else if (command === "scan") {
    for (const file of await listImages(target)) {
      inputs.push({ source: relative(process.cwd(), file) || file, payload: await decodeQrImage(file) });
    }
  } else {
    console.error(USAGE);
    return 1;
  }

  const rows: Row[] = inputs.map(({ source, payload }) => {
    if (payload === undefined) return { source, ok: false, error: { code: "NO_QR_FOUND", message: "No QR code found in image" } };
    try {
      const parsed = parseEmvQr(payload);
      const row: Row = { source, payload, ok: parsed.crc.valid, parsed };
      if (quotes) row.walletPay = toJsonRpcRequest(toWalletPayRequest(parsed, { quotes, fiatAmount, includeMerchantQr: true }));
      return row;
    } catch (e) {
      const err = e instanceof EmvQrError ? { code: e.code, message: e.message } : { code: "ERROR", message: String(e) };
      return { source, payload, ok: false, error: err };
    }
  });

  if (json) {
    console.log(JSON.stringify(rows.map(({ parsed, ...r }) => ({ ...r, parsed: parsed && { ...parsed, fields: undefined } })), null, 2));
  } else {
    for (const r of rows) {
      console.log(`\n${r.source}`);
      if (r.payload) console.log(`  payload: ${r.payload}`);
      if (r.error) console.log(`  error ${r.error.code}: ${r.error.message}`);
      if (r.parsed) for (const l of summarize(r.parsed)) console.log(`  ${l}`);
      if (r.walletPay) console.log(`  wallet_pay: ${JSON.stringify(r.walletPay)}`);
    }
    const ok = rows.filter((r) => r.ok).length;
    console.log(`\n${ok}/${rows.length} parsed with valid CRC`);
  }
  return rows.every((r) => r.ok) ? 0 : 2;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
