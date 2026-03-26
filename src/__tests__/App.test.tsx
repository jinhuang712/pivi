import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';

const inviteCodeMocks = vi.hoisted(() => ({
  prepareRoomInvite: vi.fn(async () => ({
    inviteCode: 'AB12-CD34-EF56-GH78',
    port: 7788,
    reusedLastSuccessfulPort: false,
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
    prettifyInviteCode: inviteCodeMocks.prettifyInviteCode,
    parseInviteCode: inviteCodeMocks.parseInviteCode,
    getCurrentInviteExpirySlot: () => 500,
  };
});

describe('App Phase 7 invite flow', () => {
  beforeEach(() => {
    localStorage.clear();
    inviteCodeMocks.prepareRoomInvite.mockImplementation(async () => ({
      inviteCode: 'AB12-CD34-EF56-GH78',
      port: 7788,
      reusedLastSuccessfulPort: false,
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
    let resolvePrepare!: (value: { inviteCode: string; port: number; reusedLastSuccessfulPort: boolean }) => void;
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

    resolvePrepare({ inviteCode: 'AB12-CD34-EF56-GH78', port: 7788, reusedLastSuccessfulPort: true });

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
