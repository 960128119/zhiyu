import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { ragRuntimeDeps } from "@/lib/runtime-api/rag";
import { handleRagSearch } from "@openzhiyu/runtime-api/rag";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await handleRagSearch(
    ragRuntimeDeps,
    session.user,
    await request.json(),
  );
  return NextResponse.json(result.body, { status: result.status });
}
