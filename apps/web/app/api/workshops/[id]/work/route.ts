import { auth } from "@/app/(auth)/auth";
import { getWorkModelSnapshot } from "@/lib/work-runtime";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const snapshot = await getWorkModelSnapshot({
      userId: session.user.id,
      workId: id,
      versionLimit: 10,
    });
    if (!snapshot) {
      return NextResponse.json(
        { error: "Workshop not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      work: snapshot.work,
      versions: snapshot.versions,
      interfaceVersion: snapshot.interfaceVersion,
      generatedAt: snapshot.generatedAt,
    });
  } catch (error) {
    console.error("[WorkshopWorkAPI] GET error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load workshop work model",
      },
      { status: 500 },
    );
  }
}
