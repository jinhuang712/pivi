import React, { useState } from 'react';

interface ChatMessage {
  id: string;
  sender: string;
  time: string;
  content: string;
  isSelf: boolean;
}

const MainArea: React.FC = () => {
  const [isSharing, setIsSharing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [showError, setShowError] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      sender: 'Player A',
      time: '14:32',
      content: '刚打到的战利品看看！',
      isSelf: false,
    },
  ]);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    
    const newMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: '我',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      content: inputValue,
      isSelf: true,
    };
    
    setMessages((prev) => [...prev, newMsg]);
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

  return (
    <main className="flex-1 flex flex-col relative bg-[#313338]">
      {/* 顶部导航与网络面板指示器 */}
      <div className="h-12 border-b border-[#2b2d31] flex justify-between items-center px-4">
        <div className="flex space-x-4 text-gray-400 text-sm">
          <button className="hover:text-white font-medium border-b-2 border-indigo-500 pb-1">
            屏幕共享 📺
          </button>
        </div>
        {/* 网络状态看板开关 */}
        <div 
          className="flex items-center space-x-2 text-xs text-green-400 bg-[#2b2d31] px-2 py-1 rounded cursor-pointer hover:bg-[#1e1f22]" 
          title="点击展开/收起网络详情"
        >
          <span>Ping: 24ms</span>
          <span className="text-gray-500">|</span>
          <span>P2P直连</span>
        </div>
      </div>

      {/* 屏幕共享预览占位区 */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full h-full border-2 border-dashed border-gray-600 rounded-lg flex flex-col items-center justify-center text-gray-500 bg-[#2b2d31]">
          <span className="text-4xl mb-2">🎮</span>
          <p>{isSharing ? '你的屏幕正在共享中...' : '当前无人共享屏幕'}</p>
          <button 
            onClick={() => setIsSharing(!isSharing)}
            className={`mt-4 px-4 py-2 rounded text-sm font-medium transition-colors text-white ${
              isSharing 
                ? 'bg-red-500 hover:bg-red-600' 
                : 'bg-indigo-500 hover:bg-indigo-600'
            }`}
          >
            {isSharing ? '停止共享' : '开始共享我的屏幕'}
          </button>
        </div>
      </div>

      {/* 底部：聊天框 (Chatbox) */}
      <div className="h-64 border-t border-[#2b2d31] flex flex-col">
        {/* 消息列表 */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4" id="chat-messages">
          {messages.map((msg) => (
            <div key={msg.id} className="flex space-x-3">
              <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center font-bold ${msg.isSelf ? 'bg-blue-500' : 'bg-gray-500'}`}>
                {msg.isSelf ? '我' : msg.sender.charAt(0)}
              </div>
              <div>
                <div className="flex items-baseline space-x-2">
                  <span className={`font-medium text-sm ${msg.isSelf ? 'text-blue-400' : 'text-gray-300'}`}>
                    {msg.sender}
                  </span>
                  <span className="text-xs text-gray-500">{msg.time}</span>
                </div>
                <p className="text-sm text-gray-300 mt-1">{msg.content}</p>
              </div>
            </div>
          ))}
        </div>
        
        {/* 输入框区域 */}
        <div className="p-4 pt-2 relative">
          {/* 错误提示气泡 */}
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
    </main>
  );
};

export default MainArea;