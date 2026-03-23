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
    expect(screen.queryByText('用户设置')).not.toBeInTheDocument();
  });

  it('should render default tab content (Audio & Devices)', () => {
    render(<SettingsModal {...defaultProps} />);
    expect(screen.getByText('用户设置')).toBeInTheDocument();
    expect(screen.getByText('房主管理面板')).toBeInTheDocument();
    
    // Default tab should be '语音与设备'
    const audioHeading = screen.getAllByText('语音与设备').find(el => el.tagName.toLowerCase() === 'h1');
    expect(audioHeading).toBeInTheDocument();
    expect(screen.getByText('输入设备 (麦克风)')).toBeInTheDocument();
  });

  it('should switch tabs when clicked', () => {
    render(<SettingsModal {...defaultProps} />);
    
    // Click on '封禁与黑名单' tab
    const banTab = screen.getByText('封禁与黑名单');
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
    const vadRadio = screen.getByLabelText('语音激活 (VAD)');
    const pttRadio = screen.getByLabelText('按键说话 (PTT)');

    expect(vadRadio).toBeChecked();
    expect(pttRadio).not.toBeChecked();

    fireEvent.click(pttRadio);
    expect(pttRadio).toBeChecked();
    expect(vadRadio).not.toBeChecked();
  });

  it('should trigger regenerate code action in Room tab', () => {
    render(<SettingsModal {...defaultProps} />);
    
    // Switch to Room tab
    fireEvent.click(screen.getByText('房间设置 (口令)'));
    
    // Find the readonly input and button
    const codeInput = screen.getByDisplayValue('A9B2K8');
    const regenBtn = screen.getByText('重新生成');
    
    expect(codeInput).toBeInTheDocument();
    expect(codeInput).toHaveAttribute('readonly');
    
    // Simulate click, expect value to change (mock logic in component)
    fireEvent.click(regenBtn);
    expect(codeInput).not.toHaveValue('A9B2K8');
    // Assuming the new code is 6 characters alphanumeric
    expect((codeInput as HTMLInputElement).value).toMatch(/^[A-Z0-9]{6}$/);
  });

  it('should allow unbanning a user in Ban tab', () => {
    render(<SettingsModal {...defaultProps} />);
    
    // Switch to Ban tab
    fireEvent.click(screen.getByText('封禁与黑名单'));
    
    const unbanBtn = screen.getByText('解除封禁');
    expect(unbanBtn).toBeInTheDocument();
    
    fireEvent.click(unbanBtn);
    
    // After clicking, it should show '已解封' and be disabled
    expect(unbanBtn).toHaveTextContent('已解封');
    expect(unbanBtn).toBeDisabled();
  });
});
