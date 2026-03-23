import React, { useState, useEffect } from 'react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState('audio');
  const [roomCode, setRoomCode] = useState('A9B2K8');
  const [isUnbanned, setIsUnbanned] = useState(false);

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const renderTabContent = () => {
    switch (activeTab) {
      case 'audio':
        return (
          <div id="tab-audio">
            <h1 className="text-xl font-bold mb-6 text-white">语音与设备</h1>
            <div className="mb-6">
              <label className="block text-xs font-bold text-gray-400 mb-2">输入设备 (麦克风)</label>
              <select className="w-full bg-[#1e1f22] border border-gray-700 text-sm rounded p-2 text-gray-200 focus:outline-none focus:border-indigo-500 cursor-pointer">
                <option>Default - MacBook Pro Microphone</option>
                <option>External USB Mic</option>
              </select>
            </div>
            <div className="mb-6">
              <label className="block text-xs font-bold text-gray-400 mb-2">输出设备 (扬声器)</label>
              <select className="w-full bg-[#1e1f22] border border-gray-700 text-sm rounded p-2 text-gray-200 focus:outline-none focus:border-indigo-500 cursor-pointer">
                <option>Default - MacBook Pro Speakers</option>
                <option>AirPods Pro</option>
              </select>
            </div>
            <div className="my-6 border-t border-gray-700"></div>
            <h2 className="text-sm font-bold text-gray-200 mb-4">输入模式</h2>
            <div className="flex space-x-4 mb-4">
              <label className="flex items-center space-x-2 text-sm text-gray-300 cursor-pointer">
                <input type="radio" name="input_mode" className="text-indigo-500 bg-gray-800" defaultChecked />
                <span>语音激活 (VAD)</span>
              </label>
              <label className="flex items-center space-x-2 text-sm text-gray-300 cursor-pointer">
                <input type="radio" name="input_mode" className="text-indigo-500 bg-gray-800" />
                <span>按键说话 (PTT)</span>
              </label>
            </div>
          </div>
        );
      case 'ban':
        return (
          <div id="tab-ban">
            <h1 className="text-xl font-bold mb-6 text-white text-red-400">封禁与黑名单</h1>
            <p className="text-sm text-gray-400 mb-4">被封禁的用户将无法通过当前口令加入房间。</p>
            <div className="bg-[#1e1f22] rounded border border-gray-700 p-4">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-300 font-bold">Player B</span>
                  <span className="text-xs text-gray-500 font-mono">UUID: 1234-5678...</span>
                </div>
                <button 
                  onClick={() => setIsUnbanned(true)}
                  disabled={isUnbanned}
                  className={`px-3 py-1 text-xs rounded text-white transition-colors ${isUnbanned ? 'bg-gray-600 opacity-50 cursor-not-allowed' : 'bg-gray-700 hover:bg-gray-600'}`}
                >
                  {isUnbanned ? '已解封' : '解除封禁'}
                </button>
              </div>
              <div className="text-xs text-red-400 mt-1">封禁原因: 恶意刷屏</div>
            </div>
          </div>
        );
      case 'room':
        return (
          <div id="tab-room">
            <h1 className="text-xl font-bold text-white">房间设置</h1>
            <div className="mt-4">
              <label className="block text-xs font-bold text-gray-400 mb-2">当前房间 Code</label>
              <div className="flex items-center space-x-2">
                <input type="text" value={roomCode} className="bg-[#1e1f22] border border-gray-700 text-sm rounded p-2 text-white font-mono w-32 text-center" readOnly />
                <button 
                  onClick={() => setRoomCode(Math.random().toString(36).substring(2, 8).toUpperCase())}
                  className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 rounded text-sm font-medium text-white"
                >
                  重新生成
                </button>
              </div>
            </div>
          </div>
        );
      default:
        return (
          <div className="text-gray-400 mt-4">
            <h1 className="text-xl font-bold text-white mb-4">设置</h1>
            （占位界面）
          </div>
        );
    }
  };

  const navItemClass = (id: string, isDanger: boolean = false, isWarn: boolean = false) => {
    let base = "w-full text-left px-2 py-1.5 text-sm rounded transition-colors ";
    if (activeTab === id) {
      base += "bg-[#3f4147] text-white";
    } else {
      if (isDanger) base += "text-red-400 hover:bg-[#3f4147] hover:text-white";
      else if (isWarn) base += "text-yellow-400 hover:bg-[#3f4147] hover:text-white";
      else base += "text-gray-300 hover:bg-[#3f4147] hover:text-white";
    }
    return base;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex justify-center items-center">
      <div className="bg-[#313338] w-[800px] h-[600px] rounded-lg shadow-2xl flex overflow-hidden border border-gray-700">
        
        {/* 左侧菜单 */}
        <aside className="w-1/3 bg-[#2b2d31] p-4 flex flex-col">
          <h2 className="text-xs font-bold text-gray-400 mb-2 px-2">用户设置</h2>
          <button className={navItemClass('account')} onClick={() => setActiveTab('account')}>我的账号</button>
          <button className={navItemClass('audio')} onClick={() => setActiveTab('audio')}>语音与设备</button>
          <button className={navItemClass('hotkey')} onClick={() => setActiveTab('hotkey')}>快捷键</button>

          <div className="my-4 border-t border-gray-700"></div>

          <h2 className="text-xs font-bold text-gray-400 mb-2 px-2">房主管理面板</h2>
          <button className={navItemClass('room')} onClick={() => setActiveTab('room')}>房间设置 (口令)</button>
          <button className={navItemClass('ban', true)} onClick={() => setActiveTab('ban')}>封禁与黑名单</button>
          <button className={navItemClass('transfer', false, true)} onClick={() => setActiveTab('transfer')}>移交房主权限</button>
        </aside>

        {/* 右侧内容区 */}
        <main className="flex-1 p-8 overflow-y-auto relative">
          {/* 关闭按钮 */}
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl font-bold transition-colors" 
            title="关闭 (Esc)"
          >
            &times;
          </button>
          {renderTabContent()}
        </main>
      </div>
    </div>
  );
};

export default SettingsModal;
