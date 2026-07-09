import React, { useEffect, useRef, useState } from 'react';
import type { RoomNetworkPath } from '../types/channel';
import type { ChatMessage } from '../types/channel';
import { T, useLang } from '../providers';
import { MAX_IMAGE_BYTES } from '../media/fileTransfer';

interface MainAreaProps {
  onOpenSettings?: () => void;
  onLeave?: () => void;
  isMicMuted?: boolean;
  onToggleMic?: () => void;
  isScreenSharing?: boolean;
  onStartShare?: (opts: { quality: string; includeSystemAudio: boolean }) => void;
  onStopShare?: () => void;
  localScreenStream?: MediaStream | null;
  remoteScreenStream?: MediaStream | null;
  onSendImage?: (file: File) => void;
  currentUserName: string;
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  networkPath?: RoomNetworkPath;
  networkNotice?: string;
}

const Icons = {
  mic: <svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>,
  micOff: <svg viewBox="0 0 24 24"><path d="M9 9v2a3 3 0 0 0 5 2M15 9.3V5a3 3 0 0 0-5.7-1.3M19 11a7 7 0 0 1-.5 2.6M12 18v3M3 3l18 18" /></svg>,
  sound: <svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M16 8a5 5 0 0 1 0 8" /></svg>,
  share: <svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8" /></svg>,
  setup: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></svg>,
  leave: <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></svg>,
};

const MainArea: React.FC<MainAreaProps> = ({
  onOpenSettings,
  onLeave,
  isMicMuted: isMicMutedProp,
  onToggleMic,
  isScreenSharing,
  onStartShare,
  onStopShare,
  localScreenStream,
  remoteScreenStream,
  onSendImage,
  currentUserName,
  messages,
  onSendMessage,
  networkPath = 'p2p',
  networkNotice,
}) => {
  const { lang } = useLang();
  const [showStartPanel, setShowStartPanel] = useState(false);
  const [quality, setQuality] = useState<'1080' | '720' | '480'>('1080');
  const [shareAudio, setShareAudio] = useState(true);
  const [internalMicMuted, setInternalMicMuted] = useState(false);
  const [internalSharing, setInternalSharing] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [showError, setShowError] = useState(false);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const viewerVideoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isMicMuted = isMicMutedProp ?? internalMicMuted;
  const isSharing = isScreenSharing ?? internalSharing;

  const handleMicToggle = () => {
    if (onToggleMic) {
      onToggleMic();
      return;
    }
    setInternalMicMuted((v) => !v);
  };

  const isRelay = networkPath === 'relay';
  const qhints = {
    zh: { '1080': '1080p · 最清晰，带宽占用最高。', '720': '720p · 均衡，多数房间默认。', '480': '480p · 最省，慢链路首选。' },
    en: { '1080': '1080p · sharpest. Most bandwidth.', '720': '720p · balanced. Good default.', '480': '480p · lightest. Slow links.' },
  };
  const qualityPreset = quality === '1080' ? '1080p' : '720p';

  const handleSend = () => {
    if (!inputValue.trim()) return;
    onSendMessage(inputValue.trim());
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSend();
  };

  const handleSimulateUploadError = () => {
    setShowError(true);
    setTimeout(() => setShowError(false), 3000);
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) {
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setShowError(true);
      setTimeout(() => setShowError(false), 3000);
      return;
    }
    onSendImage?.(file);
  };

  const handleStartShare = () => {
    setShowStartPanel(false);
    const opts = { quality: qualityPreset, includeSystemAudio: shareAudio };
    if (onStartShare) {
      onStartShare(opts);
    } else {
      setInternalSharing(true);
    }
  };

  const handleStopShare = () => {
    setShowStartPanel(false);
    if (onStopShare) {
      onStopShare();
    } else {
      setInternalSharing(false);
    }
  };

  useEffect(() => {
    if (pipVideoRef.current && localScreenStream) {
      pipVideoRef.current.srcObject = localScreenStream;
    }
  }, [localScreenStream, isSharing]);

  useEffect(() => {
    if (viewerVideoRef.current && remoteScreenStream) {
      viewerVideoRef.current.srcObject = remoteScreenStream;
    }
  }, [remoteScreenStream]);

  return (
    <main className="main">
      <div className="topbar">
        <div className="conn">
          <span className={`tick ${isRelay ? 'relay' : ''}`} />
          <span>{isRelay ? <T zh="经房主中转" en="Via host" /> : <T zh="直连" en="Direct" />}</span>
          {networkNotice && <span className="p">· {networkNotice}</span>}
        </div>
        {isSharing && (
          <div className="share-ind">
            <span className="ld" />
            <span><T zh="你在共享" en="You're sharing" /></span>
            <span className="q">{quality}p</span>
          </div>
        )}
      </div>

      {remoteScreenStream && (
        <div style={{ padding: '12px 20px 0' }}>
          <video
            data-testid="remote-screen"
            ref={viewerVideoRef}
            autoPlay
            playsInline
            style={{ width: '100%', maxHeight: '55vh', background: '#000', borderRadius: 'var(--r)', display: 'block' }}
          />
        </div>
      )}

      <div className="chat">
        {messages.length === 0 && (
          <div className="msg-empty">
            <T zh="暂无消息，发送第一条开始聊天。" en="No messages yet. Send the first one." />
          </div>
        )}
        {messages.map((msg) => (
          <div className="msg" key={msg.id}>
            <div className="mh">
              <span className="ts">{msg.time}</span>
              <span className={`sn ${msg.isSelf ? 'me' : ''}`}>{msg.isSelf ? currentUserName : msg.sender}</span>
            </div>
            <div className="bd">
              {msg.imageUrl ? (
                <a href={msg.imageUrl} download={msg.fileName} target="_blank" rel="noreferrer">
                  <img
                    data-testid="chat-image"
                    src={msg.imageUrl}
                    alt={msg.fileName ?? 'image'}
                    style={{ maxWidth: 220, maxHeight: 220, borderRadius: 4, display: 'block' }}
                  />
                </a>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="composer">
        <div className="f">
          <button
            onClick={() => (onSendImage ? fileInputRef.current?.click() : handleSimulateUploadError())}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '16px', padding: '0 4px' }}
            title={lang === 'zh' ? '上传图片/文件' : 'Upload image / file'}
          >
            +
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFilePick}
            style={{ display: 'none' }}
          />
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={lang === 'zh' ? '给房间发消息（支持粘贴截图）' : 'Message the room (paste an image)'}
          />
          <span className="lim">5 MB</span>
        </div>
        {showError && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>
            <T zh="图片大小不能超过 5MB" en="Image can't exceed 5 MB" />
          </div>
        )}
      </div>

      <div className="controls">
        <button
          className={`ctl ${isMicMuted ? 'off' : 'on'}`}
          onClick={handleMicToggle}
          aria-label="Microphone"
        >
          <span className="ic">{isMicMuted ? Icons.micOff : Icons.mic}</span>
          <span className="lb"><T zh="麦克风" en="Mic" /></span>
        </button>
        <button
          className={`ctl ${isSpeakerMuted ? 'off' : 'on'}`}
          onClick={() => setIsSpeakerMuted((v) => !v)}
          aria-label="Speakers"
        >
          <span className="ic">{Icons.sound}</span>
          <span className="lb"><T zh="音量" en="Sound" /></span>
        </button>
        <div style={{ position: 'relative' }}>
          <button
            className={`ctl ${isSharing ? 'on' : ''}`}
            onClick={() => (isSharing ? handleStopShare() : setShowStartPanel((v) => !v))}
            aria-label="Screen share"
          >
            <span className="ic">{Icons.share}</span>
            <span className="lb">{isSharing ? <T zh="共享中" en="Sharing" /> : <T zh="共享" en="Share" />}</span>
          </button>
          {showStartPanel && !isSharing && (
            <div className="ctl-pop">
              <div className="panel">
                <h2><T zh="共享你的屏幕" en="Share your screen" /></h2>
                <p className="sub"><T zh="房间里的每个人都会点对点看到你选的内容。" en="Everyone sees what you pick, peer-to-peer." /></p>
                <div className="qrow">
                  <div className="ql"><T zh="画质" en="Quality" /></div>
                  <div className="seg">
                    {(['1080', '720', '480'] as const).map((q) => (
                      <button key={q} className={quality === q ? 'on' : ''} onClick={() => setQuality(q)}>{q}p</button>
                    ))}
                  </div>
                  <div className="qhint">{qhints[lang][quality]}</div>
                </div>
                <div className="audrow">
                  <div className="nm">
                    <T zh="共享电脑音频" en="Share computer audio" />
                    <small><T zh="听众能听到你的系统声音" en="Listeners hear your system sound" /></small>
                  </div>
                  <button className={`switch ${shareAudio ? 'on' : ''}`} onClick={() => setShareAudio((v) => !v)} aria-label="Share audio" />
                </div>
                <p className="note">
                  <T zh="继续后，系统会问你选哪块屏幕或窗口。" en="When you continue, your system asks which screen or window." />
                </p>
                <div className="panel-foot">
                  <button className="btn ghost" onClick={() => setShowStartPanel(false)}><T zh="取消" en="Cancel" /></button>
                  <button className="btn primary" onClick={handleStartShare}><T zh="开始共享" en="Start sharing" /></button>
                </div>
              </div>
            </div>
          )}
        </div>
        <button className="ctl" onClick={onOpenSettings} aria-label="Settings">
          <span className="ic">{Icons.setup}</span>
          <span className="lb"><T zh="设置" en="Setup" /></span>
        </button>
        <button className="ctl leave" onClick={onLeave} aria-label="Leave">
          <span className="ic">{Icons.leave}</span>
          <span className="lb"><T zh="离开" en="Leave" /></span>
        </button>
      </div>

      {/* presenter self-view PiP */}
      {isSharing && (
        <div className="pip">
          <div className="pip-frame">
            <span className="live-tag">● live</span>
            {localScreenStream ? (
              <video
                ref={pipVideoRef}
                autoPlay
                muted
                playsInline
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 11 }}>
                <T zh="你的屏幕" en="your screen" />
              </div>
            )}
          </div>
          <div className="pip-label">
            <span />
            <span><T zh="你的共享屏幕" en="Your shared screen" /></span>
            <button className="stop" onClick={handleStopShare}><T zh="停止" en="Stop" /></button>
          </div>
        </div>
      )}
    </main>
  );
};

export default MainArea;
