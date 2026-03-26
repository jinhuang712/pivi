import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';

const inviteCodeMocks = vi.hoisted(() => ({
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

vi.mock('../lib/inviteCode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/inviteCode')>();

  return {
    ...actual,
    prepareRoomInvite: inviteCodeMocks.prepareRoomInvite,
    probeRoomEndpoint: inviteCodeMocks.probeRoomEndpoint,
    prettifyInviteCode: inviteCodeMocks.prettifyInviteCode,
    parseInviteCode: inviteCodeMocks.parseInviteCode,
    getCurrentInviteExpirySlot: () => 500,
  };
});

describe('App Phase 7 invite flow', () => {
  beforeEach(() => {
    localStorage.clear();
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
  });

  it('creates a room and shows a 16-character invite code', async () => {
    render(<App />);

    fireEvent.click(screen.getByText('创建新房间'));

    await waitFor(() => {
      expect(screen.getByText('AB12-CD34-EF56-GH78')).toBeInTheDocument();
    });
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
      expect(screen.getByText('邀请码生成失败，请稍后重试。')).toBeInTheDocument();
    });
    expect(screen.getByText('加入语音频道')).toBeInTheDocument();
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
      expect(screen.getByText('将以中转模式加入：房主直连入口不可达，已回退到中转模式。')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('确认加入'));

    await waitFor(() => {
      expect(screen.getByText('Relay中转')).toBeInTheDocument();
    });
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
      expect(screen.getByText('是否加入房间？')).toBeInTheDocument();
    });
  });
});
