import { invoke } from '@tauri-apps/api/core';
import type { ControlRuntimeMessage, MemberSnapshot, RoomBroadcastMessage, RoomRuntimeEvent, WebRtcSignalType } from '../types/runtimeSession';

export interface HostRuntimeReady {
  roomId: string;
  inviteCode: string;
  listenHost: string;
  listenPort: number;
  members: MemberSnapshot[];
  latestSequence: number;
}

export interface JoinRuntimeAccepted {
  roomId: string;
  joinedMember: MemberSnapshot;
  roomState: RoomBroadcastMessage;
  latestSequence: number;
}

export interface SignalRelayAccepted {
  sequence: number;
  targetMemberId?: string | null;
  message: ControlRuntimeMessage;
}

export const startHostRuntimeSession = (payload: {
  roomId: string;
  hostId: string;
  hostName: string;
  inviteCode: string;
  currentSlot: number;
  listenHost: string;
  listenPort: number;
}) => invoke<HostRuntimeReady>('start_host_runtime_session', payload);

export const joinHostRuntimeSession = (payload: {
  roomId: string;
  inviteCode: string;
  currentSlot: number;
  userId: string;
  displayName: string;
}) => invoke<JoinRuntimeAccepted>('join_host_runtime_session', payload);

export const joinRemoteHostRuntimeSession = (payload: {
  ipv4: string;
  port: number;
  roomId: string;
  inviteCode: string;
  currentSlot: number;
  userId: string;
  displayName: string;
}) => invoke<JoinRuntimeAccepted>('join_remote_host_runtime_session', payload);

export const getHostRuntimeRoomState = (roomId: string) =>
  invoke<RoomBroadcastMessage | null>('get_host_runtime_room_state', { roomId });

export const getRemoteHostRuntimeRoomState = (payload: {
  ipv4: string;
  port: number;
  roomId: string;
}) => invoke<RoomBroadcastMessage>('get_remote_host_runtime_room_state', payload);

export const getHostRuntimeRoomEvents = (payload: {
  roomId: string;
  subscriberMemberId: string;
  lastSequence: number;
}) => invoke<RoomRuntimeEvent[] | null>('get_host_runtime_room_events', payload);

export const getRemoteHostRuntimeRoomEvents = (payload: {
  ipv4: string;
  port: number;
  roomId: string;
  subscriberMemberId: string;
  lastSequence: number;
}) => invoke<RoomRuntimeEvent[]>('get_remote_host_runtime_room_events', payload);

export const relayHostRuntimeSignal = (payload: {
  roomId: string;
  from: string;
  target: string;
  signalType: WebRtcSignalType;
  payload: string;
}) => invoke<SignalRelayAccepted>('relay_host_runtime_signal', payload);

export const relayRemoteRuntimeSignal = (payload: {
  ipv4: string;
  port: number;
  roomId: string;
  from: string;
  target: string;
  signalType: WebRtcSignalType;
  payload: string;
}) => invoke<SignalRelayAccepted>('relay_remote_runtime_signal', payload);

export const getHostRuntimeReady = (roomId: string) =>
  invoke<HostRuntimeReady | null>('get_host_runtime_ready', { roomId });

/** Host-only: toggle a member's server-mute. Forces their mic off for everyone. */
export const serverMuteHostRuntimeMember = (payload: {
  roomId: string;
  memberId: string;
  serverMuted: boolean;
}) => invoke<SignalRelayAccepted>('server_mute_host_runtime_member', payload);

/** Host-only: remove a member from the room. The member is notified they were kicked. */
export const kickHostRuntimeMember = (payload: { roomId: string; memberId: string }) =>
  invoke<SignalRelayAccepted>('kick_host_runtime_member', payload);

/** Host-only: remove a member and reject any future rejoin from them. */
export const banHostRuntimeMember = (payload: { roomId: string; memberId: string }) =>
  invoke<SignalRelayAccepted>('ban_host_runtime_member', payload);

/** Host-only (runtime owner): transfer the host role to another member. */
export const transferHostRuntimeMember = (payload: { roomId: string; newHostId: string }) =>
  invoke<SignalRelayAccepted>('transfer_host_runtime_member', payload);

/**
 * Remote host management. The host (by role) may be a joiner connected to the
 * runtime-owning host, so these go over the control plane. `hostMemberId` is
 * the requesting host; the runtime rejects the call unless they actually hold
 * the Host role.
 */
export const transferHostRemoteRuntimeMember = (payload: {
  ipv4: string;
  port: number;
  roomId: string;
  hostMemberId: string;
  newHostId: string;
}) => invoke<SignalRelayAccepted>('transfer_host_remote_runtime_member', payload);

export const serverMuteRemoteRuntimeMember = (payload: {
  ipv4: string;
  port: number;
  roomId: string;
  hostMemberId: string;
  memberId: string;
  serverMuted: boolean;
}) => invoke<SignalRelayAccepted>('server_mute_remote_runtime_member', payload);

export const kickRemoteRuntimeMember = (payload: {
  ipv4: string;
  port: number;
  roomId: string;
  hostMemberId: string;
  memberId: string;
}) => invoke<SignalRelayAccepted>('kick_remote_runtime_member', payload);

export const banRemoteRuntimeMember = (payload: {
  ipv4: string;
  port: number;
  roomId: string;
  hostMemberId: string;
  memberId: string;
}) => invoke<SignalRelayAccepted>('ban_remote_runtime_member', payload);
