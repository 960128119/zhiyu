from __future__ import annotations

import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

TOOLS_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS_DIR))

import a_stock_data  # noqa: E402


class FakeDataFrame:
    empty = False

    def to_dict(self, orient: str):
        if orient != "records":
            raise AssertionError(f"unexpected orient: {orient}")
        return [
            {
                "序号": 1,
                "板块": "机器人",
                "涨跌幅": 3.2,
                "上涨家数": 20,
                "下跌家数": 3,
                "领涨股": "中大力德",
                "领涨股-涨跌幅": 10.0,
                "总成交额": 188.6,
                "净流入": 5.3,
            },
            {
                "序号": 2,
                "板块": "白酒",
                "涨跌幅": -1.4,
                "上涨家数": 2,
                "下跌家数": 18,
                "领涨股": "舍得酒业",
                "领涨股-涨跌幅": 1.2,
                "总成交额": 166.1,
                "净流入": -8.1,
            },
        ]


class SignalsFallbackTest(unittest.TestCase):
    def test_industry_comparison_uses_ths_fallback_when_eastmoney_fails(self):
        fake_akshare = types.SimpleNamespace(
            stock_fund_flow_individual=lambda symbol: None,
            stock_board_industry_summary_ths=lambda: FakeDataFrame(),
        )

        def fake_fund_flow_fallback(code: str, fund_flow_days: int):
            return {
                "source": "akshare:stock_fund_flow_individual:ths",
                "degraded": True,
                "code": code,
                "periodDays": 20,
                "netFlow": 123.0,
            }

        with (
            patch.dict(sys.modules, {"akshare": fake_akshare}),
            patch.object(
                a_stock_data,
                "stock_fund_flow_120d",
                side_effect=RuntimeError("Remote end closed connection"),
            ),
            patch.object(
                a_stock_data,
                "stock_fund_flow_summary_fallback",
                side_effect=fake_fund_flow_fallback,
            ),
            patch.object(a_stock_data, "eastmoney_concept_blocks", return_value={}),
            patch.object(
                a_stock_data,
                "industry_comparison",
                side_effect=RuntimeError("Remote end closed connection"),
            ),
            patch.object(a_stock_data, "lockup_expiry", return_value={}),
        ):
            result = a_stock_data.action_signals(
                {"code": "300124", "fundFlowDays": 20, "industryTopN": 2}
            )

        industry = result["data"]["industryComparison"]
        self.assertTrue(industry["degraded"])
        self.assertEqual(industry["source"], "akshare:stock_board_industry_summary_ths")
        self.assertEqual(industry["top"][0]["name"], "机器人")
        self.assertEqual(industry["bottom"][0]["name"], "白酒")
        self.assertEqual(
            result["dataQuality"]["industryComparison"]["status"], "degraded"
        )
        self.assertIn("AkShare THS industry summary", result["sources"])
        self.assertIn(
            "industryComparison unavailable; using degraded THS industry summary fallback.",
            result["warnings"],
        )


if __name__ == "__main__":
    unittest.main()
