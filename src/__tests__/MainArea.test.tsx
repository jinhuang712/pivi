import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MainArea from '../components/MainArea';
import type { ChatMessage } from '../types/channel';

describe('MainArea Component', () => {
  const renderMainArea = (
    onOpenSettings = vi.fn(),
    messages: ChatMessage[] = [],
    networkPath: 'p2p' | 'relay' = 'p2p',
    networkNotice?: string,
  ) =>
    render(
      <MainArea
        onOpenSettings={onOpenSettings}
        currentUserName="HuangJin"
        messages={messages}
        onSendMessage={vi.fn()}
        networkPath={networkPath}
        networkNotice={networkNotice}
      />,
    );

  it('should render the connection status as direct by default', () => {
    renderMainArea();
    expect(screen.getByText('直连')).toBeInTheDocument();
  });

  it('should render relay network status when fallback is active', () => {
    renderMainArea(vi.fn(), [], 'relay', '房主直连入口不可达，已回退到中转模式。');
    expect(screen.getByText('经房主中转')).toBeInTheDocument();
    expect(screen.getByText(/房主直连入口不可达/)).toBeInTheDocument();
  });

  it('should render the screen share control', () => {
    renderMainArea();
    expect(screen.getByLabelText('Screen share')).toBeInTheDocument();
  });

  it('should start sharing via the start popover and show the self-view', () => {
    renderMainArea();
    fireEvent.click(screen.getByLabelText('Screen share'));
    fireEvent.click(screen.getByText('开始共享'));

    expect(screen.getByText('共享中')).toBeInTheDocument();
    expect(screen.getByText('停止')).toBeInTheDocument();
  });

  it('should be able to type and send messages', () => {
    const onSendMessage = vi.fn();
    render(
      <MainArea
        onOpenSettings={vi.fn()}
        currentUserName="HuangJin"
        messages={[]}
        onSendMessage={onSendMessage}
      />,
    );
    const input = screen.getByPlaceholderText('给房间发消息（支持粘贴截图）');

    fireEvent.change(input, { target: { value: 'Hello World' } });
    expect(input).toHaveValue('Hello World');

    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(onSendMessage).toHaveBeenCalledWith('Hello World');
    expect(input).toHaveValue('');
  });

  it('should show an error bubble when the upload button is clicked', () => {
    renderMainArea();

    const uploadBtn = screen.getByTitle('上传图片/文件');
    fireEvent.click(uploadBtn);

    expect(screen.getByText('图片大小不能超过 5MB')).toBeInTheDocument();
  });

  it('should open settings from the control bar', () => {
    const onOpenSettings = vi.fn();
    renderMainArea(onOpenSettings);
    fireEvent.click(screen.getByLabelText('Settings'));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('should toggle microphone mute', () => {
    renderMainArea();
    const micBtn = screen.getByLabelText('Microphone');
    fireEvent.click(micBtn);
    expect(micBtn).toHaveClass('off');
  });

  it('shows the remote screen viewer when a remote screen stream arrives', () => {
    const stream = { id: 'remote' } as unknown as MediaStream;
    render(
      <MainArea
        onOpenSettings={vi.fn()}
        currentUserName="HuangJin"
        messages={[]}
        onSendMessage={vi.fn()}
        remoteScreenStream={stream}
      />,
    );
    expect(screen.getByTestId('remote-screen')).toBeInTheDocument();
  });

  it('does not show the viewer without a remote stream', () => {
    renderMainArea();
    expect(screen.queryByTestId('remote-screen')).not.toBeInTheDocument();
  });

  it('renders image messages as an <img>', () => {
    render(
      <MainArea
        onOpenSettings={vi.fn()}
        currentUserName="HuangJin"
        messages={[
          { id: '1', sender: 'Mira', time: '14:00', content: 'look', isSelf: false, imageUrl: 'blob:x', fileName: 'pic.png' },
        ]}
        onSendMessage={vi.fn()}
      />,
    );
    const img = screen.getByTestId('chat-image');
    expect(img).toHaveAttribute('src', 'blob:x');
    expect(img).toHaveAttribute('alt', 'pic.png');
  });
});
