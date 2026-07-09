import React from 'react';
import type { RoomNetworkPath } from '../types/channel';
import { T } from '../providers';

interface ConfirmJoinModalProps {
  isOpen: boolean;
  roomName: string;
  onlineCount: number;
  hostName: string;
  networkPath?: RoomNetworkPath;
  resolutionNotice?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmJoinModal: React.FC<ConfirmJoinModalProps> = ({
  isOpen,
  roomName,
  onlineCount,
  hostName,
  networkPath = 'p2p',
  resolutionNotice,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="card" onClick={(e) => e.stopPropagation()}>
        <div className="confirm">
          <h2><T zh="加入这个房间？" en="Join this room?" /></h2>
          <div className="dl">
            <div className="dr">
              <span className="k"><T zh="房间" en="Room" /></span>
              <span className="v">{roomName}</span>
            </div>
            <div className="dr">
              <span className="k"><T zh="房主" en="Host" /></span>
              <span className="v">{hostName} <span className="host"><T zh="房主" en="host" /></span></span>
            </div>
            <div className="dr">
              <span className="k"><T zh="在线" en="Online" /></span>
              <span className="v">{onlineCount}</span>
            </div>
          </div>
          <p className="path-note">
            <b>{networkPath === 'relay'
              ? <T zh="将经房主中转加入。" en="Joining via host relay." />
              : <T zh="可建立直连。" en="Direct connection available." />
            }</b>{' '}
            {resolutionNotice ? <span>{resolutionNotice}</span> : null}
            {!resolutionNotice && (
              <span><T zh="若直连失败，Pivi 自动回退到房主中转。" en="If the direct path fails, Pivi switches to host relay automatically." /></span>
            )}
          </p>
          <div className="confirm-foot">
            <button className="btn ghost" onClick={onCancel}><T zh="取消" en="Cancel" /></button>
            <button className="btn primary" onClick={onConfirm}><T zh="加入" en="Join" /></button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmJoinModal;
