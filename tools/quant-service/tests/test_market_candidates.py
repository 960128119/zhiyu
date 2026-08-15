import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import provider


def fake_quotes(codes: list[str]) -> list[dict]:
    rows = []
    for index, code in enumerate(codes):
        rows.append(
            {
                "code": code,
                "name": f"name-{index}",
                "price": 10 + index,
                "change_pct": 1.0 + (index % 3),
                "turnover_billion": 1.0 + index / 10,
                "turnover_rate": 2.0,
                "pe_ttm": 20.0,
                "pb": 2.0,
                "updated_at": "2026-07-28T15:00:00+08:00",
            }
        )
    return rows


class MarketCandidateFallbackTest(unittest.TestCase):
    def setUp(self) -> None:
        self.original_provider = os.environ.get("QUANT_CANDIDATE_PROVIDER")
        self.original_quotes = provider._tencent_watchlist_quotes
        os.environ["QUANT_CANDIDATE_PROVIDER"] = "tencent"
        provider._tencent_watchlist_quotes = fake_quotes

    def tearDown(self) -> None:
        if self.original_provider is None:
            os.environ.pop("QUANT_CANDIDATE_PROVIDER", None)
        else:
            os.environ["QUANT_CANDIDATE_PROVIDER"] = self.original_provider
        provider._tencent_watchlist_quotes = self.original_quotes

    def test_tencent_fallback_varies_by_theme(self) -> None:
        medicine = provider.quant_market_candidates(
            theme="\u533b\u836f",
            limit=5,
            min_turnover_billion=0,
            exclude_watchlist=False,
        )
        consumption = provider.quant_market_candidates(
            theme="\u6d88\u8d39",
            limit=5,
            min_turnover_billion=0,
            exclude_watchlist=False,
        )

        medicine_codes = [item["code"] for item in medicine["items"]]
        consumption_codes = [item["code"] for item in consumption["items"]]

        self.assertEqual(medicine["data_source_detail"], "tencent_theme_seed_fallback")
        self.assertEqual(consumption["data_source_detail"], "tencent_theme_seed_fallback")
        self.assertTrue(medicine_codes)
        self.assertTrue(consumption_codes)
        self.assertNotEqual(medicine_codes, consumption_codes)
        medicine_seed_codes = set(provider._fallback_theme_seed_codes("\u533b\u836f"))
        consumption_seed_codes = set(provider._fallback_theme_seed_codes("\u6d88\u8d39"))
        self.assertTrue(set(medicine_codes).issubset(medicine_seed_codes))
        self.assertTrue(set(consumption_codes).issubset(consumption_seed_codes))

    def test_unknown_theme_does_not_claim_unrelated_seed_matches(self) -> None:
        result = provider.quant_market_candidates(
            theme="\u672a\u77e5\u4e3b\u9898",
            limit=5,
            min_turnover_billion=0,
            exclude_watchlist=False,
        )

        self.assertEqual(result["items"], [])

    def test_broad_market_theme_uses_diversified_seed_pool(self) -> None:
        result = provider.quant_market_candidates(
            theme="\u5168\u5e02\u573a",
            limit=12,
            min_turnover_billion=0,
            exclude_watchlist=False,
        )

        theme_sets = {tuple(item["themes"]) for item in result["items"]}

        self.assertEqual(result["keywords"], [])
        self.assertGreaterEqual(len(result["items"]), 8)
        self.assertGreaterEqual(len(theme_sets), 3)


if __name__ == "__main__":
    unittest.main()
