import React, { useState } from 'react';
import MemberItem, { Member } from './MemberItem';

interface SidebarProps {
  roomName: string;
  onOpenSettings?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ roomName, onOpenSettings }) => {
  // Mock data for members
  const [members, setMembers] = useState<Member[]>([
    {
      id: 'me',
      name: 'HuangJin',
      isHost: true,
      isSpeaking: true,
      localMuted: false,
      serverMuted: false,
      volume: 100,
    },
    {
      id: 'user-a',
      name: 'Player A',
      isHost: false,
      isSpeaking: false,
      localMuted: false,
      serverMuted: false,
      volume: 100,
    }
  ]);

  const handleLocalMuteToggle = (id: string) => {
    setMembers(prev => prev.map(m => m.id === id ? { ...m, localMuted: !m.localMuted } : m));
  };

  const handleVolumeChange = (id: string, volume: number) => {
    setMembers(prev => prev.map(m => m.id === id ? { ...m, volume } : m));
  };

  const [roomCode, setRoomCode] = useState('A9B2K8');

  const handleRegenerateCode = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRoomCode(Math.random().toString(36).substring(2, 8).toUpperCase());
  };

  return (
    <aside className="w-64 bg-[#2b2d31] flex flex-col border-r border-[#1e1f22] h-full">
      <div 
        className="h-14 border-b border-[#1e1f22] flex flex-col justify-center px-4 shadow-sm group cursor-pointer hover:bg-[#3f4147] transition-colors text-white relative" 
      >
        <div className="flex items-center justify-between font-bold">
          <span className="truncate">⚔️ {roomName}</span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-xs text-gray-400 font-mono" title="点击复制口令">Code: <span className="text-gray-300 group-hover:text-white">{roomCode}</span></span>
          <button 
            onClick={handleRegenerateCode}
            className="text-[10px] text-indigo-400 hover:text-indigo-300 hidden group-hover:block transition-colors"
            title="重新生成口令"
          >
            重新生成
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {members.map(member => (
          <MemberItem 
            key={member.id} 
            member={member} 
            isCurrentUserHost={true} 
            onLocalMuteToggle={handleLocalMuteToggle}
            onVolumeChange={handleVolumeChange}
          />
        ))}
      </div>

      {/* 底部本地控制面板 */}
      <div className="h-14 bg-[#232428] flex items-center justify-between px-3">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-sm text-white">我</div>
          <div className="flex flex-col">
            <span className="text-xs font-bold leading-tight text-white">HuangJin</span>
            <span className="text-[10px] text-green-400 leading-tight">在线</span>
          </div>
        </div>
        <div className="flex space-x-2 text-gray-400">
          <button className="hover:text-white p-1 rounded hover:bg-gray-700" title="麦克风开关">🎤</button>
          <button className="hover:text-white p-1 rounded hover:bg-gray-700" title="扬声器开关">🎧</button>
          <button 
            onClick={onOpenSettings}
            className="hover:text-white p-1 rounded hover:bg-gray-700" 
            title="设置"
          >
            ⚙️
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;