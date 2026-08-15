import { fetchQuantDashboard } from "@/lib/quant/client";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const dashboard = await fetchQuantDashboard();
    return NextResponse.json(dashboard);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Quant service unavailable";
    return NextResponse.json(
      {
        error: message,
        hint: "Start tools/quant-service or set QUANT_SERVICE_URL.",
      },
      { status: 503 },
    );
  }
}
