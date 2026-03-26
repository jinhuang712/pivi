import { describe, expect, it, vi } from 'vitest';
import { probeInviteEndpointWithRetry, resolveJoinRoom } from '../lib/joinRoom';

describe('joinRoom', () => {
  it('retries endpoint probing until reachable', async () => {
    const probeRoomEndpointImpl = vi
      .fn()
      .mockResolvedValueOnce({ reachable: false, failureKind: 'connection-refused', elapsedMs: 10 })
      .mockResolvedValueOnce({ reachable: true, failureKind: null, elapsedMs: 20 });

    const result = await probeInviteEndpointWithRetry('127.0.0.1', 7788, [100, 200], probeRoomEndpointImpl);

    expect(probeRoomEndpointImpl).toHaveBeenCalledTimes(2);
    expect(result.reachable).toBe(true);
  });

  it('falls back to relay when direct endpoint probing fails but room exists', async () => {
    const result = await resolveJoinRoom('AB12-CD34-EF56-GH78', {
      findRoomByInviteCode: () => ({
        inviteCode: 'AB12-CD34-EF56-GH78',
        roomName: '测试房间',
        hostName: 'Host',
      }),
      prettifyInviteCodeImpl: vi.fn().mockResolvedValue('AB12-CD34-EF56-GH78'),
      parseInviteCodeImpl: vi.fn().mockResolvedValue({
        endpointScope: 'private-lan-ipv4',
        joinMode: 'direct-host',
        ipv4: '127.0.0.1',
        port: 7788,
        expirySlot: 500,
      }),
      probeRoomEndpointImpl: vi
        .fn()
        .mockResolvedValue({ reachable: false, failureKind: 'timeout', elapsedMs: 50 }),
    });

    expect(result.networkPath).toBe('relay');
    expect(result.resolutionNotice).toBe('房主直连入口不可达，已回退到中转模式。');
  });

  it('returns room not found before opening confirm modal', async () => {
    await expect(
      resolveJoinRoom('AB12-CD34-EF56-GH78', {
        findRoomByInviteCode: () => undefined,
        prettifyInviteCodeImpl: vi.fn().mockResolvedValue('AB12-CD34-EF56-GH78'),
        parseInviteCodeImpl: vi.fn().mockResolvedValue({
          endpointScope: 'private-lan-ipv4',
          joinMode: 'direct-host',
          ipv4: '127.0.0.1',
          port: 7788,
          expirySlot: 500,
        }),
        probeRoomEndpointImpl: vi.fn(),
      }),
    ).rejects.toMatchObject({
      code: 'room-not-found',
    });
  });

  it('returns invalid invite when parsing fails', async () => {
    await expect(
      resolveJoinRoom('AB12-CD34-EF56-GH78', {
        findRoomByInviteCode: () => undefined,
        prettifyInviteCodeImpl: vi.fn().mockResolvedValue('AB12-CD34-EF56-GH78'),
        parseInviteCodeImpl: vi.fn().mockRejectedValue(new Error('invalid invite')),
      }),
    ).rejects.toMatchObject({
      code: 'invalid-invite',
      message: '邀请码无效或已过期，请确认输入无误。',
    });
  });
});
