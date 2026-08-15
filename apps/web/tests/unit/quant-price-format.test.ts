import { describe, expect, it } from "vitest";

import {
  formatPrice,
  isThreeDecimalPriceCode,
  priceDigitsForCode,
} from "@/lib/quant/price-format";

describe("quant price formatting", () => {
  it("formats ETF and fund prices with three decimals", () => {
    expect(isThreeDecimalPriceCode("159278.SZ")).toBe(true);
    expect(priceDigitsForCode("159278.SZ")).toBe(3);
    expect(formatPrice(0.957, "159278.SZ")).toBe("0.957");
    expect(formatPrice(0.883, "159278.SZ")).toBe("0.883");
  });

  it("keeps regular A-share stock prices at two decimals", () => {
    expect(isThreeDecimalPriceCode("600519.SH")).toBe(false);
    expect(priceDigitsForCode("600519.SH")).toBe(2);
    expect(formatPrice(1358.98, "600519.SH")).toBe("1,358.98");
  });
});
