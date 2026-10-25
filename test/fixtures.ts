import type { SettlementQuote } from "../src/index.js";

/**
 * Illustrative settlement quotes for tests. Rates are round numbers, not market data.
 * Addresses are the example addresses from the CAIP-358 text.
 */
export const FIAT_PER_USDC: Record<string, string> = {
  VND: "26000",
  IDR: "16500",
  THB: "33.5",
  PHP: "58.2",
  BRL: "5.6",
  CNY: "7.2",
  SGD: "1.3",
  MYR: "4.4",
  KHR: "4100",
  USD: "1",
};

export function usdcQuotes(currency: string): SettlementQuote[] {
  const fiatPerToken = FIAT_PER_USDC[currency] ?? "1";
  return [
    {
      asset: "solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ/spl:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      recipient: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      types: ["spl-transfer"],
      rate: { fiatPerToken, decimals: 6 },
    },
    {
      asset: "eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      recipient: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
      types: ["erc3009-authorization", "erc20-transfer"],
      rate: { fiatPerToken, decimals: 6 },
    },
  ];
}

/** Amount a payer would type for a static QR, per currency. */
export const PAYER_AMOUNT: Record<string, string> = {
  VND: "65000",
  IDR: "15000",
  THB: "80",
  PHP: "120",
  BRL: "12.50",
};
