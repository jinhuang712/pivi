import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import Sidebar from "./components/Sidebar";
import CodeInput from "./components/CodeInput";
import ConfirmJoinModal from "./components/ConfirmJoinModal";
import SettingsModal from "./components/SettingsModal";
import MainArea from "./components/MainArea";
import { ThemeProvider, LangProvider, Toggles, T } from "./providers";
import {
  getCurrentInviteExpirySlot,
  getPreferredLocalIpv4,
  normalizeInviteCode,
  parseInviteCode,
  prepareRoomInvite,
} from "./lib/inviteCode";
import { JoinRoomResolutionError, resolveJoinRoom } from "./lib/joinRoom";
import { createControlSession } from "./lib/controlSession";
import { createWebRtcSession } from "./media/webrtcSession";
import { useLocalAudio } from "./media/useLocalAudio";
import { useHotkeys } from "./media/useHotkeys";
import { useScreenShare } from "./media/useScreenShare";
import type { ShareQualityPreset } from "./media/screenShare";
import { IncomingFileAssembler, canSendImage, splitIntoChunks, type FileMetaFrame } from "./media/fileTransfer";
import { SpeakingMonitor } from "./media/speakingDetector";
import { RelayFallbackEngine, type IceConnectionStateLike } from "./media/relayFallback";
import { AudioControlEngine } from "./media/audioControl";
import { loadHotkeys } from "./lib/hotkeySettings";
import { appendRuntimeLog, buildRuntimeDiagnosticsText } from "./lib/runtimeLog";
import {
  banHostRuntimeMember,
  banRemoteRuntimeMember,
  getHostRuntimeRoomEvents,
  getHostRuntimeRoomState,
  getRemoteHostRuntimeRoomEvents,
  getRemoteHostRuntimeRoomState,
  joinRemoteHostRuntimeSession,
  kickHostRuntimeMember,
  kickRemoteRuntimeMember,
  relayHostRuntimeSignal,
  relayRemoteRuntimeSignal,
  serverMuteHostRuntimeMember,
  serverMuteRemoteRuntimeMember,
  startHostRuntimeSession,
  transferHostRemoteRuntimeMember,
  transferHostRuntimeMember,
} from "./lib/runtimeSession";
import type { JoinPreview, RoomMember, ChatMessage, RoomNetworkPath } from "./types/channel";
import type { ControlRuntimeMessage, MemberSnapshot, RoomBroadcastMessage, WebRtcSignalMessage } from "./types/runtimeSession";

const makeMemberId = () => `uuid-${crypto.randomUUID().slice(0, 8)}`;

const buildInviteEndpoint = async () => {
  const expirySlot = (getCurrentInviteExpirySlot() + 12) % 1024;

  return {
    ipv4: await getPreferredLocalIpv4(),
    expirySlot,
  };
};

const toRoomMember = (member: MemberSnapshot): RoomMember => ({
  id: member.memberId,
  name: member.displayName,
  isHost: member.role === 'Host',
  isSpeaking: false,
  localMuted: false,
  serverMuted: member.serverMuted,
  volume: 100,
});

const toRoomMembers = (roomState: RoomBroadcastMessage) =>
  roomState.type === 'RoomState' ? roomState.payload.members.map(toRoomMember) : [];

const deriveHostDisplayName = (roomState: RoomBroadcastMessage) => {
  if (roomState.type !== 'RoomState') {
    return 'Host';
  }

  return roomState.payload.members.find((member) => member.role === 'Host')?.displayName ?? 'Host';
};

const deriveRoomName = (roomState: RoomBroadcastMessage) => `${deriveHostDisplayName(roomState)} 的房间`;

function AppShell() {
  const [appState, setAppState] = useState<'join' | 'preparing' | 'confirm' | 'channel'>('join');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [prepareHint, setPrepareHint] = useState('正在启动房主运行时...');
  const [pendingJoin, setPendingJoin] = useState<JoinPreview | null>(null);
  const [roomName, setRoomName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [activeRoomId, setActiveRoomId] = useState('');
  const [activeRemoteEndpoint, setActiveRemoteEndpoint] = useState<{ host: string; port: number } | null>(null);
  const [activeRoomStartSequence, setActiveRoomStartSequence] = useState(0);
  const [networkPath, setNetworkPath] = useState<RoomNetworkPath>('p2p');
  const [networkNotice, setNetworkNotice] = useState('');
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

  const localAudio = useLocalAudio(appState === 'channel');
  const audioEngineRef = useRef<AudioControlEngine | null>(null);
  if (!audioEngineRef.current) {
    audioEngineRef.current = new AudioControlEngine();
  }

  const [hotkeys, setHotkeys] = useState(loadHotkeys);
  useHotkeys({
    ptt: hotkeys.ptt,
    mute: hotkeys.mute,
    active: appState === 'channel',
    onPttDown: () => localAudio.setMuted(false),
    onPttUp: () => localAudio.setMuted(true),
    onMuteToggle: localAudio.toggleMute,
  });

  const screenShare = useScreenShare();
  const [remoteScreen, setRemoteScreen] = useState<MediaStream | null>(null);

  const currentUserIsHost = members.find((m) => m.id === currentUserId)?.isHost ?? false;
  const controlSessionRef = useRef<ReturnType<typeof createControlSession> | null>(null);
  const peerSessionsRef = useRef(new Map<string, ReturnType<typeof createWebRtcSession>>());
  const activeRoomIdRef = useRef('');
  const activeRemoteEndpointRef = useRef<{ host: string; port: number } | null>(null);
  const fileEntriesRef = useRef(
    new Map<string, { assembler: IncomingFileAssembler; currentFileId: string | null; meta: FileMetaFrame | null }>(),
  );
  const membersRef = useRef<RoomMember[]>([]);
  membersRef.current = members;
  const speakingMonitorsRef = useRef(new Map<string, SpeakingMonitor>());
  const selfMonitorRef = useRef<SpeakingMonitor | null>(null);
  // Per-peer relay-fallback state. The engine decides stay_p2p / switch_to_relay
  // / close_session from ICE state; we retry ICE once before declaring relay.
  const relayEnginesRef = useRef(new Map<string, RelayFallbackEngine>());
  const relayRetriedPeersRef = useRef(new Set<string>());
  const relayActivePeersRef = useRef(new Set<string>());
  const setMemberSpeaking = (memberId: string, speaking: boolean) => {
    setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, isSpeaking: speaking } : m)));
  };
  const refreshNetworkPath = () => {
    if (relayActivePeersRef.current.size > 0) {
      setNetworkPath('relay');
    } else {
      setNetworkPath('p2p');
      setNetworkNotice('');
    }
  };

  useEffect(() => {
    activeRoomIdRef.current = activeRoomId;
  }, [activeRoomId]);

  useEffect(() => {
    activeRemoteEndpointRef.current = activeRemoteEndpoint;
  }, [activeRemoteEndpoint]);

  useEffect(() => {
    return () => {
      peerSessionsRef.current.forEach((session) => session.close());
      peerSessionsRef.current.clear();
    };
  }, []);

  const sendWebRtcSignal = async (
    peerId: string,
    signalType: WebRtcSignalMessage['payload']['signalType'],
    payload: string,
  ) => {
    const roomId = activeRoomIdRef.current;
    if (!roomId) {
      return;
    }

    const remoteEndpoint = activeRemoteEndpointRef.current;
    if (remoteEndpoint) {
      await relayRemoteRuntimeSignal({
        ipv4: remoteEndpoint.host,
        port: remoteEndpoint.port,
        roomId,
        from: currentUserId,
        target: peerId,
        signalType,
        payload,
      });
      return;
    }

    await relayHostRuntimeSignal({
      roomId,
      from: currentUserId,
      target: peerId,
      signalType,
      payload,
    });
  };

  const appendImageMessage = (senderId: string, imageUrl: string, fileName: string) => {
    const senderName = membersRef.current.find((m) => m.id === senderId)?.name ?? senderId;
    const imageMessage: ChatMessage = {
      id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sender: senderName,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      content: fileName,
      isSelf: false,
      imageUrl,
      fileName,
    };
    setMessages((prev) => [...prev, imageMessage]);
  };

  const handleIncomingData = (data: string | ArrayBuffer, senderId: string) => {
    // hub-and-spoke mesh: the host relays everything (chat, FILE_META, binary
    // chunks) to every other peer so joiners with no direct channel still
    // receive shared images.
    if (!activeRemoteEndpointRef.current) {
      peerSessionsRef.current.forEach((session, pid) => {
        if (pid !== senderId) {
          session.sendRaw(data);
        }
      });
    }

    if (typeof data !== 'string') {
      // binary chunk -> assemble into the current incoming file
      const entry = fileEntriesRef.current.get(senderId);
      if (entry?.currentFileId) {
        const result = entry.assembler.pushChunk(entry.currentFileId, data);
        if (result.done && result.blob) {
          const url = URL.createObjectURL(result.blob);
          const fileName = entry.meta?.fileName ?? 'image';
          entry.currentFileId = null;
          entry.meta = null;
          appendImageMessage(senderId, url, fileName);
        }
      }
      return;
    }

    let parsed: { type?: string; id?: string; content?: string };
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }

    if (parsed.type === 'FILE_META') {
      const meta = parsed as unknown as FileMetaFrame;
      const entry = fileEntriesRef.current.get(senderId) ?? {
        assembler: new IncomingFileAssembler(),
        currentFileId: null as string | null,
        meta: null as FileMetaFrame | null,
      };
      entry.assembler.registerMeta(meta);
      entry.currentFileId = meta.fileId;
      entry.meta = meta;
      fileEntriesRef.current.set(senderId, entry);
      return;
    }

    if (parsed.id && typeof parsed.content === 'string') {
      const message = parsed as unknown as ChatMessage;
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) {
          return prev;
        }
        return [...prev, { ...message, isSelf: false }];
      });
    }
  };

  const cleanupPeerSession = (peerId: string) => {
    audioEngineRef.current?.unbindRemoteStream(peerId);
    speakingMonitorsRef.current.get(peerId)?.stop();
    speakingMonitorsRef.current.delete(peerId);
    peerSessionsRef.current.get(peerId)?.close();
    peerSessionsRef.current.delete(peerId);
    relayEnginesRef.current.delete(peerId);
    relayRetriedPeersRef.current.delete(peerId);
    if (relayActivePeersRef.current.delete(peerId)) {
      refreshNetworkPath();
    }
    setMembers((prev) => prev.filter((m) => m.id !== peerId));
  };

  // Runtime relay fallback: feed each peer's ICE state through the engine. On
  // failure we retry ICE once (per the NAT strategy: "ICE 协商超时：自动切换
  // 中转并重试一次"); if that also fails we declare relay mode and surface it.
  const handleIceState = (peerId: string, state: string, checkingElapsedMs: number) => {
    let engine = relayEnginesRef.current.get(peerId);
    if (!engine) {
      engine = new RelayFallbackEngine();
      relayEnginesRef.current.set(peerId, engine);
    }

    // A (re)established link clears any relay state for this peer.
    if (state === 'connected' || state === 'completed') {
      engine.clearPeer(peerId);
      relayRetriedPeersRef.current.delete(peerId);
      if (relayActivePeersRef.current.delete(peerId)) {
        refreshNetworkPath();
      }
      return;
    }

    const decision = engine.processIceState({
      peerId,
      iceState: state as IceConnectionStateLike,
      checkingElapsedMs,
    });
    if (decision === 'switch_to_relay') {
      if (!relayRetriedPeersRef.current.has(peerId)) {
        relayRetriedPeersRef.current.add(peerId);
        appendRuntimeLog('warn', 'relay', `与成员 ${peerId} 的直连建立失败，尝试 ICE 重启`);
        void peerSessionsRef.current.get(peerId)?.restartIce();
        return;
      }
      relayActivePeersRef.current.add(peerId);
      setNetworkPath('relay');
      setNetworkNotice('通话中直连不可达，已切换中转模式。');
      appendRuntimeLog('warn', 'relay', `与成员 ${peerId} ICE 重启后仍失败，已切换中转模式`);
    } else if (decision === 'close_session') {
      appendRuntimeLog('info', 'relay', `与成员 ${peerId} 的连接已关闭`);
      cleanupPeerSession(peerId);
    }
  };

  const ensurePeerSession = (peerId: string) => {
    const existing = peerSessionsRef.current.get(peerId);
    if (existing) {
      return existing;
    }

    const session = createWebRtcSession({
      selfId: currentUserId,
      peerId,
      roomId: activeRoomIdRef.current,
      localStream: localAudio.stream ?? undefined,
      onRemoteStream: (stream) => {
        audioEngineRef.current?.bindRemoteStream(peerId, stream);
        const monitor = new SpeakingMonitor((speaking) => setMemberSpeaking(peerId, speaking));
        if (monitor.start(stream)) {
          speakingMonitorsRef.current.set(peerId, monitor);
        }
        appendRuntimeLog('info', 'audio', `已绑定远端音频流: ${peerId}`);
      },
      onRemoteScreen: (stream) => {
        setRemoteScreen(stream);
        appendRuntimeLog('info', 'screen', `收到远端屏幕共享: ${peerId}`);
      },
      onDataMessage: (data) => {
        handleIncomingData(data, peerId);
      },
      sendSignal: async ({ target, signalType, payload }) => {
        await sendWebRtcSignal(target, signalType, payload);
      },
      onSignalApplied: (signalType) => {
        appendRuntimeLog('info', 'webrtc-session', `已处理 ${signalType} 信令，对端=${peerId}`);
      },
      onIceStateChange: (state, checkingElapsedMs) => {
        handleIceState(peerId, state, checkingElapsedMs);
      },
    });
    peerSessionsRef.current.set(peerId, session);
    return session;
  };

  const applyRuntimeEvent = (message: ControlRuntimeMessage) => {
    if (message.type === 'WebRtcSignal') {
      appendRuntimeLog(
        'info',
        'runtime-signal',
        `收到 ${message.payload.signalType} 信令: ${message.payload.from} -> ${message.payload.target}`,
      );
      void ensurePeerSession(message.payload.from).handleSignal(message);
      return;
    }

    if (message.type !== 'RoomBroadcast') {
      return;
    }

    const broadcast = message.payload;
    if (broadcast.type === 'RoomState') {
      setMembers(broadcast.payload.members.map(toRoomMember));
      setRoomName(deriveRoomName(broadcast));
      const activePeerIds = new Set(
        broadcast.payload.members
          .filter((member) => member.memberId !== currentUserId)
          .map((member) => member.memberId),
      );
      peerSessionsRef.current.forEach((session, peerId) => {
        if (!activePeerIds.has(peerId)) {
          audioEngineRef.current?.unbindRemoteStream(peerId);
          speakingMonitorsRef.current.get(peerId)?.stop();
          speakingMonitorsRef.current.delete(peerId);
          relayEnginesRef.current.delete(peerId);
          relayRetriedPeersRef.current.delete(peerId);
          relayActivePeersRef.current.delete(peerId);
          session.close();
          peerSessionsRef.current.delete(peerId);
        }
      });
      refreshNetworkPath();
      return;
    }

    if (broadcast.type === 'MemberJoined') {
      setMembers((prev) => {
        if (prev.some((member) => member.id === broadcast.payload.member.memberId)) {
          return prev;
        }

        return [...prev, toRoomMember(broadcast.payload.member)];
      });
      if (!activeRemoteEndpointRef.current && broadcast.payload.member.memberId !== currentUserId) {
        void ensurePeerSession(broadcast.payload.member.memberId).startOffer();
      }
      return;
    }

    if (broadcast.type === 'MemberLeft') {
      setMembers((prev) => prev.filter((member) => member.id !== broadcast.payload.memberId));
      return;
    }

    if (broadcast.type === 'MemberServerMuted') {
      const { memberId, serverMuted } = broadcast.payload;
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, serverMuted } : m)));
      // When the host server-mutes me, force my own mic off.
      if (memberId === currentUserId && serverMuted) {
        localAudio.setMuted(true);
      }
      return;
    }

    if (broadcast.type === 'MemberRemoved') {
      const { memberId, reason } = broadcast.payload;
      // This event is targeted at the removed member only.
      if (memberId === currentUserId) {
        appendRuntimeLog('warn', 'host-manage', `被移出房间: ${reason}`);
        window.alert(reason === 'banned' ? '你已被房主拉黑。' : '你已被房主移出房间。');
        handleLeave();
      }
      return;
    }

    if (broadcast.type === 'HostChanged') {
      const { previousHostId, newHostId } = broadcast.payload;
      setMembers((prev) =>
        prev.map((m) => {
          if (m.id === newHostId) return { ...m, isHost: true };
          if (m.id === previousHostId) return { ...m, isHost: false };
          return m;
        }),
      );
      return;
    }
  };

  useEffect(() => {
    if (appState !== 'channel' || !activeRoomId) {
      return;
    }

    controlSessionRef.current?.stop();
    controlSessionRef.current = createControlSession({
      initialSequence: activeRoomStartSequence,
      getEvents: ({ lastSequence }) =>
        activeRemoteEndpoint
          ? getRemoteHostRuntimeRoomEvents({
              ipv4: activeRemoteEndpoint.host,
              port: activeRemoteEndpoint.port,
              roomId: activeRoomId,
              subscriberMemberId: currentUserId,
              lastSequence,
            })
          : getHostRuntimeRoomEvents({
              roomId: activeRoomId,
              subscriberMemberId: currentUserId,
              lastSequence,
            }),
      onMessage: applyRuntimeEvent,
      onError: (error) => {
        appendRuntimeLog(
          'warn',
          'runtime-poll',
          error instanceof Error ? error.message : '房间状态轮询失败',
        );
      },
    });
    controlSessionRef.current.start();

    return () => {
      controlSessionRef.current?.stop();
      controlSessionRef.current = null;
    };
  }, [activeRemoteEndpoint, activeRoomId, activeRoomStartSequence, appState, currentUserId]);

  // sync per-member local volume / mute to the audio engine
  useEffect(() => {
    const engine = audioEngineRef.current;
    if (!engine) return;
    members.forEach((member) => {
      engine.setRemoteVolume(member.id, member.volume);
      engine.setLocalMute(member.id, member.localMuted);
    });
  }, [members]);

  // local mic level -> self speaking indicator
  useEffect(() => {
    if (!localAudio.stream) {
      return;
    }
    selfMonitorRef.current?.stop();
    const monitor = new SpeakingMonitor((speaking) => setMemberSpeaking(currentUserId, speaking));
    selfMonitorRef.current = monitor;
    if (!monitor.start(localAudio.stream)) {
      selfMonitorRef.current = null;
    }
    return () => {
      monitor.stop();
      if (selfMonitorRef.current === monitor) {
        selfMonitorRef.current = null;
      }
    };
  }, [localAudio.stream, currentUserId]);

  const handleCopyDiagnostics = async () => {
    await navigator.clipboard.writeText(buildRuntimeDiagnosticsText());
    alert('诊断日志已复制。');
  };

  const handleCreateRoom = async () => {
    appendRuntimeLog('info', 'create-room', '开始准备房间');
    setJoinError('');
    setPrepareHint('正在启动房主运行时...');
    setAppState('preparing');

    try {
      const endpoint = await buildInviteEndpoint();
      appendRuntimeLog('info', 'create-room', `检测到本机 IPv4: ${endpoint.ipv4}`);
      setPrepareHint('正在选择稳定入口端口...');
      const preparedInvite = await prepareRoomInvite(endpoint.ipv4, endpoint.expirySlot);
      appendRuntimeLog(
        'info',
        'create-room',
        `邀请码已生成，端口=${preparedInvite.port}，映射=${preparedInvite.usedExternalMapping ? preparedInvite.natMappingProtocol ?? 'unknown' : 'none'}`,
      );
      setPrepareHint(
        preparedInvite.reusedLastSuccessfulPort ? '正在复用上次成功端口...' : '正在校验邀请码可用性...',
      );
      await parseInviteCode(preparedInvite.inviteCode, endpoint.expirySlot);
      const roomId = normalizeInviteCode(preparedInvite.inviteCode);
      const runtimeReady = await startHostRuntimeSession({
        roomId,
        hostId: currentUserId,
        hostName: currentUserName,
        inviteCode: preparedInvite.inviteCode,
        currentSlot: endpoint.expirySlot,
        listenHost: endpoint.ipv4,
        listenPort: preparedInvite.port,
      });
      setPrepareHint('正在同步房间信息...');
      const runtimeRoomState = await getHostRuntimeRoomState(roomId);
      const newRoomName = runtimeRoomState ? deriveRoomName(runtimeRoomState) : `${currentUserName} 的房间`;
      setInviteCode(preparedInvite.inviteCode);
      setActiveRoomId(roomId);
      setActiveRemoteEndpoint(null);
      setActiveRoomStartSequence(runtimeReady.latestSequence);
      setRoomName(newRoomName);
      setNetworkPath('p2p');
      setNetworkNotice(
        preparedInvite.usedExternalMapping
          ? `已建立 ${preparedInvite.natMappingProtocol ?? '端口映射'} 端口映射`
          : preparedInvite.reusedLastSuccessfulPort
            ? '已复用上次成功端口'
            : '',
      );
      setJoinError('');
      setMembers(runtimeReady.members.map(toRoomMember));
      setMessages([]);
      setAppState('channel');
    } catch (error) {
      appendRuntimeLog(
        'error',
        'create-room',
        error instanceof Error ? error.message : '未知建房错误',
      );
      setAppState('join');
      setJoinError('房间启动失败。请复制诊断日志并反馈，或检查本机网络/防火墙。');
    }
  };

  const handleCodeComplete = async (code: string) => {
    appendRuntimeLog('info', 'join-room', `开始解析邀请码: ${normalizeInviteCode(code)}`);
    try {
      const resolvedJoin = await resolveJoinRoom(code, {});
      appendRuntimeLog(
        'info',
        'join-room',
        `邀请码解析成功，目标=${resolvedJoin.endpointHost}:${resolvedJoin.endpointPort}，路径=${resolvedJoin.networkPath}`,
      );
      const roomId = normalizeInviteCode(resolvedJoin.formattedInviteCode);
      const runtimeRoomState = await getRemoteHostRuntimeRoomState({
        ipv4: resolvedJoin.endpointHost,
        port: resolvedJoin.endpointPort,
        roomId,
      });
      const resolvedHostName = deriveHostDisplayName(runtimeRoomState);
      const resolvedRoomName = deriveRoomName(runtimeRoomState);
      setInviteCode(resolvedJoin.formattedInviteCode);
      setRoomName(resolvedRoomName);
      setPendingJoin({
        roomName: resolvedRoomName,
        hostName: resolvedHostName,
        onlineCount: runtimeRoomState.type === 'RoomState' ? runtimeRoomState.payload.members.length : 1,
        networkPath: resolvedJoin.networkPath,
        resolutionNotice: resolvedJoin.resolutionNotice,
        roomId,
        endpointHost: resolvedJoin.endpointHost,
        endpointPort: resolvedJoin.endpointPort,
      });
      setJoinError('');
      setAppState('confirm');
    } catch (error) {
      appendRuntimeLog(
        'error',
        'join-room',
        error instanceof Error ? error.message : '未知入房错误',
      );
      setJoinError(
        error instanceof JoinRoomResolutionError
          ? error.message
          : '加入房间失败，请稍后重试。',
      );
      setPendingJoin(null);
    }
  };

  const handleConfirmJoin = async () => {
    if (!pendingJoin) {
      return;
    }

    const accepted = await joinRemoteHostRuntimeSession({
      ipv4: pendingJoin.endpointHost,
      port: pendingJoin.endpointPort,
      roomId: pendingJoin.roomId,
      inviteCode,
      currentSlot: getCurrentInviteExpirySlot(),
      userId: currentUserId,
      displayName: currentUserName,
    });
    setActiveRoomId(pendingJoin.roomId);
    setActiveRemoteEndpoint({
      host: pendingJoin.endpointHost,
      port: pendingJoin.endpointPort,
    });
    setActiveRoomStartSequence(accepted.latestSequence);
    setNetworkPath(pendingJoin.networkPath ?? 'p2p');
    setNetworkNotice(pendingJoin.resolutionNotice ?? '');
    setMembers(toRoomMembers(accepted.roomState));
    setMessages([]);
    setAppState('channel');
  };

  const handleSendImage = async (file: File) => {
    if (!canSendImage(file.size)) {
      return;
    }
    const buffer = await file.arrayBuffer();
    const chunks = splitIntoChunks(buffer);
    const fileId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const meta: FileMetaFrame = {
      type: 'FILE_META',
      fileId,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      totalChunks: chunks.length,
    };
    const metaFrame = JSON.stringify(meta);
    peerSessionsRef.current.forEach((session) => {
      session.sendRaw(metaFrame);
      chunks.forEach((chunk) => session.sendRaw(chunk));
    });

    const url = URL.createObjectURL(new Blob([buffer], { type: file.type }));
    setMessages((prev) => [
      ...prev,
      {
        id: `img-${fileId}`,
        sender: currentUserName,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        content: file.name,
        isSelf: true,
        imageUrl: url,
        fileName: file.name,
      },
    ]);
  };

  const handleStartShare = async (opts: { quality: string; includeSystemAudio: boolean }) => {
    const stream = await screenShare.start({
      quality: opts.quality as ShareQualityPreset,
      includeSystemAudio: opts.includeSystemAudio,
    });
    if (!stream) {
      return;
    }
    const track = stream.getVideoTracks()[0];
    if (track) {
      peerSessionsRef.current.forEach((session) => {
        void session.addTrack(track, stream);
      });
    }
  };

  const handleStopShare = () => {
    screenShare.stop();
  };

  // --- Host management (server-mute / kick / ban / transfer host) -------------
  // The host (by role) manages the room. If this client owns the runtime
  // (no remote endpoint), commands go local; otherwise the host is a joiner and
  // the call is relayed over the control plane with a host-authority check.
  // The resulting broadcasts reach every member via the poll path.
  const handleServerMute = async (memberId: string) => {
    const roomId = activeRoomIdRef.current;
    if (!roomId) return;
    const target = membersRef.current.find((m) => m.id === memberId);
    if (!target) return;
    const serverMuted = !target.serverMuted;
    try {
      const endpoint = activeRemoteEndpointRef.current;
      if (endpoint) {
        await serverMuteRemoteRuntimeMember({
          ipv4: endpoint.host,
          port: endpoint.port,
          roomId,
          hostMemberId: currentUserId,
          memberId,
          serverMuted,
        });
      } else {
        await serverMuteHostRuntimeMember({ roomId, memberId, serverMuted });
      }
    } catch (error) {
      appendRuntimeLog('warn', 'host-manage', error instanceof Error ? error.message : '闭麦失败');
    }
  };

  const handleKick = async (memberId: string) => {
    const roomId = activeRoomIdRef.current;
    if (!roomId) return;
    try {
      const endpoint = activeRemoteEndpointRef.current;
      if (endpoint) {
        await kickRemoteRuntimeMember({
          ipv4: endpoint.host,
          port: endpoint.port,
          roomId,
          hostMemberId: currentUserId,
          memberId,
        });
      } else {
        await kickHostRuntimeMember({ roomId, memberId });
      }
    } catch (error) {
      appendRuntimeLog('warn', 'host-manage', error instanceof Error ? error.message : '踢出失败');
    }
  };

  const handleBan = async (memberId: string) => {
    const roomId = activeRoomIdRef.current;
    if (!roomId) return;
    try {
      const endpoint = activeRemoteEndpointRef.current;
      if (endpoint) {
        await banRemoteRuntimeMember({
          ipv4: endpoint.host,
          port: endpoint.port,
          roomId,
          hostMemberId: currentUserId,
          memberId,
        });
      } else {
        await banHostRuntimeMember({ roomId, memberId });
      }
    } catch (error) {
      appendRuntimeLog('warn', 'host-manage', error instanceof Error ? error.message : '拉黑失败');
    }
  };

  const handleTransferHost = async (memberId: string) => {
    const roomId = activeRoomIdRef.current;
    if (!roomId) return;
    try {
      const endpoint = activeRemoteEndpointRef.current;
      if (endpoint) {
        await transferHostRemoteRuntimeMember({
          ipv4: endpoint.host,
          port: endpoint.port,
          roomId,
          hostMemberId: currentUserId,
          newHostId: memberId,
        });
      } else {
        await transferHostRuntimeMember({ roomId, newHostId: memberId });
      }
    } catch (error) {
      appendRuntimeLog('warn', 'host-manage', error instanceof Error ? error.message : '移交房主失败');
    }
  };

  const handleLeave = () => {
    screenShare.stop();
    setRemoteScreen(null);
    controlSessionRef.current?.stop();
    controlSessionRef.current = null;
    peerSessionsRef.current.forEach((session, peerId) => {
      audioEngineRef.current?.unbindRemoteStream(peerId);
      speakingMonitorsRef.current.get(peerId)?.stop();
      session.close();
    });
    peerSessionsRef.current.clear();
    speakingMonitorsRef.current.clear();
    relayEnginesRef.current.clear();
    relayRetriedPeersRef.current.clear();
    relayActivePeersRef.current.clear();
    selfMonitorRef.current?.stop();
    selfMonitorRef.current = null;
    setActiveRoomId('');
    setActiveRemoteEndpoint(null);
    setMembers([]);
    setMessages([]);
    setInviteCode('');
    setRoomName('');
    setAppState('join');
  };

  return (
    <div className="app">
      <Toggles />

      {appState === 'join' && (
        <div className="screen-center">
          <div className="card">
            <div className="join">
              <span className="label"><T zh="邀请码" en="Invite code" /></span>
              <h2><T zh="加入一个直连房间" en="Join a direct room" /></h2>
              <p className="sub">
                <T zh="输入或粘贴房主给的 16 位邀请码。通话走点对点，不经任何服务器。"
                   en="Paste or type a 16-character code from your host. The call connects peer-to-peer - nothing routes through a server." />
              </p>
              <CodeInput onComplete={handleCodeComplete} />
              <div className="hint"><T zh="粘贴完整邀请码可一次填满所有分组。" en="Paste a full code to fill every group at once." /></div>
              <div className="join-actions">
                <button className="btn primary" onClick={handleCreateRoom}>
                  <T zh="创建新房间" en="Host a room" />
                </button>
              </div>
              {joinError && (
                <div className="join-err">
                  {joinError}
                  <br />
                  <a className="link" onClick={handleCopyDiagnostics}>
                    <T zh="复制诊断日志" en="Copy diagnostics" />
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {appState === 'preparing' && (
        <div className="screen-center">
          <div className="card">
            <div className="prep">
              <div className="prep-spin" />
              <h2><T zh="正在准备房间" en="Starting your room" /></h2>
              <div className="now">{prepareHint}</div>
              <div className="progress"><i /></div>
            </div>
          </div>
        </div>
      )}

      {appState === 'channel' && (
        <div className="ch">
          <Sidebar
            roomName={roomName}
            inviteCode={inviteCode}
            currentUserId={currentUserId}
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
            onServerMute={handleServerMute}
            onKick={handleKick}
            onBan={handleBan}
            onTransferHost={handleTransferHost}
          />
          <MainArea
            onOpenSettings={() => setIsSettingsOpen(true)}
            onLeave={handleLeave}
            isMicMuted={localAudio.isMuted}
            onToggleMic={localAudio.toggleMute}
            isScreenSharing={screenShare.isSharing}
            onStartShare={handleStartShare}
            onStopShare={handleStopShare}
            localScreenStream={screenShare.stream}
            remoteScreenStream={remoteScreen}
            onSendImage={handleSendImage}
            currentUserName={currentUserName}
            messages={messages}
            networkPath={networkPath}
            networkNotice={networkNotice}
            onSendMessage={(content: string) => {
              const newMessage: ChatMessage = {
                id: Date.now().toString(),
                sender: currentUserName,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                content,
                isSelf: true,
              };
              setMessages((prev) => [...prev, newMessage]);
              const frame = JSON.stringify(newMessage);
              peerSessionsRef.current.forEach((session) => session.sendChat(frame));
            }}
          />
        </div>
      )}

      <ConfirmJoinModal
        isOpen={appState === 'confirm'}
        roomName={pendingJoin?.roomName || roomName}
        onlineCount={pendingJoin?.onlineCount || 1}
        hostName={pendingJoin?.hostName || 'Host'}
        networkPath={pendingJoin?.networkPath}
        resolutionNotice={pendingJoin?.resolutionNotice}
        onCancel={() => setAppState('join')}
        onConfirm={handleConfirmJoin}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onHotkeysChange={() => setHotkeys(loadHotkeys())}
      />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <LangProvider>
        <AppShell />
      </LangProvider>
    </ThemeProvider>
  );
}

export default App;
