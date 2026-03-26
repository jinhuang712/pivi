import React, { useState, useEffect, useRef } from 'react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState('account');
  const [isUnbanned, setIsUnbanned] = useState(false);
  const [nickname, setNickname] = useState('HuangJin');
  const uuid = 'user-uuid-1234-5678';
  const localMicStreamRef = useRef<MediaStream | null>(null);
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputDevice, setSelectedInputDevice] = useState('');
  const [selectedOutputDevice, setSelectedOutputDevice] = useState('');
  const [micCaptureState, setMicCaptureState] = useState<'idle' | 'capturing' | 'error'>('idle');
  const [micError, setMicError] = useState('');
  
  // Hotkey states
  const [pttHotkey, setPttHotkey] = useState('V');
  const [muteHotkey, setMuteHotkey] = useState('M');
  const [isRecordingHotkey, setIsRecordingHotkey] = useState<'ptt' | 'mute' | null>(null);

  const stopMicCapture = () => {
    if (localMicStreamRef.current) {
      localMicStreamRef.current.getTracks().forEach((track) => track.stop());
      localMicStreamRef.current = null;
    }
    setMicCaptureState('idle');
  };

  const syncAudioDevices = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return;
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter((d) => d.kind === 'audioinput');
    const outputs = devices.filter((d) => d.kind === 'audiooutput');
    setAudioInputDevices(inputs);
    setAudioOutputDevices(outputs);
    if (!selectedInputDevice && inputs.length > 0) {
      setSelectedInputDevice(inputs[0].deviceId);
    }
    if (!selectedOutputDevice && outputs.length > 0) {
      setSelectedOutputDevice(outputs[0].deviceId);
    }
  };

  const startMicCapture = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMicCaptureState('error');
      setMicError('当前环境不支持麦克风采集');
      return;
    }
    try {
      stopMicCapture();
      const constraints: MediaStreamConstraints = {
        audio: selectedInputDevice ? { deviceId: { exact: selectedInputDevice } } : true,
        video: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localMicStreamRef.current = stream;
      setMicCaptureState('capturing');
      setMicError('');
      await syncAudioDevices();
    } catch (error) {
      setMicCaptureState('error');
      setMicError(error instanceof Error ? error.message : '麦克风采集失败');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If we are recording a hotkey, capture it instead of standard behavior
      if (isRecordingHotkey) {
        e.preventDefault();
        e.stopPropagation();
        
        // Escape cancels recording
        if (e.key === 'Escape') {
          setIsRecordingHotkey(null);
          return;
        }

        const keyName = e.key.toUpperCase();
        if (isRecordingHotkey === 'ptt') setPttHotkey(keyName);
        if (isRecordingHotkey === 'mute') setMuteHotkey(keyName);
        
        setIsRecordingHotkey(null);
        return;
      }

      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isRecordingHotkey]);

  useEffect(() => {
    if (!isOpen) {
      stopMicCapture();
      return;
    }
    syncAudioDevices();
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices || !mediaDevices.addEventListener) {
      return;
    }
    const handleDeviceChange = () => {
      void syncAudioDevices();
    };
    mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => {
      mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      stopMicCapture();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const renderTabContent = () => {
    switch (activeTab) {
      case 'audio':
        return (
          <div id="tab-audio">
            <h1 className="text-xl font-bold mb-6 text-white">语音与设备</h1>
            <div className="mb-6">
              <label className="block text-xs font-bold text-gray-400 mb-2">输入设备 (麦克风)</label>
              <select
                value={selectedInputDevice}
                onChange={(e) => setSelectedInputDevice(e.target.value)}
                className="w-full bg-[#1e1f22] border border-gray-700 text-sm rounded p-2 text-gray-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                {audioInputDevices.length === 0 && (
                  <option value="">Default - System Microphone</option>
                )}
                {audioInputDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Microphone ${device.deviceId.slice(0, 6)}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-6">
              <label className="block text-xs font-bold text-gray-400 mb-2">输出设备 (扬声器)</label>
              <select
                value={selectedOutputDevice}
                onChange={(e) => setSelectedOutputDevice(e.target.value)}
                className="w-full bg-[#1e1f22] border border-gray-700 text-sm rounded p-2 text-gray-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                {audioOutputDevices.length === 0 && (
                  <option value="">Default - System Speaker</option>
                )}
                {audioOutputDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Speaker ${device.deviceId.slice(0, 6)}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-6">
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => void startMicCapture()}
                  className="px-3 py-1.5 rounded bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold transition-colors"
                >
                  开始麦克风采集
                </button>
                <button
                  onClick={stopMicCapture}
                  className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold transition-colors"
                >
                  停止采集
                </button>
                <span className={`text-xs font-bold ${micCaptureState === 'capturing' ? 'text-green-400' : micCaptureState === 'error' ? 'text-red-400' : 'text-gray-400'}`}>
                  {micCaptureState === 'capturing' ? '采集中' : micCaptureState === 'error' ? '采集失败' : '未采集'}
                </span>
              </div>
              {micError && <p className="text-xs text-red-400 mt-2">{micError}</p>}
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
            <p className="text-sm text-gray-400 mb-4">被封禁的用户将无法通过当前邀请码加入房间。</p>
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
      case 'hotkey':
        return (
          <div id="tab-hotkey">
            <h1 className="text-xl font-bold mb-6 text-white">快捷键</h1>
            <p className="text-sm text-gray-400 mb-6">点击输入框后按下你想要绑定的按键（按 Esc 取消录制）。</p>
            
            <div className="mb-6">
              <label className="block text-xs font-bold text-gray-400 mb-2" htmlFor="ptt-input">按键说话 (PTT) 快捷键</label>
              <input 
                id="ptt-input"
                type="text" 
                value={isRecordingHotkey === 'ptt' ? '录制中...' : pttHotkey}
                readOnly
                onFocus={() => setIsRecordingHotkey('ptt')}
                onBlur={() => setIsRecordingHotkey(null)}
                className={`w-full bg-[#1e1f22] border text-sm rounded p-2 text-white font-mono cursor-pointer transition-colors outline-none
                  ${isRecordingHotkey === 'ptt' ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-gray-700 hover:border-gray-500'}
                `}
              />
            </div>

            <div className="mb-6">
              <label className="block text-xs font-bold text-gray-400 mb-2" htmlFor="mute-input">全局静音/解除静音 快捷键</label>
              <input 
                id="mute-input"
                type="text" 
                value={isRecordingHotkey === 'mute' ? '录制中...' : muteHotkey}
                readOnly
                onFocus={() => setIsRecordingHotkey('mute')}
                onBlur={() => setIsRecordingHotkey(null)}
                className={`w-full bg-[#1e1f22] border text-sm rounded p-2 text-white font-mono cursor-pointer transition-colors outline-none
                  ${isRecordingHotkey === 'mute' ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-gray-700 hover:border-gray-500'}
                `}
              />
            </div>
          </div>
        );
      case 'account':
        return (
          <div id="tab-account">
            <h1 className="text-xl font-bold mb-6 text-white">我的账号</h1>
            
            <div className="mb-6">
              <label className="block text-xs font-bold text-gray-400 mb-2" htmlFor="nickname-input">显示昵称</label>
              <input 
                id="nickname-input"
                type="text" 
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="w-full bg-[#1e1f22] border border-gray-700 focus:border-indigo-500 text-sm rounded p-2 text-white outline-none transition-colors"
              />
              <p className="text-xs text-gray-500 mt-2">即时生效，持久化保存于本地，并广播给房间内其他人更新 UI。</p>
            </div>

            <div className="mb-6">
              <label className="block text-xs font-bold text-gray-400 mb-2">唯一标识符 (UUID)</label>
              <div className="bg-[#1e1f22] border border-gray-700 text-sm rounded p-2 text-gray-400 font-mono">
                {uuid}
              </div>
              <p className="text-xs text-gray-500 mt-2">系统自动分配的本地唯一 UUID，仅用于故障排查和黑名单识别，无法修改。</p>
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

  const navItemClass = (id: string, isDanger: boolean = false) => {
    let base = "w-full text-left px-2 py-1.5 text-sm rounded transition-colors ";
    if (activeTab === id) {
      base += "bg-[#3f4147] text-white";
    } else {
      if (isDanger) base += "text-red-400 hover:bg-[#3f4147] hover:text-white";
      else base += "text-gray-300 hover:bg-[#3f4147] hover:text-white";
    }
    return base;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex justify-center items-center">
      <div className="bg-[#313338] w-[800px] h-[600px] rounded-lg shadow-2xl flex overflow-hidden border border-gray-700">
        
        {/* 左侧菜单 */}
        <aside className="w-1/3 bg-[#2b2d31] p-4 flex flex-col space-y-1">
          <button className={navItemClass('account')} onClick={() => setActiveTab('account')}>我的账号</button>
          <button className={navItemClass('audio')} onClick={() => setActiveTab('audio')}>语音与设备</button>
          <button className={navItemClass('hotkey')} onClick={() => setActiveTab('hotkey')}>快捷键</button>
          <button className={navItemClass('ban', true)} onClick={() => setActiveTab('ban')}>封禁与黑名单</button>
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
