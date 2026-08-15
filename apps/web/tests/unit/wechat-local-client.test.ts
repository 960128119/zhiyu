import { afterEach, describe, expect, it } from 'vitest';
import {
  getWechatLocalHealth,
  runWechatLocalJson,
} from '@/lib/wechat-local/client';

const originalBinary = process.env.WECHAT_LOCAL_WX_BINARY;

afterEach(() => {
  if (originalBinary === undefined) {
    process.env.WECHAT_LOCAL_WX_BINARY = undefined;
  } else {
    process.env.WECHAT_LOCAL_WX_BINARY = originalBinary;
  }
});

describe('wechat local client', () => {
  it('parses JSON stdout from the configured binary', async () => {
    process.env.WECHAT_LOCAL_WX_BINARY = process.execPath;

    const result = await runWechatLocalJson<{ ok: boolean }>([
      '-e',
      'console.log(JSON.stringify({ ok: true }))',
    ]);

    expect(result).toEqual({ ok: true });
  });

  it('reports health from the configured binary without probing data', async () => {
    process.env.WECHAT_LOCAL_WX_BINARY = process.execPath;

    const health = await getWechatLocalHealth();

    expect(health.ok).toBe(true);
    expect(health.binary).toBe(process.execPath);
    expect(health.version).toMatch(/^v\d+\./);
  });
});
