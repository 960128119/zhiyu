import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}));

import { runAStockDataAction } from '@/lib/workshops/a-stock-data-client';

function mockSpawnResult(input: {
  stdout?: string;
  stderr?: string;
  code?: number;
}) {
  const child = new EventEmitter() as EventEmitter & {
    stdin: { end: ReturnType<typeof vi.fn> };
    stdout: PassThrough;
    stderr: PassThrough;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdin = { end: vi.fn() };
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = vi.fn();

  process.nextTick(() => {
    if (input.stdout) child.stdout.write(input.stdout);
    if (input.stderr) child.stderr.write(input.stderr);
    child.stdout.end();
    child.stderr.end();
    child.emit('close', input.code ?? 0);
  });

  return child;
}

describe('runAStockDataAction', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it('passes action args to the Python CLI and parses JSON stdout', async () => {
    const child = mockSpawnResult({
      stdout: JSON.stringify({
        ok: true,
        action: 'quote',
        data: { quotes: [{ code: '600519' }] },
      }),
    });
    spawnMock.mockReturnValue(child);

    const result = await runAStockDataAction({
      action: 'quote',
      args: { codes: ['600519'] },
    });

    expect(result.ok).toBe(true);
    expect(result.action).toBe('quote');
    expect(child.stdin.end).toHaveBeenCalledWith(
      JSON.stringify({ action: 'quote', args: { codes: ['600519'] } }),
    );
    expect(spawnMock).toHaveBeenCalledWith(
      expect.stringMatching(/python/i),
      [expect.stringMatching(/tools[\\/]a-stock-data[\\/]cli\.py$/)],
      expect.objectContaining({
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      }),
    );
  });

  it('returns a structured error when the CLI output is not valid JSON', async () => {
    spawnMock.mockReturnValue(
      mockSpawnResult({
        stderr: 'boom',
        code: 2,
      }),
    );

    const result = await runAStockDataAction({
      action: 'signals',
      args: { code: '600519' },
    });

    expect(result).toEqual({
      ok: false,
      action: 'signals',
      error: 'boom',
      errorType: 'InvalidJson',
    });
  });
});
