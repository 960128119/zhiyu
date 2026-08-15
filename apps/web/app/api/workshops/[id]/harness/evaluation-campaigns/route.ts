import { auth } from "@/app/(auth)/auth";
import { harnessEvolutionRepository } from "@/lib/harness-evolution";
import { getWorkshop } from "@/lib/workshops/service";
import { NextResponse, type NextRequest } from "next/server";
import { parseHarnessListLimit } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!(await getWorkshop(session.user.id, id))) {
    return NextResponse.json({ error: "Workshop not found" }, { status: 404 });
  }
  const campaigns = await harnessEvolutionRepository.listEvaluationCampaigns(
    id,
    parseHarnessListLimit(request.nextUrl.searchParams.get("limit")),
  );
  return NextResponse.json({
    campaigns,
    interfaceVersion: "harness-evaluation-campaign-list.v1",
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    if (!(await getWorkshop(session.user.id, id))) {
      return NextResponse.json(
        { error: "Workshop not found" },
        { status: 404 },
      );
    }
    const body = (await request.json()) as Record<string, unknown>;
    const required = [
      "suiteId",
      "baselineWorkVersionId",
      "baselineHarnessSnapshotId",
      "candidateHarnessSnapshotId",
    ];
    if (required.some((key) => typeof body[key] !== "string" || !body[key])) {
      return NextResponse.json(
        { error: "Missing evaluation campaign identifiers" },
        { status: 400 },
      );
    }
    const [suite, baselineSnapshot, candidateSnapshot] = await Promise.all([
      harnessEvolutionRepository.getEvaluationSuite(String(body.suiteId)),
      harnessEvolutionRepository.getSnapshot(
        id,
        String(body.baselineHarnessSnapshotId),
      ),
      harnessEvolutionRepository.getSnapshot(
        id,
        String(body.candidateHarnessSnapshotId),
      ),
    ]);
    if (!suite || (suite.userId && suite.userId !== session.user.id)) {
      return NextResponse.json(
        { error: "Evaluation suite not found" },
        { status: 404 },
      );
    }
    if (!baselineSnapshot || !candidateSnapshot) {
      return NextResponse.json(
        { error: "Evaluation snapshots must belong to this Work" },
        { status: 400 },
      );
    }
    if (
      baselineSnapshot.workVersionId !== body.baselineWorkVersionId ||
      (typeof body.candidateWorkVersionId === "string" &&
        candidateSnapshot.workVersionId !== body.candidateWorkVersionId)
    ) {
      return NextResponse.json(
        { error: "Evaluation Work version and Harness snapshot do not match" },
        { status: 409 },
      );
    }
    if (typeof body.changeProposalId === "string") {
      const proposal = await harnessEvolutionRepository.getProposal(
        id,
        body.changeProposalId,
      );
      if (!proposal) {
        return NextResponse.json(
          { error: "Harness proposal not found" },
          { status: 404 },
        );
      }
    }
    const campaign = await harnessEvolutionRepository.createEvaluationCampaign({
      workshopId: id,
      suiteId: String(body.suiteId),
      baselineWorkVersionId: String(body.baselineWorkVersionId),
      candidateWorkVersionId:
        typeof body.candidateWorkVersionId === "string"
          ? body.candidateWorkVersionId
          : null,
      baselineHarnessSnapshotId: String(body.baselineHarnessSnapshotId),
      candidateHarnessSnapshotId: String(body.candidateHarnessSnapshotId),
      changeProposalId:
        typeof body.changeProposalId === "string"
          ? body.changeProposalId
          : null,
      runtimeContract:
        body.runtimeContract && typeof body.runtimeContract === "object"
          ? (body.runtimeContract as Record<string, unknown>)
          : {},
      budget:
        body.budget && typeof body.budget === "object"
          ? (body.budget as Record<string, unknown>)
          : {},
    });
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Campaign creation failed",
      },
      { status: 400 },
    );
  }
}
