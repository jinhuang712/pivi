import type { Member } from '../components/MemberItem';

export interface ChatMessage {
  id: string;
  sender: string;
  time: string;
  content: string;
  isSelf: boolean;
}

export interface RoomSnapshot {
  inviteCode: string;
  roomName: string;
  hostName: string;
}

export type RoomNetworkPath = 'p2p' | 'relay';

export interface JoinPreview {
  roomName: string;
  hostName: string;
  onlineCount: number;
  networkPath: RoomNetworkPath;
  resolutionNotice?: string;
}

export type RoomMember = Member;
