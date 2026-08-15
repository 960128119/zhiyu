import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import paper_trading


class PaperPricePrecisionTest(unittest.TestCase):
    def test_etf_price_precision_uses_three_decimals(self) -> None:
        quote = {"code": "159278.SZ", "price": 0.957, "change_pct": 2.24}

        self.assertEqual(paper_trading._price_precision("159278.SZ"), 3)
        self.assertEqual(paper_trading._format_price(0.957, "159278.SZ"), "0.957")
        self.assertEqual(paper_trading._price_limits(quote), (0.842, 1.03))

    def test_regular_stock_price_precision_stays_two_decimals(self) -> None:
        quote = {"code": "600519.SH", "price": 1358.98, "change_pct": 0.62}

        self.assertEqual(paper_trading._price_precision("600519.SH"), 2)
        self.assertEqual(paper_trading._format_price(1358.98, "600519.SH"), "1358.98")
        self.assertEqual(paper_trading._price_limits(quote), (1215.55, 1485.67))


if __name__ == "__main__":
    unittest.main()
