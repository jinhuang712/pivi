import React, { useRef, useState } from 'react';
import { INVITE_CODE_GROUPS, INVITE_CODE_GROUP_SIZE, normalizeInviteCode } from '../lib/inviteCode';
import { T } from '../providers';

interface CodeInputProps {
  onComplete: (code: string) => void;
}

const CodeInput: React.FC<CodeInputProps> = ({ onComplete }) => {
  const [code, setCode] = useState<string[]>(Array(INVITE_CODE_GROUPS).fill(''));
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const value = normalizeInviteCode(e.target.value).slice(0, INVITE_CODE_GROUP_SIZE);

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    if (value.length === INVITE_CODE_GROUP_SIZE && index < INVITE_CODE_GROUPS - 1) {
      inputsRef.current[index + 1]?.focus();
    }

    if (newCode.every((chunk) => chunk.length === INVITE_CODE_GROUP_SIZE)) {
      onComplete(newCode.join(''));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace') {
      if (!code[index] && index > 0) {
        inputsRef.current[index - 1]?.focus();
      } else {
        const newCode = [...code];
        newCode[index] = '';
        setCode(newCode);
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = normalizeInviteCode(e.clipboardData.getData('text')).slice(
      0,
      INVITE_CODE_GROUPS * INVITE_CODE_GROUP_SIZE,
    );

    if (!pasteData) return;

    const newCode = Array.from({ length: INVITE_CODE_GROUPS }, (_, index) =>
      pasteData.slice(index * INVITE_CODE_GROUP_SIZE, (index + 1) * INVITE_CODE_GROUP_SIZE),
    );
    setCode(newCode);

    const filledGroupCount = newCode.filter(Boolean).length;
    if (pasteData.length < INVITE_CODE_GROUPS * INVITE_CODE_GROUP_SIZE) {
      inputsRef.current[Math.min(filledGroupCount, INVITE_CODE_GROUPS - 1)]?.focus();
    } else {
      inputsRef.current[INVITE_CODE_GROUPS - 1]?.focus();
      if (newCode.every((chunk) => chunk.length === INVITE_CODE_GROUP_SIZE)) {
        onComplete(newCode.join(''));
      }
    }
  };

  return (
    <div className="codefield" data-testid="code-input-container">
      {code.map((char, index) => (
        <input
          key={index}
          ref={(el) => {
            inputsRef.current[index] = el;
          }}
          type="text"
          maxLength={INVITE_CODE_GROUP_SIZE}
          value={char}
          onChange={(e) => handleChange(e, index)}
          onKeyDown={(e) => handleKeyDown(e, index)}
          onPaste={handlePaste}
          aria-label={`Invite code group ${index + 1}`}
        />
      ))}
    </div>
  );
};

export const codeFieldHint = () => <T zh="粘贴完整邀请码可一次填满所有分组。" en="Paste a full code to fill every group at once." />;
export default CodeInput;
