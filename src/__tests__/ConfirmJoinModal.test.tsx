import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ConfirmJoinModal from '../components/ConfirmJoinModal';

describe('ConfirmJoinModal Component', () => {
  const defaultProps = {
    isOpen: true,
    roomName: '周末电竞开黑房',
    onlineCount: 3,
    hostName: 'HuangJin',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  it('should not render when isOpen is false', () => {
    render(<ConfirmJoinModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText('是否加入房间？')).not.toBeInTheDocument();
  });

  it('should render room information correctly', () => {
    render(<ConfirmJoinModal {...defaultProps} />);
    expect(screen.getByText('是否加入房间？')).toBeInTheDocument();
    expect(screen.getByText('「周末电竞开黑房」')).toBeInTheDocument();
    expect(screen.getByText(/当前在线：3 人/)).toBeInTheDocument();
    expect(screen.getByText(/房主：HuangJin/)).toBeInTheDocument();
  });

  it('should call onConfirm when confirm button is clicked', () => {
    render(<ConfirmJoinModal {...defaultProps} />);
    const confirmBtn = screen.getByText('确认加入');
    fireEvent.click(confirmBtn);
    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('should call onCancel when cancel button is clicked', () => {
    render(<ConfirmJoinModal {...defaultProps} />);
    const cancelBtn = screen.getByText('取消');
    fireEvent.click(cancelBtn);
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });
});
