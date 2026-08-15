import { auth } from '@/app/(auth)/auth';
import {
  deleteWork,
  updateWork,
} from '@/lib/work-runtime';
import {
  applyWorkshopManifestToExisting,
  reviewWorkshopManifest,
} from '@/lib/workshops/manifest';
import { getWorkshopDetail } from '@/lib/workshops/service';
import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const detail = await getWorkshopDetail(session.user.id, id);
    if (!detail) {
      return NextResponse.json(
        { error: 'Workshop not found' },
        { status: 404 },
      );
    }

    return NextResponse.json(detail);
  } catch (error) {
    console.error('[WorkshopAPI] GET error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to load workshop',
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { workshop } = await deleteWork({
      userId: session.user.id,
      workId: id,
      source: "owner",
      reason: "Deleted from workshop API.",
    });

    return NextResponse.json({ workshop });
  } catch (error) {
    console.error('[WorkshopAPI] DELETE error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to delete workshop',
      },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const manifestYaml =
      typeof body.manifestYaml === "string" ? body.manifestYaml.trim() : "";
    if (manifestYaml) {
      const reviewResult = await reviewWorkshopManifest({
        userId: session.user.id,
        manifestYaml,
        allowExistingWorkshopId: id,
      });

      if (body.dryRun === true || body.apply === false) {
        return NextResponse.json(
          {
            review: reviewResult.review,
            manifest: reviewResult.manifest,
          },
          { status: 200 },
        );
      }

      const result = await applyWorkshopManifestToExisting({
        userId: session.user.id,
        workshopId: id,
        manifestYaml,
      });
      return NextResponse.json(result);
    }

    const heartbeatInput =
      body.heartbeat && typeof body.heartbeat === 'object'
        ? (body.heartbeat as Record<string, unknown>)
        : null;
    const { workshop, heartbeat } = await updateWork({
      userId: session.user.id,
      workId: id,
      source: "owner",
      reason: typeof body.reason === "string" ? body.reason : null,
      patch: {
        name: body.name,
        mission: body.mission,
        status: body.status,
        autonomyLevel: body.autonomyLevel,
        boundaryPolicy: body.boundaryPolicy,
        modelConfig: body.modelConfig,
        heartbeat: heartbeatInput
          ? {
              enabled:
                typeof heartbeatInput.enabled === 'boolean'
                  ? heartbeatInput.enabled
                  : undefined,
              mode:
                heartbeatInput.mode === 'suggested' ||
                heartbeatInput.mode === 'fixed_interval' ||
                heartbeatInput.mode === 'cron'
                  ? heartbeatInput.mode
                  : undefined,
              heartbeatPolicy:
                heartbeatInput.heartbeatPolicy &&
                typeof heartbeatInput.heartbeatPolicy === 'object'
                  ? (heartbeatInput.heartbeatPolicy as Record<string, unknown>)
                  : undefined,
            }
          : undefined,
      },
    });

    return NextResponse.json({ workshop, heartbeat });
  } catch (error) {
    console.error('[WorkshopAPI] PATCH error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to update workshop',
      },
      { status: 500 },
    );
  }
}
