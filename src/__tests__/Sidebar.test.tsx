import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Sidebar from '../components/Sidebar';
import type { Member } from '../components/MemberItem';

const members: Member[] = [
  {
    id: 'me',
    name: 'HuangJin',
    isHost: true,
    isSpeaking: false,
    localMuted: false,
    serverMuted: false,
    volume: 100,
  },
];

const renderSidebar = () =>
  render(
    <Sidebar
      roomName="周末电竞开黑房"
      roomCode="A9B2K8"
      currentUserName="HuangJin"
      members={members}
      isCurrentUserHost
      onRegenerateCode={() => {}}
      onLocalMuteToggle={() => {}}
      onVolumeChange={() => {}}
    />,
  );

describe('Sidebar Component', () => {
  it('should render the room header', () => {
    renderSidebar();
    expect(screen.getByText(/周末电竞开黑房/)).toBeInTheDocument();
  });

  it('should render the local control panel', () => {
    renderSidebar();
    expect(screen.getByText('HuangJin')).toBeInTheDocument();
    expect(screen.queryByTitle('扬声器开关')).not.toBeInTheDocument();
    expect(screen.queryByTitle('设置')).not.toBeInTheDocument();
  });
});
