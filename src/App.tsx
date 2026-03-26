import { useMemo, useState } from "react";
import "./App.css";
import Sidebar from "./components/Sidebar";
import CodeInput from "./components/CodeInput";
import ConfirmJoinModal from "./components/ConfirmJoinModal";
import SettingsModal from "./components/SettingsModal";
import MainArea from "./components/MainArea";
import {
  generateInviteCode,
  getCurrentInviteExpirySlot,
  normalizeInviteCode,
  parseInviteCode,
  prettifyInviteCode,
  type InviteCodePayload,
} from "./lib/inviteCode";
import type { JoinPreview, RoomMember, RoomSnapshot, ChatMessage } from "./types/channel";

const ROOM_REGISTRY_KEY = 'lvc_room_registry_v1';

const readRoomRegistry = (): RoomSnapshot[] => {
  try {
    const raw = localStorage.getItem(ROOM_REGISTRY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RoomSnapshot[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
};

const writeRoomRegistry = (rooms: RoomSnapshot[]) => {
  localStorage.setItem(ROOM_REGISTRY_KEY, JSON.stringify(rooms));
};

const makeMemberId = () => `uuid-${crypto.randomUUID().slice(0, 8)}`;

const buildMockInvitePayload = (): InviteCodePayload => {
  const lastOctet = 20 + Math.floor(Math.random() * 180);
  const port = 7000 + Math.floor(Math.random() * 1000);
  const expirySlot = (getCurrentInviteExpirySlot() + 12) % 1024;

  return {
    endpointScope: "private-lan-ipv4",
    joinMode: "direct-host",
    ipv4: `192.168.31.${lastOctet}`,
    port,
    expirySlot,
  };
};

function App() {
  const [appState, setAppState] = useState<'join' | 'preparing' | 'confirm' | 'channel'>('join');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [prepareHint, setPrepareHint] = useState('正在启动房主运行时...');
  const [pendingJoin, setPendingJoin] = useState<JoinPreview | null>(null);
  const [roomName, setRoomName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const currentUserName = useMemo(
    () => localStorage.getItem('lvc_nickname') || 'HuangJin',
    [],
  );
  const currentUserId = useMemo(() => {
    const existing = localStorage.getItem('lvc_user_id');
    if (existing) return existing;
    const created = makeMemberId();
    localStorage.setItem('lvc_user_id', created);
    return created;
  }, []);

  const currentUserIsHost = members.find((m) => m.id === currentUserId)?.isHost ?? false;

  const handleCreateRoom = async () => {
    setJoinError('');
    setPrepareHint('正在启动房主运行时...');
    setAppState('preparing');

    try {
      const payload = buildMockInvitePayload();
      const rawInviteCode = await generateInviteCode(payload);
      setPrepareHint('正在校验邀请码可用性...');
      const formattedInviteCode = await prettifyInviteCode(rawInviteCode);
      await parseInviteCode(formattedInviteCode, payload.expirySlot);
      setPrepareHint('正在同步房间信息...');
      const newRoomName = `${currentUserName} 的房间`;
      const roomEntry: RoomSnapshot = {
        inviteCode: formattedInviteCode,
        roomName: newRoomName,
        hostName: currentUserName,
      };
      const registry = readRoomRegistry();
      writeRoomRegistry(
        [roomEntry, ...registry.filter((room) => normalizeInviteCode(room.inviteCode) !== rawInviteCode)].slice(0, 20),
      );
      setInviteCode(formattedInviteCode);
      setRoomName(newRoomName);
      setJoinError('');
      setMembers([
        {
          id: currentUserId,
          name: currentUserName,
          isHost: true,
          isSpeaking: false,
          localMuted: false,
          serverMuted: false,
          volume: 100,
        },
      ]);
      setMessages([]);
      setAppState('channel');
    } catch {
      setAppState('join');
      setJoinError('邀请码生成失败，请稍后重试。');
    }
  };

  const handleCodeComplete = async (code: string) => {
    try {
      const formattedInviteCode = await prettifyInviteCode(code);
      await parseInviteCode(formattedInviteCode);
      const registry = readRoomRegistry();
      const matched = registry.find(
        (room) => normalizeInviteCode(room.inviteCode) === normalizeInviteCode(formattedInviteCode),
      );
      if (!matched) {
        setJoinError('未找到该邀请码对应的房间，请先创建房间或确认输入无误。');
        setPendingJoin(null);
        return;
      }
      setInviteCode(matched.inviteCode);
      setRoomName(matched.roomName);
      setPendingJoin({
        roomName: matched.roomName,
        hostName: matched.hostName,
        onlineCount: 1,
      });
      setJoinError('');
      setAppState('confirm');
    } catch {
      setJoinError('邀请码无效或已过期，请确认输入无误。');
      setPendingJoin(null);
    }
  };

  const handleConfirmJoin = () => {
    const hostName = pendingJoin?.hostName || 'Host';
    setMembers([
      {
        id: 'host-runtime',
        name: hostName,
        isHost: true,
        isSpeaking: false,
        localMuted: false,
        serverMuted: false,
        volume: 100,
      },
      {
        id: currentUserId,
        name: currentUserName,
        isHost: false,
        isSpeaking: false,
        localMuted: false,
        serverMuted: false,
        volume: 100,
      },
    ]);
    setMessages([]);
    setAppState('channel');
  };

  return (
    <div className="h-screen w-screen flex overflow-hidden font-sans bg-[#1e1f22] text-[#f3f4f6]">
      {appState === 'join' && (
        <div className="flex-1 flex justify-center items-center">
          <div className="bg-[#313338] p-8 rounded-xl shadow-2xl w-[480px] flex flex-col items-center text-center">
            <h2 className="text-2xl font-bold mb-2">加入语音频道</h2>
            <p className="text-gray-400 text-sm mb-8">请输入 16 位邀请码</p>
            <CodeInput onComplete={handleCodeComplete} />
            {joinError && <p className="text-red-400 text-sm mt-4">{joinError}</p>}
            <div className="w-full flex justify-between items-center mt-8">
              <button 
                onClick={handleCreateRoom} 
                className="text-sm text-indigo-400 hover:underline"
              >
                创建新房间
              </button>
            </div>
          </div>
        </div>
      )}

      {appState === 'preparing' && (
        <div className="flex-1 flex justify-center items-center">
          <div className="bg-[#313338] p-8 rounded-xl shadow-2xl w-[480px] flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full border-4 border-indigo-400/30 border-t-indigo-400 animate-spin mb-6" />
            <h2 className="text-2xl font-bold mb-2">正在准备房间</h2>
            <p className="text-gray-400 text-sm">{prepareHint}</p>
          </div>
        </div>
      )}

      {appState === 'channel' && (
        <>
          <Sidebar
            roomName={roomName}
            inviteCode={inviteCode}
            currentUserName={currentUserName}
            members={members}
            isCurrentUserHost={currentUserIsHost}
            onRegenerateInviteCode={handleCreateRoom}
            onLocalMuteToggle={(id: string) => {
              setMembers((prev) =>
                prev.map((member) => (member.id === id ? { ...member, localMuted: !member.localMuted } : member)),
              );
            }}
            onVolumeChange={(id: string, volume: number) => {
              setMembers((prev) => prev.map((member) => (member.id === id ? { ...member, volume } : member)));
            }}
          />
          <MainArea
            onOpenSettings={() => setIsSettingsOpen(true)}
            currentUserName={currentUserName}
            messages={messages}
            onSendMessage={(content: string) => {
              const newMessage: ChatMessage = {
                id: Date.now().toString(),
                sender: currentUserName,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                content,
                isSelf: true,
              };
              setMessages((prev) => [...prev, newMessage]);
            }}
          />
        </>
      )}

      <ConfirmJoinModal 
        isOpen={appState === 'confirm'}
        roomName={pendingJoin?.roomName || roomName}
        onlineCount={pendingJoin?.onlineCount || 1}
        hostName={pendingJoin?.hostName || 'Host'}
        onCancel={() => setAppState('join')}
        onConfirm={handleConfirmJoin}
      />

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />
    </div>
  );
}

export default App;
