import { useState } from "react";
import "./App.css";
import Sidebar from "./components/Sidebar";
import CodeInput from "./components/CodeInput";
import ConfirmJoinModal from "./components/ConfirmJoinModal";
import SettingsModal from "./components/SettingsModal";

function App() {
  const [appState, setAppState] = useState<'join' | 'confirm' | 'channel'>('join');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [roomCode, setRoomCode] = useState("");

  const handleCodeComplete = (code: string) => {
    setRoomCode(code);
    setAppState('confirm');
  };

  return (
    <div className="h-screen w-screen flex overflow-hidden font-sans bg-[#1e1f22] text-[#f3f4f6]">
      {/* 1. 加入房间视图 */}
      {appState === 'join' && (
        <div className="flex-1 flex justify-center items-center">
          <div className="bg-[#313338] p-8 rounded-xl shadow-2xl w-[480px] flex flex-col items-center text-center">
            <h2 className="text-2xl font-bold mb-2">加入语音频道</h2>
            <p className="text-gray-400 text-sm mb-8">请输入 6 位房间口令 (字母与数字)</p>
            <CodeInput onComplete={handleCodeComplete} />
            <div className="w-full flex justify-between items-center mt-8">
              <button 
                onClick={() => setAppState('channel')} 
                className="text-sm text-indigo-400 hover:underline"
              >
                创建新房间
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. 主频道视图 */}
      {appState === 'channel' && (
        <>
          <Sidebar roomName="周末电竞开黑房" />
          <main className="flex-1 flex flex-col relative bg-[#313338] items-center justify-center text-gray-500">
            <h1>右侧主交互区占位</h1>
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="mt-4 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded text-sm transition-colors"
            >
              打开设置面板 (Demo)
            </button>
          </main>
        </>
      )}

      {/* 全局模态框 */}
      <ConfirmJoinModal 
        isOpen={appState === 'confirm'}
        roomName="周末电竞开黑房"
        onlineCount={3}
        hostName="HuangJin"
        onCancel={() => setAppState('join')}
        onConfirm={() => setAppState('channel')}
      />

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />
    </div>
  );
}

export default App;
