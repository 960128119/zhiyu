import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import paper_trading


class PaperBuyDeviationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.account = {
            "initial_cash": 1_000_000,
            "cash": 1_000_000,
            "lots": [],
            "orders": [],
        }
        self.quote = {"code": "600519.SH", "name": "贵州茅台", "price": 100.0, "change_pct": 0}
        self.original_position_market_value = paper_trading._position_market_value
        paper_trading._position_market_value = lambda _account, _code: 0

    def tearDown(self) -> None:
        paper_trading._position_market_value = self.original_position_market_value

    def test_buy_allows_limit_inside_default_two_percent_plan_tolerance(self) -> None:
        paper_trading._validate_order(
            self.account,
            self.quote,
            "buy",
            100,
            102.0,
            planned_price=100.0,
        )

    def test_buy_rejects_limit_above_default_two_percent_plan_tolerance(self) -> None:
        with self.assertRaisesRegex(
            paper_trading.PaperTradingError,
            "planned price tolerance",
        ):
            paper_trading._validate_order(
                self.account,
                self.quote,
                "buy",
                100,
                102.01,
                planned_price=100.0,
            )

    def test_sell_does_not_require_planned_buy_price(self) -> None:
        original_available_quantity = paper_trading._available_quantity
        paper_trading._available_quantity = lambda _account, _code: 100
        try:
            paper_trading._validate_order(
                self.account,
                self.quote,
                "sell",
                100,
                99.0,
            )
        finally:
            paper_trading._available_quantity = original_available_quantity


if __name__ == "__main__":
    unittest.main()
