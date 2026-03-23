import React from 'react';

interface ConfirmJoinModalProps {
  isOpen: boolean;
  roomName: string;
  onlineCount: number;
  hostName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmJoinModal: React.FC<ConfirmJoinModalProps> = ({
  isOpen,
  roomName,
  onlineCount,
  hostName,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex justify-center items-center">
      <div className="bg-[#313338] p-6 rounded-lg shadow-2xl w-[400px] text-center border border-gray-700">
        <div className="w-16 h-16 bg-indigo-500 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
          🎮
        </div>
        <h2 className="text-xl font-bold mb-2 text-white">是否加入房间？</h2>
        <p className="text-indigo-400 font-bold text-lg mb-1">「{roomName}」</p>
        <p className="text-gray-400 text-sm mb-6">
          当前在线：{onlineCount} 人 | 房主：{hostName}
        </p>

        <div className="flex space-x-4">
          <button
            onClick={onCancel}
            className="flex-1 py-2 bg-transparent border border-gray-600 hover:bg-gray-700 text-white font-medium rounded-md transition-colors"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-medium rounded-md transition-colors"
          >
            确认加入
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmJoinModal;
