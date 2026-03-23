import React, { useRef, useState } from 'react';

interface CodeInputProps {
  onComplete: (code: string) => void;
}

const CodeInput: React.FC<CodeInputProps> = ({ onComplete }) => {
  const [code, setCode] = useState<string[]>(Array(6).fill(''));
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    // Only allow alphanumeric characters and convert to uppercase
    const rawValue = e.target.value;
    const value = rawValue.toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    // Always keep the last entered character if multiple are entered
    const char = value ? value[value.length - 1] : '';

    const newCode = [...code];
    newCode[index] = char;
    setCode(newCode);

    // Auto focus next input
    if (char && index < 5) {
      inputsRef.current[index + 1]?.focus();
    }

    // Check completion
    if (newCode.every((c) => c !== '')) {
      onComplete(newCode.join(''));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace') {
      if (!code[index] && index > 0) {
        // If current is empty, focus previous
        inputsRef.current[index - 1]?.focus();
      } else {
        // Clear current
        const newCode = [...code];
        newCode[index] = '';
        setCode(newCode);
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData
      .getData('text')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6);

    if (!pasteData) return;

    const newCode = [...code];
    for (let i = 0; i < pasteData.length; i++) {
      if (i < 6) {
        newCode[i] = pasteData[i];
      }
    }
    setCode(newCode);

    if (pasteData.length < 6) {
      inputsRef.current[pasteData.length]?.focus();
    } else {
      inputsRef.current[5]?.focus();
      if (newCode.every((c) => c !== '')) {
        onComplete(newCode.join(''));
      }
    }
  };

  return (
    <div className="flex space-x-3" data-testid="code-input-container">
      {code.map((char, index) => (
        <input
          key={index}
          ref={(el) => {
            inputsRef.current[index] = el;
          }}
          type="text"
          maxLength={1}
          value={char}
          onChange={(e) => handleChange(e, index)}
          onKeyDown={(e) => handleKeyDown(e, index)}
          onPaste={handlePaste}
          className="w-12 h-16 text-center text-2xl font-bold bg-[#1e1f22] border-2 border-[#4b5563] rounded-lg text-white uppercase transition-all focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
        />
      ))}
    </div>
  );
};

export default CodeInput;
