import { auth } from '@/app/(auth)/auth';
import { listInteractionThreads } from '@/lib/interactions/service';
import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = request.nextUrl.searchParams;
    const threads = await listInteractionThreads({
      userId: session.user.id,
      platform: params.get('platform') ?? undefined,
      limit: Number(params.get('limit') ?? 50),
    });

    return NextResponse.json({ threads });
  } catch (error) {
    console.error('[InteractionThreadsAPI] GET error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to load interaction threads',
      },
      { status: 500 },
    );
  }
}
