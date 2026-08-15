export function isThreeDecimalPriceCode(code?: string | null): boolean {
  const symbol = String(code ?? "")
    .trim()
    .toUpperCase()
    .split(".", 1)[0];

  return /^(159|16|18|50|51|52|56|58)\d{3}$/.test(symbol);
}

export function priceDigitsForCode(code?: string | null): number {
  return isThreeDecimalPriceCode(code) ? 3 : 2;
}

export function formatPrice(value: number, code?: string | null): string {
  const digits = priceDigitsForCode(code);
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}
