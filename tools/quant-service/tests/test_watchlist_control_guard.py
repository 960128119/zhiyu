import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import provider
from app.main import WatchlistConfigRequest, update_watchlist_config
from fastapi import HTTPException


class WatchlistControlGuardTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.original_provider = os.environ.get("QUANT_DATA_PROVIDER")
        self.original_config_path = provider.WATCHLIST_CONFIG_PATH
        self.original_universe_path = provider.WATCHLIST_UNIVERSE_PATH
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
        provider.WATCHLIST_CONFIG_PATH = self.original_config_path
        provider.WATCHLIST_UNIVERSE_PATH = self.original_universe_path
        provider.invalidate_cache()
        self.tmp.cleanup()

    def test_sample_mode_rejects_active_watchlist_mutation(self) -> None:
        os.environ["QUANT_DATA_PROVIDER"] = "sample"
        provider.WATCHLIST_CONFIG_PATH.write_text(
            json.dumps({"codes": ["600519.SH"]}),
            encoding="utf-8",
        )

        with self.assertRaises(HTTPException) as raised:
            update_watchlist_config(
                WatchlistConfigRequest(
                    **{
                "codes": ["000977.SZ"],
                "items": [
                    {
                        "code": "000977.SZ",
                        "pool": "core",
                        "status": "active",
                        "source": "watchlist_hunter",
                    }
                ],
                    }
                )
            )

        self.assertEqual(raised.exception.status_code, 409)
        self.assertIn("control", str(raised.exception.detail).lower())
        self.assertEqual(
            json.loads(provider.WATCHLIST_CONFIG_PATH.read_text(encoding="utf-8")),
            {"codes": ["600519.SH"]},
        )


if __name__ == "__main__":
    unittest.main()
