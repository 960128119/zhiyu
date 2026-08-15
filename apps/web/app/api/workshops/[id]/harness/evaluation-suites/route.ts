import { auth } from "@/app/(auth)/auth";
import {
  evaluationSuitesForRole,
  harnessEvolutionRepository,
} from "@/lib/harness-evolution";
import { getWorkshop } from "@/lib/workshops/service";
import { buildAgentToolMatrix } from "@/lib/agent-tools/matrix";
import { buildWorkshopWorkModel } from "@/lib/workshops/work-model";
import { listLoopsForWorkshop } from "@/lib/loops/service";
import { loadSkills } from "@/lib/ai/skills/loader";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const workshop = await getWorkshop(session.user.id, id);
  if (!workshop) {
    return NextResponse.json({ error: "Workshop not found" }, { status: 404 });
  }
  const loops = await listLoopsForWorkshop({
    userId: session.user.id,
    workshopId: id,
    limit: 200,
  });
  const toolMatrix = buildAgentToolMatrix({
    runtime: "workshop",
    workshopId: id,
    workshop,
  });
  const workModel = buildWorkshopWorkModel({
    workshop,
    loops,
    toolMatrix,
    availableSkillNames: loadSkills().map((skill) => skill.name),
  });
  const suites = [];
  for (const definition of evaluationSuitesForRole(workModel.manifest.role)) {
    suites.push(
      await harnessEvolutionRepository.persistEvaluationSuite(definition),
    );
  }
  return NextResponse.json({
    suites,
    workRole: workModel.manifest.role,
    interfaceVersion: "harness-evaluation-suites.v1",
  });
}
