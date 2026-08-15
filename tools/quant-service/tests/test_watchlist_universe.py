import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import provider


class WatchlistUniverseTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.original_config_path = provider.WATCHLIST_CONFIG_PATH
        self.original_universe_path = provider.WATCHLIST_UNIVERSE_PATH
        provider.WATCHLIST_CONFIG_PATH = Path(self.tmp.name) / "watchlist.json"
        provider.WATCHLIST_UNIVERSE_PATH = (
            Path(self.tmp.name) / "watchlist_universe.json"
        )
        provider.invalidate_cache()

    def tearDown(self) -> None:
        provider.WATCHLIST_CONFIG_PATH = self.original_config_path
        provider.WATCHLIST_UNIVERSE_PATH = self.original_universe_path
        provider.invalidate_cache()
        self.tmp.cleanup()

    def test_legacy_flat_watchlist_is_exposed_as_core_pool(self) -> None:
        provider.WATCHLIST_CONFIG_PATH.write_text(
            json.dumps({"codes": ["600519.SH", "300750.SZ"]}),
            encoding="utf-8",
        )

        config = provider.get_watchlist_config()

        self.assertEqual(config["source"], "legacy_migrated")
        self.assertEqual(config["codes"], ["600519.SH", "300750.SZ"])
        self.assertEqual(config["pool_counts"], {"core": 2})
        self.assertEqual(
            [item["pool"] for item in config["items"]],
            ["core", "core"],
        )
        self.assertTrue(provider.WATCHLIST_UNIVERSE_PATH.exists())

    def test_structured_items_keep_candidates_out_of_active_codes(self) -> None:
        config = provider.save_watchlist_codes(
            ["600519.SH", "300750.SZ"],
            [
                {
                    "code": "600519.SH",
                    "pool": "core",
                    "status": "active",
                    "source": "owner",
                },
                {
                    "code": "300750.SZ",
                    "pool": "holding",
                    "status": "protected",
                    "source": "paper_account",
                },
                {
                    "code": "300274.SZ",
                    "pool": "candidate",
                    "status": "active",
                    "source": "watchlist_hunter",
                },
            ],
        )

        self.assertEqual(config["codes"], ["600519.SH", "300750.SZ"])
        self.assertEqual(
            config["pool_counts"],
            {"core": 1, "holding": 1, "candidate": 1},
        )
        universe = json.loads(
            provider.WATCHLIST_UNIVERSE_PATH.read_text(encoding="utf-8")
        )
        self.assertEqual(len(universe["items"]), 3)


if __name__ == "__main__":
    unittest.main()
