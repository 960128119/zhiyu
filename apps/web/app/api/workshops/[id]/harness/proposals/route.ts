import { auth } from "@/app/(auth)/auth";
import {
  createHarnessChangeProposal,
  harnessChangeProposalInputSchema,
  harnessEvolutionRepository,
  listLegacyHarnessProposalProjections,
} from "@/lib/harness-evolution";
import { appendWorkshopEvent, getWorkshop } from "@/lib/workshops/service";
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
  const limit = parseHarnessListLimit(
    request.nextUrl.searchParams.get("limit"),
  );
  const proposals = await harnessEvolutionRepository.listProposals(id, limit);
  const legacyProposals = await listLegacyHarnessProposalProjections(id, limit);
  return NextResponse.json({
    proposals,
    legacyProposals,
    interfaceVersion: "harness-change-proposal-list.v2",
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
    const parsed = harnessChangeProposalInputSchema.safeParse(
      await request.json(),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid Harness proposal", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    if (parsed.data.workId !== id || parsed.data.proposedBy !== "owner") {
      return NextResponse.json(
        { error: "Owner API may only create an owner proposal for this Work" },
        { status: 403 },
      );
    }
    const proposal = await harnessEvolutionRepository.persistProposal(
      createHarnessChangeProposal(parsed.data),
    );
    await appendWorkshopEvent({
      workshopId: id,
      type: "harness_change_proposed",
      title: "Harness change proposed",
      body: proposal.failurePattern,
      metadata: {
        proposalId: proposal.id,
        interfaceVersion: proposal.interfaceVersion,
        componentTypes: [
          ...new Set(proposal.changes.map((change) => change.componentType)),
        ],
        riskLevel: proposal.riskLevel,
        status: proposal.status,
      },
    });
    return NextResponse.json({ proposal }, { status: 201 });
  } catch (error) {
    console.error("[HarnessProposalsAPI] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Proposal failed" },
      { status: 400 },
    );
  }
}
