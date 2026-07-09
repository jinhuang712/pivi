import React, { useState, useEffect, useRef } from 'react';
import { T } from '../providers';

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
  isCurrentUser?: boolean;
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
  isCurrentUser = false,
  onLocalMuteToggle,
  onVolumeChange,
  onServerMute,
  onKick,
  onBan,
  onTransferHost,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!isCurrentUserHost || member.isHost) return;
    e.preventDefault();
    setMenuOpen(true);
  };

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('contextmenu', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('contextmenu', handleClickOutside);
    };
  }, [menuOpen]);

  const dotClass = member.serverMuted || member.localMuted
    ? 'muted'
    : member.isSpeaking
      ? 'on'
      : '';

  return (
    <div className="m" onContextMenu={handleContextMenu}>
      <div className="m-row">
        <span className={`d ${dotClass}`} data-testid={`speaking-indicator-${member.id}`} />
        <span className="n">
          <span>{member.name}</span>
          {member.isHost && <span className="r"><T zh="房主" en="host" /></span>}
          {isCurrentUser && !member.isHost && <span className="r you"><T zh="你" en="you" /></span>}
        </span>
        {member.isSpeaking && !member.serverMuted && !member.localMuted && (
          <span className="sub"><T zh="说话中" en="speaking" /></span>
        )}
        {member.localMuted && (
          <span className="sub"><T zh="已本地静音" en="muted by you" /></span>
        )}
        {member.serverMuted && (
          <span className="sub"><T zh="被闭麦" en="server muted" /></span>
        )}
      </div>

      {!isCurrentUser && (
        <div className="m-x">
          <div className="vrow">
            <span className="lb"><T zh="本地音量" en="Volume" /></span>
            <button className="mute" onClick={() => onLocalMuteToggle?.(member.id)}>
              {member.localMuted ? <T zh="取消静音" en="unmute" /> : <T zh="静音" en="mute" />}
            </button>
          </div>
          <input
            type="range"
            className="vol"
            min="0"
            max="200"
            value={member.volume}
            onChange={(e) => onVolumeChange?.(member.id, parseInt(e.target.value, 10))}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {menuOpen && (
        <div className="ctx" ref={menuRef}>
          <div className="ctx-h"><T zh="成员操作" en="Member actions" /></div>
          <div className="ctx-it" onClick={() => { onTransferHost?.(member.id); setMenuOpen(false); }}>
            <span><T zh="移交房主" en="Transfer host" /></span><span className="hk">⇧↵</span>
          </div>
          <div className="ctx-it" onClick={() => { onServerMute?.(member.id); setMenuOpen(false); }}>
            <span><T zh="全员闭麦" en="Mute for everyone" /></span><span className="hk">M</span>
          </div>
          <div className="ctx-sep" />
          <div className="ctx-it danger" onClick={() => { onKick?.(member.id); setMenuOpen(false); }}>
            <span><T zh="踢出" en="Kick" /></span><span className="hk">K</span>
          </div>
          <div className="ctx-it danger" onClick={() => { onBan?.(member.id); setMenuOpen(false); }}>
            <span><T zh="拉黑" en="Block" /></span><span className="hk">B</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default MemberItem;
