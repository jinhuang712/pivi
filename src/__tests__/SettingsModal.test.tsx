import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SettingsModal from '../components/SettingsModal';

describe('SettingsModal Component', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
  };

  it('should not render when isOpen is false', () => {
    render(<SettingsModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText('我的账号')).not.toBeInTheDocument();
  });

  it('should render default tab content (Account)', () => {
    render(<SettingsModal {...defaultProps} />);
    expect(screen.getAllByText('我的账号').length).toBeGreaterThan(0);
    expect(screen.getAllByText('语音与设备').length).toBeGreaterThan(0);
    
    // Default tab should be '我的账号'
    const accountHeading = screen.getAllByText('我的账号').find(el => el.tagName.toLowerCase() === 'h1');
    expect(accountHeading).toBeInTheDocument();
    expect(screen.getByLabelText('显示昵称')).toBeInTheDocument();
  });

  it('should switch tabs when clicked', () => {
    render(<SettingsModal {...defaultProps} />);
    
    // Click on '封禁与黑名单' tab
    const banTab = screen.getAllByText('封禁与黑名单')[0];
    fireEvent.click(banTab);
    
    // The content for Ban list should appear
    const banHeading = screen.getAllByText('封禁与黑名单').find(el => el.tagName.toLowerCase() === 'h1');
    expect(banHeading).toBeInTheDocument();
    expect(screen.getByText('被封禁的用户将无法通过当前口令加入房间。')).toBeInTheDocument();
  });

  it('should call onClose when close button is clicked', () => {
    render(<SettingsModal {...defaultProps} />);
    const closeBtn = screen.getByTitle('关闭 (Esc)');
    fireEvent.click(closeBtn);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('should allow changing input mode in Audio tab', () => {
    render(<SettingsModal {...defaultProps} />);
    
    // Switch to Audio tab
    fireEvent.click(screen.getAllByText('语音与设备')[0]);

    const vadRadio = screen.getByLabelText('语音激活 (VAD)');
    const pttRadio = screen.getByLabelText('按键说话 (PTT)');

    expect(vadRadio).toBeChecked();
    expect(pttRadio).not.toBeChecked();

    fireEvent.click(pttRadio);
    expect(pttRadio).toBeChecked();
    expect(vadRadio).not.toBeChecked();
  });

  it('should allow unbanning a user in Ban tab', () => {
    render(<SettingsModal {...defaultProps} />);
    
    // Switch to Ban tab
    fireEvent.click(screen.getAllByText('封禁与黑名单')[0]);
    
    const unbanBtn = screen.getByText('解除封禁');
    expect(unbanBtn).toBeInTheDocument();
    
    fireEvent.click(unbanBtn);
    
    // After clicking, it should show '已解封' and be disabled
    expect(unbanBtn).toHaveTextContent('已解封');
    expect(unbanBtn).toBeDisabled();
  });

  it('should render hotkey settings and allow capturing keys', () => {
    render(<SettingsModal {...defaultProps} />);
    
    // Switch to Hotkey tab
    fireEvent.click(screen.getAllByText('快捷键')[0]);
    
    const pttInput = screen.getByLabelText('按键说话 (PTT) 快捷键');
    expect(pttInput).toBeInTheDocument();
    
    // Simulate focusing and pressing a key to capture
    fireEvent.focus(pttInput);
    fireEvent.keyDown(pttInput, { key: 'V', code: 'KeyV' });
    
    expect(pttInput).toHaveValue('V');
  });

  it('should allow modifying nickname in Account tab', () => {
    render(<SettingsModal {...defaultProps} />);
    
    // Account tab is default, no need to switch
    // fireEvent.click(screen.getAllByText('我的账号')[0]);
    
    const nicknameInput = screen.getByLabelText('显示昵称');
    expect(nicknameInput).toBeInTheDocument();
    expect(nicknameInput).toHaveValue('HuangJin');
    
    // Modify nickname
    fireEvent.change(nicknameInput, { target: { value: 'NewNickname' } });
    expect(nicknameInput).toHaveValue('NewNickname');
    
    // Check UUID
    expect(screen.getByText('user-uuid-1234-5678')).toBeInTheDocument();
  });
});
