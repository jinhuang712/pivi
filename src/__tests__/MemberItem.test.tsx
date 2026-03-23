import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MemberItem from '../components/MemberItem';

describe('MemberItem Component', () => {
  const defaultMember = {
    id: 'user-1',
    name: 'Player A',
    isHost: false,
    isSpeaking: false,
    localMuted: false,
    serverMuted: false,
    volume: 100,
  };

  it('should render member name and avatar correctly', () => {
    render(<MemberItem member={defaultMember} isCurrentUserHost={false} />);
    expect(screen.getByText('Player A')).toBeInTheDocument();
    expect(screen.getByText('P')).toBeInTheDocument(); // Avatar fallback
  });

  it('should show host indicator if member is host', () => {
    render(<MemberItem member={{ ...defaultMember, isHost: true }} isCurrentUserHost={false} />);
    expect(screen.getByText('Player A (房主)')).toBeInTheDocument();
  });

  it('should show speaking indicator when isSpeaking is true', () => {
    render(<MemberItem member={{ ...defaultMember, isSpeaking: true }} isCurrentUserHost={false} />);
    const indicator = screen.getByTestId('speaking-indicator-user-1');
    expect(indicator).toHaveClass('animate-pulse');
    expect(indicator).toHaveClass('bg-green-500');
  });

  it('should call onLocalMuteToggle when local mute button is clicked', () => {
    const onLocalMuteToggle = vi.fn();
    render(<MemberItem member={defaultMember} isCurrentUserHost={false} onLocalMuteToggle={onLocalMuteToggle} />);
    
    const muteBtn = screen.getByTitle('本地屏蔽');
    fireEvent.click(muteBtn);
    expect(onLocalMuteToggle).toHaveBeenCalledWith('user-1');
  });

  it('should call onVolumeChange when volume slider changes', () => {
    const onVolumeChange = vi.fn();
    render(<MemberItem member={defaultMember} isCurrentUserHost={false} onVolumeChange={onVolumeChange} />);
    
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '50' } });
    expect(onVolumeChange).toHaveBeenCalledWith('user-1', 50);
  });

  it('should open context menu on right click if current user is host', () => {
    render(<MemberItem member={defaultMember} isCurrentUserHost={true} />);
    
    const item = screen.getByText('Player A');
    fireEvent.contextMenu(item);

    expect(screen.getByText('全局强制闭麦')).toBeInTheDocument();
    expect(screen.getByText('踢出房间')).toBeInTheDocument();
    expect(screen.getByText('加入黑名单')).toBeInTheDocument();
  });

  it('should NOT open context menu if current user is NOT host', () => {
    render(<MemberItem member={defaultMember} isCurrentUserHost={false} />);
    
    const item = screen.getByText('Player A');
    fireEvent.contextMenu(item);

    expect(screen.queryByText('全局强制闭麦')).not.toBeInTheDocument();
  });
});
