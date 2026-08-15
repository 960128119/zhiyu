import { auth } from '@/app/(auth)/auth';
import { resolveWorkWatchlistProposal } from '@/lib/work-runtime';
import type {
  WatchlistProposalAction,
} from '@/lib/workshops/watchlist-proposals';
import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

function parseAction(value: unknown): WatchlistProposalAction | null {
  return value === 'apply' || value === 'reject' ? value : null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; eventId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, eventId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown;
      note?: unknown;
    };
    const action = parseAction(body.action);
    if (!action) {
      return NextResponse.json(
        { error: 'action must be apply or reject' },
        { status: 400 },
      );
    }

    const result = await resolveWorkWatchlistProposal({
      userId: session.user.id,
      workId: id,
      proposalEventId: eventId,
      action,
      note: typeof body.note === 'string' ? body.note : null,
      source: 'owner',
      reason: typeof body.note === 'string' ? body.note : null,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[WorkshopWatchlistProposalAPI] POST error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to resolve watchlist proposal',
      },
      { status: 400 },
    );
  }
}
