import { auth } from "@/app/(auth)/auth";
import {
  harnessEvolutionRepository,
  runPersistedHarnessEvaluationCampaign,
} from "@/lib/harness-evolution";
import { appendWorkshopEvent, getWorkshop } from "@/lib/workshops/service";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; campaignId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, campaignId } = await params;
  if (!(await getWorkshop(session.user.id, id))) {
    return NextResponse.json({ error: "Workshop not found" }, { status: 404 });
  }
  const campaign = await harnessEvolutionRepository.getEvaluationCampaign(
    id,
    campaignId,
  );
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  const runs = await harnessEvolutionRepository.listEvaluationRuns(campaign.id);
  return NextResponse.json({
    campaign,
    runs,
    interfaceVersion: "harness-evaluation-campaign-detail.v1",
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; campaignId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id, campaignId } = await params;
    if (!(await getWorkshop(session.user.id, id))) {
      return NextResponse.json(
        { error: "Workshop not found" },
        { status: 404 },
      );
    }
    const campaign = await harnessEvolutionRepository.getEvaluationCampaign(
      id,
      campaignId,
    );
    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 },
      );
    }
    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown;
    };
    if (body.action === "cancel") {
      if (campaign.status !== "pending") {
        return NextResponse.json(
          { error: "Only a pending campaign can be cancelled" },
          { status: 409 },
        );
      }
      const cancelled =
        await harnessEvolutionRepository.completeEvaluationCampaign({
          campaignId,
          status: "cancelled",
          summary: { reason: "Owner cancelled before execution." },
        });
      await appendWorkshopEvent({
        workshopId: id,
        type: "harness_evaluation_cancelled",
        title: "Harness evaluation cancelled",
        body: null,
        metadata: { campaignId },
      });
      return NextResponse.json({ ok: true, campaign: cancelled });
    }
    if (body.action !== "run") {
      return NextResponse.json(
        { error: "Action must be run or cancel" },
        { status: 400 },
      );
    }
    const result = await runPersistedHarnessEvaluationCampaign({
      workshopId: id,
      campaignId,
    });
    await appendWorkshopEvent({
      workshopId: id,
      type: "harness_evaluation_completed",
      title: "Harness evaluation completed",
      body: result.verdict?.summary ?? result.evaluation.warnings.join("; "),
      metadata: {
        campaignId,
        campaignStatus: result.campaignStatus,
        proposalStatus: result.proposalStatus,
        recommendedAction: result.evaluation.recommendedAction,
      },
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Campaign action failed",
      },
      { status: 409 },
    );
  }
}
