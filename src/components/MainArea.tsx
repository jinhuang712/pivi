import React, { useState } from 'react';
import type { RoomNetworkPath } from '../types/channel';
import type { ChatMessage } from '../types/channel';

interface MainAreaProps {
  onOpenSettings?: () => void;
  currentUserName: string;
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  networkPath?: RoomNetworkPath;
  networkNotice?: string;
}

const MainArea: React.FC<MainAreaProps> = ({
  onOpenSettings,
  currentUserName,
  messages,
  onSendMessage,
  networkPath = 'p2p',
  networkNotice,
}) => {
  const [isSharing, setIsSharing] = useState(false);
  const [isExpandedShare, setIsExpandedShare] = useState(false);
  const [quality, setQuality] = useState('1080p');
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [micVolume, setMicVolume] = useState(100);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [speakerVolume, setSpeakerVolume] = useState(100);
  const [inputValue, setInputValue] = useState('');
  const [showError, setShowError] = useState(false);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    onSendMessage(inputValue.trim());
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  const handleSimulateUploadError = () => {
    setShowError(true);
    setTimeout(() => setShowError(false), 3000);
  };

  const handleSpeakerToggle = () => {
    setIsSpeakerMuted(prev => !prev);
  };

  const handleMicToggle = () => {
    setIsMicMuted(prev => !prev);
  };

  return (
    <main className="flex-1 flex flex-col relative bg-[#313338] h-full overflow-hidden">
      <div className="h-14 border-b border-[#2b2d31] flex justify-between items-center px-6 flex-shrink-0">
        <div className="flex space-x-4 text-white font-bold text-lg">
          <span>房间聊天区</span>
        </div>
        
        <div className="flex items-center space-x-4">
          <div 
            className={`flex items-center space-x-2 text-xs px-2 py-1.5 rounded cursor-pointer hover:bg-[#1e1f22] ${
              networkPath === 'relay' ? 'text-amber-300 bg-amber-500/10' : 'text-green-400 bg-[#2b2d31]'
            }`}
            title="点击展开/收起网络详情"
          >
            <span>Ping: 24ms</span>
            <span className="text-gray-500">|</span>
            <span>{networkPath === 'relay' ? 'Relay中转' : 'P2P直连'}</span>
            {networkNotice && (
              <>
                <span className="text-gray-500">|</span>
                <span>{networkNotice}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col relative min-h-0">
        {isExpandedShare && isSharing && (
          <div className="flex-1 bg-[#1e1f22] border-b border-[#2b2d31] flex flex-col items-center justify-center relative min-h-0">
            <button 
              onClick={() => setIsExpandedShare(false)}
              className="absolute top-4 right-4 bg-black bg-opacity-60 hover:bg-opacity-80 text-white px-3 py-1 rounded text-sm transition-all z-10"
            >
              缩小至角落 ↘️
            </button>
            <span className="text-6xl mb-4">🎮</span>
            <span className="text-gray-400 font-medium">完整屏幕画面 ({quality})</span>
          </div>
        )}

        <div className={`flex flex-col bg-[#313338] min-h-0 ${isExpandedShare && isSharing ? 'h-1/3' : 'flex-1'}`}>
          {!isExpandedShare && isSharing && (
            <div 
              className="absolute top-4 right-4 z-20 w-64 h-36 bg-black border border-gray-600 rounded-lg shadow-2xl overflow-hidden group cursor-pointer" 
              onClick={() => setIsExpandedShare(true)}
            >
              {/* Blurred Background */}
              <div className="absolute inset-0 flex items-center justify-center filter blur-sm group-hover:blur-none transition-all duration-300">
                 <span className="text-4xl">🎮</span>
              </div>
              {/* Overlay */}
              <div className="absolute inset-0 bg-black bg-opacity-40 group-hover:bg-opacity-10 transition-all flex items-center justify-center">
                <span className="text-white text-sm font-bold bg-black bg-opacity-60 px-3 py-1 rounded opacity-100 group-hover:opacity-0 transition-opacity">
                  点击放大画面
                </span>
              </div>
              {/* Label */}
              <div className="absolute bottom-2 left-2 text-[10px] text-white bg-black bg-opacity-60 px-1.5 py-0.5 rounded">
                正在共享 ({quality})
              </div>
            </div>
          )}

          <div className="flex-1 p-4 overflow-y-auto space-y-4" id="chat-messages">
            {messages.length === 0 && (
              <div className="text-sm text-gray-500">暂无消息，发送第一条消息开始聊天。</div>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className="flex space-x-3">
                <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center font-bold ${msg.isSelf ? 'bg-blue-500' : 'bg-gray-500'}`}>
                  {msg.isSelf ? '我' : msg.sender.charAt(0)}
                </div>
                <div>
                  <div className="flex items-baseline space-x-2">
                    <span className={`font-medium text-sm ${msg.isSelf ? 'text-blue-400' : 'text-gray-300'}`}>
                      {msg.isSelf ? currentUserName : msg.sender}
                    </span>
                    <span className="text-xs text-gray-500">{msg.time}</span>
                  </div>
                  <p className="text-sm text-gray-300 mt-1">{msg.content}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="px-4 pb-3">
            <div className="mx-auto max-w-full bg-[#1e1f22] border border-gray-700 rounded-full px-3 py-2 flex items-center gap-3 shadow-lg">
              {!isSharing ? (
                <button 
                  onClick={() => setIsSharing(true)}
                  className="text-sm bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-1.5 rounded-full transition-colors flex items-center space-x-1 whitespace-nowrap flex-shrink-0"
                >
                  <span>📺</span>
                  <span>开始共享</span>
                </button>
              ) : (
                <>
                  <select 
                    value={quality} 
                    onChange={(e) => setQuality(e.target.value)}
                    className="bg-[#2b2d31] text-xs text-gray-300 border border-gray-700 rounded-full px-2 py-1 outline-none cursor-pointer whitespace-nowrap flex-shrink-0"
                  >
                    <option value="720p">720p</option>
                    <option value="1080p">1080p</option>
                    <option value="原画">原画</option>
                  </select>
                  <button 
                    onClick={() => { setIsSharing(false); setIsExpandedShare(false); }}
                    className="text-sm bg-red-500 hover:bg-red-600 text-white px-4 py-1.5 rounded-full transition-colors whitespace-nowrap flex-shrink-0"
                  >
                    停止共享
                  </button>
                </>
              )}

              <div className="h-6 w-px bg-gray-700" />
              <div className="relative group flex items-center gap-1.5">
                <button
                  onClick={handleMicToggle}
                  className={`p-2 rounded-full transition-colors ${isMicMuted ? 'text-red-400 hover:text-red-300' : 'text-gray-300 hover:text-white'}`}
                  title="麦克风开关"
                >
                  {isMicMuted ? '🎙️' : '🎤'}
                </button>
                <span className="text-xs text-gray-300 font-mono w-9 text-right">{micVolume}%</span>
                <div className="absolute left-1/2 -translate-x-1/2 bottom-10 hidden group-hover:flex bg-[#111318] border border-gray-700 rounded-lg px-2 py-3 shadow-xl">
                  <div className="h-24 w-8 flex items-center justify-center">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={micVolume}
                      onChange={(e) => setMicVolume(parseInt(e.target.value, 10))}
                      className="w-24 h-1 -rotate-90 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                      title="麦克风音量"
                    />
                  </div>
                </div>
              </div>
              <div className="h-6 w-px bg-gray-700" />
              <div className="relative group flex items-center gap-1.5">
                <button
                  onClick={handleSpeakerToggle}
                  className={`p-2 rounded-full transition-colors ${isSpeakerMuted ? 'text-red-400 hover:text-red-300' : 'text-gray-300 hover:text-white'}`}
                  title="扬声器开关"
                >
                  {isSpeakerMuted ? '🔇' : '🎧'}
                </button>
                <span className="text-xs text-gray-300 font-mono w-9 text-right">{speakerVolume}%</span>
                <div className="absolute left-1/2 -translate-x-1/2 bottom-10 hidden group-hover:flex bg-[#111318] border border-gray-700 rounded-lg px-2 py-3 shadow-xl">
                  <div className="h-24 w-8 flex items-center justify-center">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={speakerVolume}
                      onChange={(e) => setSpeakerVolume(parseInt(e.target.value, 10))}
                      className="w-24 h-1 -rotate-90 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                      title="扬声器音量"
                    />
                  </div>
                </div>
              </div>
              <div className="h-6 w-px bg-gray-700" />
              <button 
                onClick={onOpenSettings}
                className="p-2 rounded-full text-gray-300 hover:text-white transition-colors"
                title="设置"
              >
                ⚙️
              </button>
            </div>
          </div>

          <div className="p-4 pt-2 relative border-t border-[#2b2d31]">
          {showError && (
            <div className="absolute -top-8 left-4 bg-red-500 text-white text-xs px-3 py-1 rounded shadow-lg">
              ⚠️ 图片大小不能超过 5MB
            </div>
          )}
          
          <div className="bg-[#383a40] rounded-lg flex items-center p-2 focus-within:ring-1 ring-indigo-500 transition-all">
            <button 
              onClick={handleSimulateUploadError}
              className="text-gray-400 hover:text-white px-2 cursor-pointer transition-colors" 
              title="上传图片/文件"
            >
              <span className="text-xl">⊕</span>
            </button>
            <input 
              type="text" 
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息... (支持 Ctrl+V 粘贴截图)" 
              className="flex-1 bg-transparent border-none outline-none text-sm text-gray-200 px-2 placeholder-gray-500"
            />
            <button 
              onClick={handleSend}
              className="text-gray-400 hover:text-indigo-400 px-2 cursor-pointer transition-colors" 
              title="发送"
            >
              <svg className="w-5 h-5 transform rotate-90" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>
      </div>
    </main>
  );
};

export default MainArea;
