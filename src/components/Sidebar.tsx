import React, { useState } from 'react';
import MemberItem, { type Member } from './MemberItem';
import { T, useLang } from '../providers';

interface SidebarProps {
  roomName: string;
  inviteCode: string;
  currentUserId: string;
  currentUserName: string;
  members: Member[];
  isCurrentUserHost: boolean;
  onRegenerateInviteCode?: () => void;
  onLocalMuteToggle?: (id: string) => void;
  onVolumeChange?: (id: string, volume: number) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  roomName,
  inviteCode,
  currentUserId,
  currentUserName,
  members,
  isCurrentUserHost,
  onLocalMuteToggle,
  onVolumeChange,
}) => {
  const [copied, setCopied] = useState(false);
  const { lang } = useLang();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <aside className="rail">
      <div className="rail-room">
        <div className="name">{roomName}</div>
        <div className="freq">
          <span className="live" />
          <span className="code">{inviteCode}</span>
          <button className="copy" onClick={handleCopy}>
            {copied
              ? (lang === 'zh' ? '已复制' : 'copied')
              : (lang === 'zh' ? '复制' : 'copy')}
          </button>
        </div>
      </div>

      <div className="you">
        <div className="av">{currentUserName.charAt(0).toUpperCase()}</div>
        <div>
          <div className="nm">{currentUserName}</div>
          <div className="rl">
            {isCurrentUserHost
              ? <T zh="你 · 房主" en="you · host" />
              : <T zh="你" en="you" />}
          </div>
        </div>
      </div>

      <div className="mlist">
        <div className="label">
          <T zh="在线" en="In room" /> · {members.length}
        </div>
        {members.map((member) => (
          <MemberItem
            key={member.id}
            member={member}
            isCurrentUserHost={isCurrentUserHost}
            isCurrentUser={member.id === currentUserId}
            onLocalMuteToggle={onLocalMuteToggle}
            onVolumeChange={onVolumeChange}
          />
        ))}
      </div>
    </aside>
  );
};

export default Sidebar;
