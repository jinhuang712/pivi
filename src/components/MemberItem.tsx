import React, { useState, useEffect, useRef } from 'react';

export interface Member {
  id: string;
  name: string;
  isHost: boolean;
  isSpeaking: boolean;
  localMuted: boolean;
  serverMuted: boolean;
  volume: number;
}

interface MemberItemProps {
  member: Member;
  isCurrentUserHost: boolean;
  onLocalMuteToggle?: (id: string) => void;
  onVolumeChange?: (id: string, volume: number) => void;
  onServerMute?: (id: string) => void;
  onKick?: (id: string) => void;
  onBan?: (id: string) => void;
  onTransferHost?: (id: string) => void;
}

const MemberItem: React.FC<MemberItemProps> = ({
  member,
  isCurrentUserHost,
  onLocalMuteToggle,
  onVolumeChange,
  onServerMute,
  onKick,
  onBan,
  onTransferHost,
}) => {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!isCurrentUserHost || member.isHost) return; // Cannot manage host
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  return (
    <>
      <div 
        className="flex flex-col p-2 rounded hover:bg-[#3f4147] group cursor-pointer transition-all"
        onContextMenu={handleContextMenu}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${member.isHost ? 'bg-blue-500' : 'bg-gray-500'}`}>
              {member.name.charAt(0).toUpperCase()}
            </div>
            <span className={`text-sm font-medium ${member.isHost ? 'text-blue-400' : 'text-gray-200'}`}>
              {member.name} {member.isHost && '(房主)'}
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Speaking Indicator */}
            <div 
              data-testid={`speaking-indicator-${member.id}`}
              className={`w-2 h-2 rounded-full ${member.isSpeaking ? 'bg-green-500 animate-pulse' : 'bg-transparent'}`} 
            />
            
            {/* Local Mute Button (Hover only if not yourself, assuming handled by parent or just display logic) */}
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onLocalMuteToggle?.(member.id);
              }}
              className={`text-xs transition-colors ${member.localMuted ? 'text-red-500 block' : 'text-gray-400 hidden group-hover:block hover:text-red-400'}`}
              title={member.localMuted ? '取消本地屏蔽' : '本地屏蔽'}
            >
              {member.localMuted ? '🔇' : '🔊'}
            </button>
          </div>
        </div>

        {/* Volume Slider (Hover only) */}
        {!member.isHost && (
          <div className="hidden group-hover:flex items-center mt-2 space-x-2 px-1">
            <span className="text-[10px] text-gray-400">音量</span>
            <input 
              type="range" 
              min="0" 
              max="200" 
              value={member.volume} 
              onChange={(e) => onVolumeChange?.(member.id, parseInt(e.target.value))}
              onClick={(e) => e.stopPropagation()}
              className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        )}
      </div>

      {/* Context Menu for Host */}
      {contextMenu && (
        <div 
          ref={menuRef}
          className="fixed bg-[#1e1f22] border border-gray-700 rounded shadow-xl z-50 py-1 w-32"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button 
            onClick={() => { onTransferHost?.(member.id); setContextMenu(null); }}
            className="w-full text-left px-4 py-2 text-sm text-yellow-500 hover:bg-yellow-600 hover:text-white"
          >
            移交房主
          </button>
          <div className="my-1 border-t border-gray-700"></div>
          <button 
            onClick={() => { onServerMute?.(member.id); setContextMenu(null); }}
            className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-indigo-500 hover:text-white"
          >
            全局强制闭麦
          </button>
          <button 
            onClick={() => { onKick?.(member.id); setContextMenu(null); }}
            className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500 hover:text-white"
          >
            踢出房间
          </button>
          <button 
            onClick={() => { onBan?.(member.id); setContextMenu(null); }}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-700 hover:text-white"
          >
            加入黑名单
          </button>
        </div>
      )}
    </>
  );
};

export default MemberItem;
