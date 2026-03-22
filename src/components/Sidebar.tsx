import React from 'react';

interface SidebarProps {
  roomName: string;
}

const Sidebar: React.FC<SidebarProps> = ({ roomName }) => {
  return (
    <aside className="w-64 bg-[#2b2d31] flex flex-col border-r border-[#1e1f22] h-full">
      {/* 房间头部 */}
      <div className="h-12 border-b border-[#1e1f22] flex items-center px-4 font-bold shadow-sm text-white">
        ⚔️ {roomName}
      </div>

      {/* 成员列表 (暂留空) */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {/* TODO: Member List */}
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
          <button className="hover:text-white p-1 rounded hover:bg-gray-700" title="设置">⚙️</button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;