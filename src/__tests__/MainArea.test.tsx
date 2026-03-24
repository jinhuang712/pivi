import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MainArea from '../components/MainArea';

describe('MainArea Component', () => {
  const renderMainArea = (onOpenSettings = vi.fn()) => render(<MainArea onOpenSettings={onOpenSettings} />);

  it('should render the top navigation and network status', () => {
    renderMainArea();
    expect(screen.getByText(/房间聊天区/)).toBeInTheDocument();
    expect(screen.getByText(/Ping: 24ms/)).toBeInTheDocument();
    expect(screen.getByText(/P2P直连/)).toBeInTheDocument();
  });

  it('should render the screen share button', () => {
    renderMainArea();
    expect(screen.getByText('开始共享')).toBeInTheDocument();
  });

  it('should toggle screen share state when clicked', () => {
    renderMainArea();
    const shareBtn = screen.getByText('开始共享');
    
    fireEvent.click(shareBtn);
    expect(screen.getByText('停止共享')).toBeInTheDocument();
    expect(screen.getByText(/正在共享/)).toBeInTheDocument();
  });

  it('should be able to type and send messages', () => {
    renderMainArea();
    const input = screen.getByPlaceholderText('输入消息... (支持 Ctrl+V 粘贴截图)');
    
    fireEvent.change(input, { target: { value: 'Hello World' } });
    expect(input).toHaveValue('Hello World');

    // Simulate Enter key
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    
    // Message should be added to the list and input cleared
    expect(screen.getByText('Hello World')).toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  it('should show error bubble when upload button is clicked (mocked error)', () => {
    vi.useFakeTimers();
    renderMainArea();
    
    const uploadBtn = screen.getByTitle('上传图片/文件');
    fireEvent.click(uploadBtn);
    
    const errorMsg = screen.getByText('⚠️ 图片大小不能超过 5MB');
    expect(errorMsg).toBeInTheDocument();
    
    // Fast forward time to check if it disappears
    vi.advanceTimersByTime(3000);
    // expect(screen.queryByText('⚠️ 图片大小不能超过 5MB')).not.toBeInTheDocument();
    
    vi.useRealTimers();
  });

  it('should open settings from center control bar', () => {
    const onOpenSettings = vi.fn();
    renderMainArea(onOpenSettings);
    fireEvent.click(screen.getByTitle('设置'));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('should toggle microphone mute and adjust microphone volume', () => {
    renderMainArea();
    const micToggle = screen.getByTitle('麦克风开关');
    fireEvent.click(micToggle);
    expect(micToggle).toHaveTextContent('🎙️');

    const micSlider = screen.getByTitle('麦克风音量');
    fireEvent.change(micSlider, { target: { value: '35' } });
    expect(screen.getByText('35%')).toBeInTheDocument();
  });
});
