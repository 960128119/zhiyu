import { auth } from '@/app/(auth)/auth';
import {
  markInteractionEventsProcessed,
  type InteractionEventStatus,
} from '@/lib/interactions/service';
import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = new Set<InteractionEventStatus>([
  'new',
  'seen',
  'processing',
  'processed',
  'ignored',
  'failed',
]);

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const ids = Array.isArray(body.ids)
      ? body.ids.map((id: unknown) => String(id))
      : [];
    const status = String(body.status ?? '') as InteractionEventStatus;
    if (!ids.length || !VALID_STATUSES.has(status)) {
      return NextResponse.json(
        { error: 'ids and valid status are required' },
        { status: 400 },
      );
    }

    const result = await markInteractionEventsProcessed({
      userId: session.user.id,
      ids,
      status,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[InteractionEventStatusAPI] PATCH error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to update interaction status',
      },
      { status: 500 },
    );
  }
}
