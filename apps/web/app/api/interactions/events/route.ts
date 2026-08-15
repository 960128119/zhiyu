import { auth } from '@/app/(auth)/auth';
import {
  getInteractionEventsByIds,
  listInteractionEvents,
} from '@/lib/interactions/service';
import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

function parseDateParam(value: string | null) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = request.nextUrl.searchParams;
    const ids = params
      .getAll('id')
      .flatMap((value) => value.split(','))
      .concat((params.get('ids') ?? '').split(','))
      .map((value) => value.trim())
      .filter(Boolean);
    if (ids.length > 0) {
      const events = await getInteractionEventsByIds({
        userId: session.user.id,
        ids,
      });
      return NextResponse.json({ events });
    }

    const statuses = params
      .getAll('status')
      .flatMap((value) => value.split(','))
      .map((value) => value.trim())
      .filter(Boolean) as any;
    const events = await listInteractionEvents({
      userId: session.user.id,
      platform: params.get('platform') ?? undefined,
      conversationId: params.get('conversationId') ?? undefined,
      statuses: statuses.length > 0 ? statuses : undefined,
      since: parseDateParam(params.get('since')),
      until: parseDateParam(params.get('until')),
      limit: Number(params.get('limit') ?? 50),
    });

    return NextResponse.json({ events });
  } catch (error) {
    console.error('[InteractionsEventsAPI] GET error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to load interactions',
      },
      { status: 500 },
    );
  }
}
