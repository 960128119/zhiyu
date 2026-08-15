import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import paper_trading, provider


class PaperControlGuardTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.original_provider = os.environ.get("QUANT_DATA_PROVIDER")
        self.original_account_path = paper_trading.PAPER_ACCOUNT_PATH
        self.original_config_path = provider.WATCHLIST_CONFIG_PATH
        self.original_universe_path = provider.WATCHLIST_UNIVERSE_PATH
        paper_trading.PAPER_ACCOUNT_PATH = Path(self.tmp.name) / "paper_account.json"
        provider.WATCHLIST_CONFIG_PATH = Path(self.tmp.name) / "watchlist.json"
        provider.WATCHLIST_UNIVERSE_PATH = (
            Path(self.tmp.name) / "watchlist_universe.json"
        )
        provider.invalidate_cache()

    def tearDown(self) -> None:
        if self.original_provider is None:
            os.environ.pop("QUANT_DATA_PROVIDER", None)
        else:
            os.environ["QUANT_DATA_PROVIDER"] = self.original_provider
        paper_trading.PAPER_ACCOUNT_PATH = self.original_account_path
        provider.WATCHLIST_CONFIG_PATH = self.original_config_path
        provider.WATCHLIST_UNIVERSE_PATH = self.original_universe_path
        provider.invalidate_cache()
        self.tmp.cleanup()

    def test_sample_mode_rejects_paper_order_mutation(self) -> None:
        os.environ["QUANT_DATA_PROVIDER"] = "sample"
        provider.WATCHLIST_CONFIG_PATH.write_text(
            json.dumps({"codes": ["600519.SH"]}),
            encoding="utf-8",
        )

        with self.assertRaisesRegex(
            paper_trading.PaperTradingError,
            "Paper order control is blocked",
        ):
            paper_trading.place_paper_order(
                {
                    "code": "600519.SH",
                    "side": "buy",
                    "quantity": 100,
                    "limit_price": 100.0,
                    "planned_price": 100.0,
                    "actor": "test",
                }
            )

        account = json.loads(
            paper_trading.PAPER_ACCOUNT_PATH.read_text(encoding="utf-8")
        )
        self.assertEqual(account["orders"], [])
        self.assertEqual(account["cash"], 1_000_000.0)
        self.assertEqual(account["frozen_cash"], 0.0)


if __name__ == "__main__":
    unittest.main()
