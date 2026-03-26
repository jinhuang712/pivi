import React from 'react';
import MemberItem, { Member } from './MemberItem';

interface SidebarProps {
  roomName: string;
  inviteCode: string;
  currentUserName: string;
  members: Member[];
  isCurrentUserHost: boolean;
  onRegenerateInviteCode: () => void;
  onLocalMuteToggle: (id: string) => void;
  onVolumeChange: (id: string, volume: number) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  roomName,
  inviteCode,
  currentUserName,
  members,
  isCurrentUserHost,
  onRegenerateInviteCode,
  onLocalMuteToggle,
  onVolumeChange,
}) => {
  const handleRegenerateInviteCode = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRegenerateInviteCode();
  };

  const handleCopyInviteCode = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(inviteCode);
    alert('邀请码已复制！');
  };

  return (
    <aside className="w-80 bg-[#2b2d31] flex flex-col border-r border-[#1e1f22] h-full flex-shrink-0">
      <div 
        className="p-4 border-b border-[#1e1f22] flex flex-col justify-center shadow-sm text-white relative" 
      >
        <div className="flex items-center justify-between font-bold text-lg mb-3">
          <span className="truncate">⚔️ {roomName}</span>
        </div>
        <div className="flex items-center justify-between bg-[#1e1f22] rounded-md px-3 py-2 border border-gray-700">
          <div className="flex items-center space-x-2">
            <span className="text-xs text-gray-400">邀请码:</span>
            <span className="text-lg text-white font-mono tracking-wider font-bold">{inviteCode}</span>
          </div>
          <div className="flex items-center space-x-2">
            <button 
              onClick={handleCopyInviteCode}
              className="text-gray-400 hover:text-white transition-colors"
              title="复制邀请码"
            >
              📋
            </button>
            <button 
              onClick={handleRegenerateInviteCode}
              className="text-indigo-400 hover:text-indigo-300 transition-colors"
              title="重新生成邀请码"
            >
              🔄
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 bg-[#232428] flex items-center justify-between border-b border-[#1e1f22]">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-sm">我</div>
          <div className="flex flex-col">
            <span className="text-sm font-bold leading-tight text-white mb-0.5">{currentUserName}</span>
            <span className="text-xs text-green-400 leading-tight flex items-center"><span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1 animate-pulse"></span>在线</span>
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        <div className="px-2 py-1 mt-2 mb-1 text-xs font-bold text-gray-500">在线成员 - {members.length}</div>
        {members.map(member => (
          <MemberItem 
            key={member.id} 
            member={member} 
            isCurrentUserHost={isCurrentUserHost}
            onLocalMuteToggle={onLocalMuteToggle}
            onVolumeChange={onVolumeChange}
          />
        ))}
      </div>

    </aside>
  );
};

export default Sidebar;
