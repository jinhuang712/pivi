import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';

vi.mock('../lib/inviteCode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/inviteCode')>();

  return {
    ...actual,
    generateInviteCode: vi.fn(async () => 'AB12CD34EF56GH78'),
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
    getCurrentInviteExpirySlot: () => 500,
  };
});

describe('App Phase 7 invite flow', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('creates a room and shows a 16-character invite code', async () => {
    render(<App />);

    fireEvent.click(screen.getByText('创建新房间'));

    await waitFor(() => {
      expect(screen.getByText('AB12-CD34-EF56-GH78')).toBeInTheDocument();
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
