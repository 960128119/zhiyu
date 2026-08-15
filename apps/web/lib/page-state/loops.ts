import 'server-only';

import { listLoopApprovalInbox } from '@/lib/loops/approval-inbox';
import { listLoopDashboard } from '@/lib/loops/dashboard';
import { getRuntimeStatusSnapshot } from '@/lib/runtime/status';

export async function getLoopsPageState(userId: string) {
  const [dashboard, approvals, runtime] = await Promise.all([
    listLoopDashboard(userId),
    listLoopApprovalInbox(userId, { limit: 100 }),
    getRuntimeStatusSnapshot(userId),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    dashboard,
    approvals,
    runtime,
  };
}
