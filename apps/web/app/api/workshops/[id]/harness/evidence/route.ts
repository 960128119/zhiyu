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
  const evidence = await harnessEvolutionRepository.listEvidence(
    id,
    parseHarnessListLimit(request.nextUrl.searchParams.get("limit")),
  );
  return NextResponse.json({
    evidence,
    interfaceVersion: "run-evidence-list.v1",
    generatedAt: new Date().toISOString(),
  });
}
