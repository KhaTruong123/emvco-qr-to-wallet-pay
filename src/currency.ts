/** ISO 4217 currencies seen on EMVCo merchant QR rails. Unknown codes still parse; `alpha` is then undefined. */
export interface CurrencyInfo {
  numeric: string;
  alpha: string;
  minorUnits: number;
}

const CURRENCIES: CurrencyInfo[] = [
  { numeric: "036", alpha: "AUD", minorUnits: 2 },
  { numeric: "096", alpha: "BND", minorUnits: 2 },
  { numeric: "104", alpha: "MMK", minorUnits: 2 },
  { numeric: "116", alpha: "KHR", minorUnits: 2 },
  { numeric: "156", alpha: "CNY", minorUnits: 2 },
  { numeric: "344", alpha: "HKD", minorUnits: 2 },
  { numeric: "356", alpha: "INR", minorUnits: 2 },
  { numeric: "360", alpha: "IDR", minorUnits: 2 },
  { numeric: "392", alpha: "JPY", minorUnits: 0 },
  { numeric: "410", alpha: "KRW", minorUnits: 0 },
  { numeric: "418", alpha: "LAK", minorUnits: 2 },
  { numeric: "458", alpha: "MYR", minorUnits: 2 },
  { numeric: "524", alpha: "NPR", minorUnits: 2 },
  { numeric: "586", alpha: "PKR", minorUnits: 2 },
  { numeric: "608", alpha: "PHP", minorUnits: 2 },
  { numeric: "702", alpha: "SGD", minorUnits: 2 },
  { numeric: "704", alpha: "VND", minorUnits: 0 },
  { numeric: "764", alpha: "THB", minorUnits: 2 },
  { numeric: "784", alpha: "AED", minorUnits: 2 },
  { numeric: "826", alpha: "GBP", minorUnits: 2 },
  { numeric: "840", alpha: "USD", minorUnits: 2 },
  { numeric: "901", alpha: "TWD", minorUnits: 2 },
  { numeric: "978", alpha: "EUR", minorUnits: 2 },
  { numeric: "986", alpha: "BRL", minorUnits: 2 },
];

const BY_NUMERIC = new Map(CURRENCIES.map((c) => [c.numeric, c]));
const BY_ALPHA = new Map(CURRENCIES.map((c) => [c.alpha, c]));

export function currencyByNumeric(numeric: string): CurrencyInfo | undefined {
  return BY_NUMERIC.get(numeric);
}

export function currencyByAlpha(alpha: string): CurrencyInfo | undefined {
  return BY_ALPHA.get(alpha.toUpperCase());
}
