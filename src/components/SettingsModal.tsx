import React, { useState, useEffect, useRef } from 'react';
import { T, useLang, useTheme } from '../providers';
import { loadHotkeys, saveHotkeys } from '../lib/hotkeySettings';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onHotkeysChange?: () => void;
}

type Tab = 'account' | 'audio' | 'hotkey' | 'ban';

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onHotkeysChange }) => {
  const { lang, setLang } = useLang();
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>('account');
  const [isUnbanned, setIsUnbanned] = useState(false);
  const [nickname, setNickname] = useState(() => localStorage.getItem('lvc_nickname') || 'HuangJin');
  const uuid = localStorage.getItem('lvc_user_id') || '—';
  const localMicStreamRef = useRef<MediaStream | null>(null);
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputDevice, setSelectedInputDevice] = useState('');
  const [selectedOutputDevice, setSelectedOutputDevice] = useState('');
  const [micCaptureState, setMicCaptureState] = useState<'idle' | 'capturing' | 'error'>('idle');
  const [micError, setMicError] = useState('');

  const [hotkeys, setHotkeys] = useState(loadHotkeys);
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
    if (!selectedInputDevice && inputs.length > 0) setSelectedInputDevice(inputs[0].deviceId);
    if (!selectedOutputDevice && outputs.length > 0) setSelectedOutputDevice(outputs[0].deviceId);
  };

  const startMicCapture = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMicCaptureState('error');
      setMicError(lang === 'zh' ? '当前环境不支持麦克风采集' : 'Mic capture not supported here');
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
      setMicError(error instanceof Error ? error.message : lang === 'zh' ? '麦克风采集失败' : 'Mic capture failed');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isRecordingHotkey) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Escape') {
          setIsRecordingHotkey(null);
          return;
        }
        const keyName = e.key.toUpperCase();
        if (isRecordingHotkey === 'ptt' || isRecordingHotkey === 'mute') {
          const next = { ...hotkeys, [isRecordingHotkey]: keyName };
          setHotkeys(next);
          saveHotkeys(next);
          onHotkeysChange?.();
        }
        setIsRecordingHotkey(null);
        return;
      }
      if (e.key === 'Escape' && isOpen) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isRecordingHotkey, lang]);

  useEffect(() => {
    if (!isOpen) {
      stopMicCapture();
      return;
    }
    syncAudioDevices();
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices || !mediaDevices.addEventListener) return;
    const handleDeviceChange = () => void syncAudioDevices();
    mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => {
      mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      stopMicCapture();
    };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const navItem = (id: Tab, label: { zh: string; en: string }) => (
    <a className={activeTab === id ? 'active' : ''} onClick={() => setActiveTab(id)}>
      {lang === 'zh' ? label.zh : label.en}
    </a>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card" style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
        <div className="set">
          <nav className="set-nav">
            <span className="label"><T zh="设置" en="Setup" /></span>
            {navItem('account', { zh: '身份', en: 'Identity' })}
            {navItem('audio', { zh: '语音与设备', en: 'Voice & devices' })}
            {navItem('hotkey', { zh: '快捷键', en: 'Hotkeys' })}
            {navItem('ban', { zh: '黑名单', en: 'Blocked' })}
          </nav>

          <div className="set-body">
            <button className="set-close" aria-label="关闭" onClick={onClose} title="Esc">×</button>

            {activeTab === 'account' && (
              <div className="set-panel">
                <h3><T zh="身份" en="Identity" /></h3>
                <p className="d"><T zh="别人看到的信息。UUID 是你的稳定标识--无需账号。" en="What others see. Your UUID is your stable handle - no account needed." /></p>
                <div className="fr">
                  <span className="l"><T zh="显示名" en="Display name" /></span>
                  <input
                    className="inp"
                    aria-label="显示名"
                    value={nickname}
                    onChange={(e) => {
                      setNickname(e.target.value);
                      localStorage.setItem('lvc_nickname', e.target.value);
                    }}
                  />
                </div>
                <div className="fr">
                  <span className="l"><T zh="你的 UUID" en="Your UUID" /></span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="inp mono" value={uuid} readOnly />
                    <button className="copybtn" onClick={() => navigator.clipboard.writeText(uuid)}><T zh="复制" en="Copy" /></button>
                  </div>
                </div>
                <div className="fr">
                  <span className="l"><T zh="外观" en="Appearance" /></span>
                  <div className="seg">
                    <button className={theme === 'dark' ? 'on' : ''} onClick={() => setTheme('dark')}>Dark</button>
                    <button className={theme === 'light' ? 'on' : ''} onClick={() => setTheme('light')}>Light</button>
                  </div>
                </div>
                <div className="fr">
                  <span className="l"><T zh="语言" en="Language" /></span>
                  <div className="seg">
                    <button className={lang === 'zh' ? 'on' : ''} onClick={() => setLang('zh')}>中文</button>
                    <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'audio' && (
              <div className="set-panel">
                <h3><T zh="语音与设备" en="Voice & devices" /></h3>
                <p className="d"><T zh="选你的设备和说话方式。" en="Pick your gear and how you talk." /></p>
                <div className="fr">
                  <span className="l"><T zh="输入" en="Input" /></span>
                  <select className="sel" value={selectedInputDevice} onChange={(e) => setSelectedInputDevice(e.target.value)}>
                    {audioInputDevices.length === 0 && <option value="">{lang === 'zh' ? '默认 - 系统麦克风' : 'Default - System Microphone'}</option>}
                    {audioInputDevices.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>{device.label || `Mic ${device.deviceId.slice(0, 6)}`}</option>
                    ))}
                  </select>
                </div>
                <div className="fr">
                  <span className="l"><T zh="输出" en="Output" /></span>
                  <select className="sel" value={selectedOutputDevice} onChange={(e) => setSelectedOutputDevice(e.target.value)}>
                    {audioOutputDevices.length === 0 && <option value="">{lang === 'zh' ? '默认 - 系统扬声器' : 'Default - System Speaker'}</option>}
                    {audioOutputDevices.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>{device.label || `Speaker ${device.deviceId.slice(0, 6)}`}</option>
                    ))}
                  </select>
                </div>
                <div className="fr">
                  <span className="l"><T zh="麦克风" en="Microphone" /></span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button className="btn sm primary" onClick={() => void startMicCapture()}><T zh="开始采集" en="Start capture" /></button>
                    <button className="btn sm ghost" onClick={stopMicCapture}><T zh="停止" en="Stop" /></button>
                    <span style={{ fontSize: 12, color: micCaptureState === 'capturing' ? 'var(--accent)' : micCaptureState === 'error' ? 'var(--danger)' : 'var(--muted)' }}>
                      {micCaptureState === 'capturing' ? (lang === 'zh' ? '采集中' : 'capturing') : micCaptureState === 'error' ? (lang === 'zh' ? '失败' : 'error') : (lang === 'zh' ? '未采集' : 'idle')}
                    </span>
                  </div>
                </div>
                {micError && <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>{micError}</p>}
                <div className="fr">
                  <span className="l"><T zh="通话模式" en="Talk mode" /></span>
                  <div className="seg">
                    <button className="on"><T zh="按键说话" en="Push-to-talk" /></button>
                    <button><T zh="语音活动" en="Voice activity" /></button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'hotkey' && (
              <div className="set-panel">
                <h3><T zh="快捷键" en="Hotkeys" /></h3>
                <p className="d"><T zh="全局快捷键，即使 Pivi 不在前台也生效。点击按键后按下想绑定的键（Esc 取消）。" en="Global shortcuts work even when Pivi isn't focused. Click a key, then press the combo (Esc to cancel)." /></p>
                <div className="hkr">
                  <div className="nm">
                    <T zh="按住说话" en="Push to talk" />
                    <small><T zh="按住时说话" en="Talk while held" /></small>
                  </div>
                  <div className="keys">
                    <button
                      className={`key g ${isRecordingHotkey === 'ptt' ? '' : ''}`}
                      aria-label="ptt-hotkey"
                      onClick={() => setIsRecordingHotkey((cur) => (cur === 'ptt' ? null : 'ptt'))}
                      style={{ minWidth: 48, textAlign: 'center' }}
                    >
                      {isRecordingHotkey === 'ptt' ? (lang === 'zh' ? '录制中…' : 'recording…') : hotkeys.ptt}
                    </button>
                  </div>
                </div>
                <div className="hkr">
                  <div className="nm">
                    <T zh="静音 / 取消静音" en="Mute / unmute" />
                    <small><T zh="切换麦克风" en="Toggle your mic" /></small>
                  </div>
                  <div className="keys">
                    <button
                      className="key g"
                      aria-label="mute-hotkey"
                      onClick={() => setIsRecordingHotkey((cur) => (cur === 'mute' ? null : 'mute'))}
                      style={{ minWidth: 48, textAlign: 'center' }}
                    >
                      {isRecordingHotkey === 'mute' ? (lang === 'zh' ? '录制中…' : 'recording…') : hotkeys.mute}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'ban' && (
              <div className="set-panel">
                <h3><T zh="黑名单" en="Blocked" /></h3>
                <p className="d"><T zh="被拉黑的 UUID 无法加入你建的房间。" en="Blocked UUIDs can't join rooms you host." /></p>
                <div className="blr">
                  <div>
                    <div className="id">uuid-2b8e1c40</div>
                    <div className="wh"><T zh="3 月 21 日拉黑" en="blocked Mar 21" /></div>
                  </div>
                  <button className="btn ghost sm" disabled={isUnbanned} onClick={() => setIsUnbanned(true)}>
                    {isUnbanned ? <T zh="已解封" en="Unblocked" /> : <T zh="解封" en="Unblock" />}
                  </button>
                </div>
                <div className="empty">
                  <T zh="没有其他人被拉黑。在房间里的成员卡片上右键可以拉黑。" en="No one else blocked. Right-click a member in-room to block them." />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
