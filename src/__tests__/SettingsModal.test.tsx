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
    
    // The Audio heading should not be visible or hidden by css (we check for presence of ban text)
  });

  it('should call onClose when close button is clicked', () => {
    render(<SettingsModal {...defaultProps} />);
    const closeBtn = screen.getByTitle('关闭 (Esc)');
    fireEvent.click(closeBtn);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });
});
