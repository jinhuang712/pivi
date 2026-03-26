import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CodeInput from '../components/CodeInput';

describe('CodeInput Component', () => {
  it('should render 4 grouped input fields', () => {
    render(<CodeInput onComplete={() => {}} />);
    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(4);
  });

  it('should only allow alphanumeric characters and auto uppercase', () => {
    render(<CodeInput onComplete={() => {}} />);
    const inputs = screen.getAllByRole('textbox');
    
    fireEvent.change(inputs[0], { target: { value: 'ab!2' } });
    expect(inputs[0]).toHaveValue('AB2');

    fireEvent.change(inputs[1], { target: { value: 'cdef' } });
    expect(inputs[1]).toHaveValue('CDEF');
  });

  it('should auto-focus next input when typing', () => {
    render(<CodeInput onComplete={() => {}} />);
    const inputs = screen.getAllByRole('textbox');
    
    // Set focus on first input
    inputs[0].focus();
    expect(inputs[0]).toHaveFocus();

    fireEvent.change(inputs[0], { target: { value: 'AB12' } });
    
    expect(inputs[1]).toHaveFocus();
  });

  it('should focus previous input on backspace if current is empty', () => {
    render(<CodeInput onComplete={() => {}} />);
    const inputs = screen.getAllByRole('textbox');
    
    inputs[1].focus();
    fireEvent.keyDown(inputs[1], { key: 'Backspace' });
    
    expect(inputs[0]).toHaveFocus();
  });

  it('should trigger onComplete when all 16 characters are filled', () => {
    const onCompleteMock = vi.fn();
    render(<CodeInput onComplete={onCompleteMock} />);
    const inputs = screen.getAllByRole('textbox');
    
    const code = ['AB12', 'CD34', 'EF56', 'GH78'];
    code.forEach((chunk, idx) => {
      fireEvent.change(inputs[idx], { target: { value: chunk } });
    });

    expect(onCompleteMock).toHaveBeenCalledWith('AB12CD34EF56GH78');
    expect(onCompleteMock).toHaveBeenCalledTimes(1);
  });

  it('should handle paste (Ctrl+V) correctly', () => {
    const onCompleteMock = vi.fn();
    render(<CodeInput onComplete={onCompleteMock} />);
    const inputs = screen.getAllByRole('textbox');
    
    fireEvent.paste(inputs[0], { clipboardData: { getData: () => 'ab12-cd34-ef56-gh78' } });

    expect(inputs[0]).toHaveValue('AB12');
    expect(inputs[1]).toHaveValue('CD34');
    expect(inputs[2]).toHaveValue('EF56');
    expect(inputs[3]).toHaveValue('GH78');
    
    expect(onCompleteMock).toHaveBeenCalledWith('AB12CD34EF56GH78');
  });
});
