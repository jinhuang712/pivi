import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import SettingsModal from '../components/SettingsModal';

describe('SettingsModal Component', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
  };

  beforeEach(() => {
    localStorage.clear();
  });

  it('should not render when isOpen is false', () => {
    render(<SettingsModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText('身份')).not.toBeInTheDocument();
  });

  it('should render default tab content (Identity)', () => {
    render(<SettingsModal {...defaultProps} />);
    expect(screen.getAllByText('身份').length).toBeGreaterThan(0);
    expect(screen.getAllByText('语音与设备').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('显示名')).toBeInTheDocument();
  });

  it('should switch to the Blocked tab when clicked', () => {
    render(<SettingsModal {...defaultProps} />);
    fireEvent.click(screen.getAllByText('黑名单')[0]);
    expect(screen.getByText(/没有其他人被拉黑/)).toBeInTheDocument();
  });

  it('should call onClose when close button is clicked', () => {
    render(<SettingsModal {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('关闭'));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('should show talk-mode options in the Audio tab', () => {
    render(<SettingsModal {...defaultProps} />);
    fireEvent.click(screen.getAllByText('语音与设备')[0]);
    expect(screen.getByText('按键说话')).toBeInTheDocument();
    expect(screen.getByText('语音活动')).toBeInTheDocument();
  });

  it('should allow unbanning a user in the Blocked tab', () => {
    render(<SettingsModal {...defaultProps} />);
    fireEvent.click(screen.getAllByText('黑名单')[0]);

    const unbanBtn = screen.getByText('解封');
    fireEvent.click(unbanBtn);

    expect(screen.getByText('已解封')).toBeDisabled();
  });

  it('should capture a hotkey after clicking the PTT key button', () => {
    render(<SettingsModal {...defaultProps} />);
    fireEvent.click(screen.getAllByText('快捷键')[0]);

    const pttBtn = screen.getByLabelText('ptt-hotkey');
    fireEvent.click(pttBtn);
    fireEvent.keyDown(pttBtn, { key: 'V' });

    expect(pttBtn).toHaveTextContent('V');
  });

  it('should start microphone capture in the Audio tab', async () => {
    const stop = vi.fn();
    const mockStream = {
      getTracks: () => [{ stop }],
    } as unknown as MediaStream;

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        enumerateDevices: vi.fn().mockResolvedValue([
          { kind: 'audioinput', deviceId: 'mic-1', label: 'USB Mic' },
          { kind: 'audiooutput', deviceId: 'spk-1', label: 'Speaker' },
        ]),
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });

    render(<SettingsModal {...defaultProps} />);
    fireEvent.click(screen.getAllByText('语音与设备')[0]);
    fireEvent.click(screen.getByText('开始采集'));

    expect(await screen.findByText('采集中')).toBeInTheDocument();
  });

  it('should allow modifying nickname and show the UUID', () => {
    localStorage.setItem('lvc_user_id', 'uuid-test-1234');
    render(<SettingsModal {...defaultProps} />);

    const nicknameInput = screen.getByLabelText('显示名');
    expect(nicknameInput).toHaveValue('HuangJin');

    fireEvent.change(nicknameInput, { target: { value: 'NewNickname' } });
    expect(nicknameInput).toHaveValue('NewNickname');

    expect(screen.getByDisplayValue('uuid-test-1234')).toBeInTheDocument();
  });
});
