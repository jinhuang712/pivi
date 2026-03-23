import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CodeInput from '../components/CodeInput';

describe('CodeInput Component', () => {
  it('should render 6 input fields', () => {
    render(<CodeInput onComplete={() => {}} />);
    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(6);
  });

  it('should only allow alphanumeric characters and auto uppercase', () => {
    render(<CodeInput onComplete={() => {}} />);
    const inputs = screen.getAllByRole('textbox');
    
    fireEvent.change(inputs[0], { target: { value: 'a' } });
    expect(inputs[0]).toHaveValue('A');

    fireEvent.change(inputs[1], { target: { value: '9' } });
    expect(inputs[1]).toHaveValue('9');

    fireEvent.change(inputs[2], { target: { value: '@' } });
    expect(inputs[2]).toHaveValue('');
  });

  it('should auto-focus next input when typing', () => {
    render(<CodeInput onComplete={() => {}} />);
    const inputs = screen.getAllByRole('textbox');
    
    // Set focus on first input
    inputs[0].focus();
    expect(inputs[0]).toHaveFocus();

    // Type a character
    fireEvent.change(inputs[0], { target: { value: 'A' } });
    
    // Focus should move to the next input
    expect(inputs[1]).toHaveFocus();
  });

  it('should focus previous input on backspace if current is empty', () => {
    render(<CodeInput onComplete={() => {}} />);
    const inputs = screen.getAllByRole('textbox');
    
    inputs[1].focus();
    fireEvent.keyDown(inputs[1], { key: 'Backspace' });
    
    expect(inputs[0]).toHaveFocus();
  });

  it('should trigger onComplete when all 6 digits are filled', () => {
    const onCompleteMock = vi.fn();
    render(<CodeInput onComplete={onCompleteMock} />);
    const inputs = screen.getAllByRole('textbox');
    
    // Simulate typing 6 valid characters
    const code = ['A', 'B', '1', '2', 'C', 'D'];
    code.forEach((char, idx) => {
      fireEvent.change(inputs[idx], { target: { value: char } });
    });

    expect(onCompleteMock).toHaveBeenCalledWith('AB12CD');
    expect(onCompleteMock).toHaveBeenCalledTimes(1);
  });

  it('should handle paste (Ctrl+V) correctly', () => {
    const onCompleteMock = vi.fn();
    render(<CodeInput onComplete={onCompleteMock} />);
    const inputs = screen.getAllByRole('textbox');
    
    // Simulate pasting a 6-digit code
    fireEvent.paste(inputs[0], { clipboardData: { getData: () => 'x9y8z7' } });

    expect(inputs[0]).toHaveValue('X');
    expect(inputs[1]).toHaveValue('9');
    expect(inputs[2]).toHaveValue('Y');
    expect(inputs[3]).toHaveValue('8');
    expect(inputs[4]).toHaveValue('Z');
    expect(inputs[5]).toHaveValue('7');
    
    expect(onCompleteMock).toHaveBeenCalledWith('X9Y8Z7');
  });
});
