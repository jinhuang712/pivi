import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';

const inviteCodeMocks = vi.hoisted(() => ({
  getPreferredLocalIpv4: vi.fn(async () => '192.168.31.10'),
  prepareRoomInvite: vi.fn(async (): Promise<{
    inviteCode: string;
    port: number;
    reusedLastSuccessfulPort: boolean;
    usedExternalMapping: boolean;
    natMappingProtocol: 'upnp' | 'pcp' | 'nat-pmp' | null;
  }> => ({
    inviteCode: 'AB12-CD34-EF56-GH78',
    port: 7788,
    reusedLastSuccessfulPort: false,
    usedExternalMapping: false,
    natMappingProtocol: null,
  })),
  probeRoomEndpoint: vi.fn(async (): Promise<{ reachable: boolean; failureKind: string | null; elapsedMs: number }> => ({
    reachable: true,
    failureKind: null,
    elapsedMs: 10,
  })),
  prettifyInviteCode: vi.fn(async (code: string) => {
    const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return normalized.match(/.{1,4}/g)?.join('-') ?? normalized;
  }),
  parseInviteCode: vi.fn(async () => ({
    endpointScope: 'private-lan-ipv4',
    joinMode: 'direct-host',
    ipv4: '192.168.31.10',
    port: 7788,
    expirySlot: 512,
  })),
}));

const runtimeSessionMocks = vi.hoisted(() => ({
  startHostRuntimeSession: vi.fn(async () => ({
    roomId: 'AB12CD34EF56GH78',
    inviteCode: 'AB12-CD34-EF56-GH78',
    listenHost: '192.168.31.10',
    listenPort: 7788,
    latestSequence: 1,
    members: [
      {
        memberId: 'uuid-host',
        displayName: 'HuangJin',
        role: 'Host',
        connState: 'connected',
      },
    ],
  })),
  getHostRuntimeRoomState: vi.fn(async () => ({
    type: 'RoomState',
    payload: {
      roomId: 'AB12CD34EF56GH78',
      members: [
        {
          memberId: 'uuid-host',
          displayName: 'HuangJin',
          role: 'Host',
          connState: 'connected',
        },
      ],
    },
  })),
  getRemoteHostRuntimeRoomState: vi.fn(async () => ({
    type: 'RoomState',
    payload: {
      roomId: 'AB12CD34EF56GH78',
      members: [
        {
          memberId: 'uuid-host',
          displayName: 'HuangJin',
          role: 'Host',
          connState: 'connected',
        },
      ],
    },
  })),
  getHostRuntimeRoomEvents: vi.fn(async () => []),
  getRemoteHostRuntimeRoomEvents: vi.fn(async () => []),
  relayHostRuntimeSignal: vi.fn(async () => ({
    sequence: 4,
    targetMemberId: 'uuid-joiner',
    message: {
      type: 'WebRtcSignal',
      payload: {
        from: 'uuid-host',
        target: 'uuid-joiner',
        signalType: 'Offer',
        payload: '{"type":"offer","sdp":"offer-sdp"}',
      },
    },
  })),
  relayRemoteRuntimeSignal: vi.fn(async () => ({
    sequence: 4,
    targetMemberId: 'uuid-host',
    message: {
      type: 'WebRtcSignal',
      payload: {
        from: 'uuid-joiner',
        target: 'uuid-host',
        signalType: 'Answer',
        payload: '{"type":"answer","sdp":"answer-sdp"}',
      },
    },
  })),
  joinRemoteHostRuntimeSession: vi.fn(async () => ({
    roomId: 'AB12CD34EF56GH78',
    joinedMember: {
      memberId: 'uuid-joiner',
      displayName: 'HuangJin',
      role: 'Audience',
      connState: 'connected',
    },
    roomState: {
      type: 'RoomState',
      payload: {
        roomId: 'AB12CD34EF56GH78',
        members: [
          {
            memberId: 'uuid-host',
            displayName: 'HuangJin',
            role: 'Host',
            connState: 'connected',
          },
          {
            memberId: 'uuid-joiner',
            displayName: 'HuangJin',
            role: 'Audience',
            connState: 'connected',
          },
        ],
      },
    },
    latestSequence: 3,
  })),
}));

vi.mock('../lib/inviteCode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/inviteCode')>();

  return {
    ...actual,
    getPreferredLocalIpv4: inviteCodeMocks.getPreferredLocalIpv4,
    prepareRoomInvite: inviteCodeMocks.prepareRoomInvite,
    probeRoomEndpoint: inviteCodeMocks.probeRoomEndpoint,
    prettifyInviteCode: inviteCodeMocks.prettifyInviteCode,
    parseInviteCode: inviteCodeMocks.parseInviteCode,
    getCurrentInviteExpirySlot: () => 500,
  };
});

vi.mock('../lib/runtimeSession', () => ({
  startHostRuntimeSession: runtimeSessionMocks.startHostRuntimeSession,
  getHostRuntimeRoomState: runtimeSessionMocks.getHostRuntimeRoomState,
  getRemoteHostRuntimeRoomState: runtimeSessionMocks.getRemoteHostRuntimeRoomState,
  getHostRuntimeRoomEvents: runtimeSessionMocks.getHostRuntimeRoomEvents,
  getRemoteHostRuntimeRoomEvents: runtimeSessionMocks.getRemoteHostRuntimeRoomEvents,
  relayHostRuntimeSignal: runtimeSessionMocks.relayHostRuntimeSignal,
  relayRemoteRuntimeSignal: runtimeSessionMocks.relayRemoteRuntimeSignal,
  joinRemoteHostRuntimeSession: runtimeSessionMocks.joinRemoteHostRuntimeSession,
}));

vi.mock('../media/webrtcSession', () => ({
  createWebRtcSession: vi.fn(() => ({
    startOffer: vi.fn(async () => {}),
    handleSignal: vi.fn(async () => {}),
    sendChat: vi.fn(() => true),
    addTrack: vi.fn(async () => {}),
    close: vi.fn(),
  })),
}));

vi.mock('../media/useHotkeys', () => ({
  useHotkeys: () => {},
}));

describe('App Phase 7 invite flow', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('lvc_user_id', 'uuid-joiner');
    inviteCodeMocks.getPreferredLocalIpv4.mockImplementation(async () => '192.168.31.10');
    inviteCodeMocks.prepareRoomInvite.mockImplementation(async (): Promise<{
      inviteCode: string;
      port: number;
      reusedLastSuccessfulPort: boolean;
      usedExternalMapping: boolean;
      natMappingProtocol: 'upnp' | 'pcp' | 'nat-pmp' | null;
    }> => ({
      inviteCode: 'AB12-CD34-EF56-GH78',
      port: 7788,
      reusedLastSuccessfulPort: false,
      usedExternalMapping: false,
      natMappingProtocol: null,
    }));
    inviteCodeMocks.probeRoomEndpoint.mockImplementation(async (): Promise<{ reachable: boolean; failureKind: string | null; elapsedMs: number }> => ({
      reachable: true,
      failureKind: null,
      elapsedMs: 10,
    }));
    inviteCodeMocks.prettifyInviteCode.mockImplementation(async (code: string) => {
      const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
      return normalized.match(/.{1,4}/g)?.join('-') ?? normalized;
    });
    inviteCodeMocks.parseInviteCode.mockImplementation(async () => ({
      endpointScope: 'private-lan-ipv4',
      joinMode: 'direct-host',
      ipv4: '192.168.31.10',
      port: 7788,
      expirySlot: 512,
    }));
    runtimeSessionMocks.startHostRuntimeSession.mockImplementation(async () => ({
      roomId: 'AB12CD34EF56GH78',
      inviteCode: 'AB12-CD34-EF56-GH78',
      listenHost: '192.168.31.10',
      listenPort: 7788,
      latestSequence: 1,
      members: [
        {
          memberId: 'uuid-joiner',
          displayName: 'HuangJin',
          role: 'Host',
          connState: 'connected',
        },
      ],
    }));
    runtimeSessionMocks.getHostRuntimeRoomState.mockImplementation(async () => ({
      type: 'RoomState',
      payload: {
        roomId: 'AB12CD34EF56GH78',
        members: [
          {
            memberId: 'uuid-joiner',
            displayName: 'HuangJin',
            role: 'Host',
            connState: 'connected',
          },
        ],
      },
    }));
    runtimeSessionMocks.getRemoteHostRuntimeRoomState.mockImplementation(async () => ({
      type: 'RoomState',
      payload: {
        roomId: 'AB12CD34EF56GH78',
        members: [
          {
            memberId: 'uuid-host',
            displayName: 'HuangJin',
            role: 'Host',
            connState: 'connected',
          },
        ],
      },
    }));
    runtimeSessionMocks.getHostRuntimeRoomEvents.mockImplementation(async () => []);
    runtimeSessionMocks.getRemoteHostRuntimeRoomEvents.mockImplementation(async () => []);
    runtimeSessionMocks.relayHostRuntimeSignal.mockImplementation(async () => ({
      sequence: 4,
      targetMemberId: 'uuid-joiner',
      message: {
        type: 'WebRtcSignal',
        payload: {
          from: 'uuid-host',
          target: 'uuid-joiner',
          signalType: 'Offer',
          payload: '{"type":"offer","sdp":"offer-sdp"}',
        },
      },
    }));
    runtimeSessionMocks.relayRemoteRuntimeSignal.mockImplementation(async () => ({
      sequence: 4,
      targetMemberId: 'uuid-host',
      message: {
        type: 'WebRtcSignal',
        payload: {
          from: 'uuid-joiner',
          target: 'uuid-host',
          signalType: 'Answer',
          payload: '{"type":"answer","sdp":"answer-sdp"}',
        },
      },
    }));
    runtimeSessionMocks.joinRemoteHostRuntimeSession.mockImplementation(async () => ({
      roomId: 'AB12CD34EF56GH78',
      joinedMember: {
        memberId: 'uuid-joiner',
        displayName: 'HuangJin',
        role: 'Audience',
        connState: 'connected',
      },
      roomState: {
        type: 'RoomState',
        payload: {
          roomId: 'AB12CD34EF56GH78',
          members: [
            {
              memberId: 'uuid-host',
              displayName: 'HuangJin',
              role: 'Host',
              connState: 'connected',
            },
            {
              memberId: 'uuid-joiner',
              displayName: 'HuangJin',
              role: 'Audience',
              connState: 'connected',
            },
          ],
        },
      },
      latestSequence: 3,
    }));
  });

  it('creates a room and shows a 16-character invite code', async () => {
    render(<App />);

    fireEvent.click(screen.getByText('创建新房间'));

    await waitFor(() => {
      expect(screen.getByText('AB12-CD34-EF56-GH78')).toBeInTheDocument();
    });
    expect(runtimeSessionMocks.startHostRuntimeSession).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('lvc_room_registry_v1')).toBeNull();
  });

  it('keeps invite hidden until room preparation is ready', async () => {
    let resolvePrepare!: (
      value: {
        inviteCode: string;
        port: number;
        reusedLastSuccessfulPort: boolean;
        usedExternalMapping: boolean;
        natMappingProtocol: 'upnp' | 'pcp' | 'nat-pmp' | null;
      },
    ) => void;
    inviteCodeMocks.prepareRoomInvite.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePrepare = resolve;
        }),
    );

    render(<App />);
    fireEvent.click(screen.getByText('创建新房间'));

    expect(screen.getByText('正在准备房间')).toBeInTheDocument();
    expect(screen.queryByText('AB12-CD34-EF56-GH78')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(inviteCodeMocks.prepareRoomInvite).toHaveBeenCalledTimes(1);
    });

    resolvePrepare({
      inviteCode: 'AB12-CD34-EF56-GH78',
      port: 7788,
      reusedLastSuccessfulPort: true,
      usedExternalMapping: false,
      natMappingProtocol: null,
    });

    await waitFor(() => {
      expect(screen.getByText('AB12-CD34-EF56-GH78')).toBeInTheDocument();
    });
  });

  it('returns to join screen with error when room preparation fails', async () => {
    inviteCodeMocks.prepareRoomInvite.mockRejectedValueOnce(new Error('generation failed'));

    render(<App />);
    fireEvent.click(screen.getByText('创建新房间'));

    await waitFor(() => {
      expect(screen.getByText('房间启动失败。请复制诊断日志并反馈，或检查本机网络/防火墙。')).toBeInTheDocument();
    });
    expect(screen.getByText('复制诊断日志')).toBeInTheDocument();
    expect(screen.getByText('加入一个直连房间')).toBeInTheDocument();
  });

  it('falls back to relay mode when direct endpoint probing fails', async () => {
    const firstRender = render(<App />);

    fireEvent.click(screen.getByText('创建新房间'));

    await waitFor(() => {
      expect(screen.getByText('AB12-CD34-EF56-GH78')).toBeInTheDocument();
    });

    firstRender.unmount();
    inviteCodeMocks.probeRoomEndpoint.mockImplementation(async () => ({
      reachable: false,
      failureKind: 'timeout' as string | null,
      elapsedMs: 100,
    }));
    render(<App />);
    const inputs = screen.getAllByRole('textbox');
    fireEvent.paste(inputs[0], {
      clipboardData: { getData: () => 'ab12-cd34-ef56-gh78' },
    });

    await waitFor(() => {
      expect(screen.getByText('房主直连入口不可达，已回退到中转模式。')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('加入'));

    await waitFor(() => {
      expect(screen.getByText('经房主中转')).toBeInTheDocument();
    });
    expect(runtimeSessionMocks.joinRemoteHostRuntimeSession).toHaveBeenCalledTimes(1);
  });

  it('joins with a 16-character invite code', async () => {
    const firstRender = render(<App />);

    fireEvent.click(screen.getByText('创建新房间'));

    await waitFor(() => {
      expect(screen.getByText('AB12-CD34-EF56-GH78')).toBeInTheDocument();
    });

    firstRender.unmount();
    render(<App />);
    const inputs = screen.getAllByRole('textbox');
    fireEvent.paste(inputs[0], {
      clipboardData: { getData: () => 'ab12-cd34-ef56-gh78' },
    });

    await waitFor(() => {
      expect(screen.getByText('加入这个房间？')).toBeInTheDocument();
    });
  });

  it('joins with parsed invite metadata even without local room registry', async () => {
    render(<App />);
    const inputs = screen.getAllByRole('textbox');
    fireEvent.paste(inputs[0], {
      clipboardData: { getData: () => 'ab12-cd34-ef56-gh78' },
    });

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes('HuangJin 的房间'))).toBeInTheDocument();
      expect(screen.getByText('加入这个房间？')).toBeInTheDocument();
    });
  });

  it('keeps room name synced from runtime room state instead of local registry', async () => {
    runtimeSessionMocks.getRemoteHostRuntimeRoomState.mockImplementation(async () => ({
      type: 'RoomState',
      payload: {
        roomId: 'AB12CD34EF56GH78',
        members: [
          {
            memberId: 'uuid-host',
            displayName: 'Remote Host',
            role: 'Host',
            connState: 'connected',
          },
        ],
      },
    }));

    render(<App />);
    const inputs = screen.getAllByRole('textbox');
    fireEvent.paste(inputs[0], {
      clipboardData: { getData: () => 'ab12-cd34-ef56-gh78' },
    });

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes('Remote Host 的房间'))).toBeInTheDocument();
      expect(screen.getByText('加入这个房间？')).toBeInTheDocument();
    });
  });
});
