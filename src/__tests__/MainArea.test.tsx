import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import MainArea from '../components/MainArea';

describe('MainArea Component', () => {
  it('should render the top navigation and network status', () => {
    render(<MainArea />);
    expect(screen.getByText(/屏幕共享/)).toBeInTheDocument();
    expect(screen.getByText(/Ping: 24ms/)).toBeInTheDocument();
    expect(screen.getByText(/P2P直连/)).toBeInTheDocument();
  });

  it('should render the screen share placeholder', () => {
    render(<MainArea />);
    expect(screen.getByText('当前无人共享屏幕')).toBeInTheDocument();
    expect(screen.getByText('开始共享我的屏幕')).toBeInTheDocument();
  });

  it('should toggle screen share state when clicked', () => {
    render(<MainArea />);
    const shareBtn = screen.getByText('开始共享我的屏幕');
    
    fireEvent.click(shareBtn);
    expect(screen.getByText('停止共享')).toBeInTheDocument();
    expect(screen.getByText('你的屏幕正在共享中...')).toBeInTheDocument();
    
    fireEvent.click(screen.getByText('停止共享'));
    expect(screen.getByText('开始共享我的屏幕')).toBeInTheDocument();
  });

  it('should render the chatbox and allow typing', () => {
    render(<MainArea />);
    const input = screen.getByPlaceholderText(/输入消息/);
    expect(input).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'Hello World' } });
    expect(input).toHaveValue('Hello World');
  });

  it('should add a message to the list when sending', () => {
    render(<MainArea />);
    const input = screen.getByPlaceholderText(/输入消息/);
    const sendBtn = screen.getByTitle('发送');

    fireEvent.change(input, { target: { value: 'Test Message' } });
    fireEvent.click(sendBtn);

    expect(screen.getByText('Test Message')).toBeInTheDocument();
    expect(input).toHaveValue(''); // Should clear input after sending
  });

  it('should simulate an error when uploading a large file', () => {
    render(<MainArea />);
    const uploadBtn = screen.getByTitle('上传图片/文件');
    
    // Error should not be in the document initially
    expect(screen.queryByText(/图片大小不能超过 5MB/)).not.toBeInTheDocument();

    fireEvent.click(uploadBtn);
    
    // Error should be visible after click
    expect(screen.getByText(/图片大小不能超过 5MB/)).toBeInTheDocument();
  });
});
