import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Sidebar from '../components/Sidebar';

describe('Sidebar Component', () => {
  it('should render the room header', () => {
    render(<Sidebar roomName="周末电竞开黑房" />);
    expect(screen.getByText(/周末电竞开黑房/)).toBeInTheDocument();
  });

  it('should render the local control panel', () => {
    render(<Sidebar roomName="测试房间" />);
    expect(screen.getByTitle('麦克风开关')).toBeInTheDocument();
    expect(screen.getByTitle('扬声器开关')).toBeInTheDocument();
    expect(screen.getByTitle('设置')).toBeInTheDocument();
  });
});