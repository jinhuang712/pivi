export interface MemberSnapshot {
  memberId: string;
  displayName: string;
  role: string;
  connState: string;
  serverMuted: boolean;
}

export interface RoomRuntimeEvent {
  sequence: number;
  targetMemberId?: string | null;
  message: ControlRuntimeMessage;
}

export type WebRtcSignalType = 'Offer' | 'Answer' | 'IceCandidate';

export type RoomBroadcastMessage =
  | {
      type: 'RoomState';
      payload: {
        roomId: string;
        members: MemberSnapshot[];
      };
    }
  | {
      type: 'MemberJoined';
      payload: {
        member: MemberSnapshot;
      };
    }
  | {
      type: 'MemberLeft';
      payload: {
        memberId: string;
      };
    }
  | {
      type: 'MemberServerMuted';
      payload: {
        memberId: string;
        serverMuted: boolean;
      };
    }
  | {
      type: 'MemberRemoved';
      payload: {
        memberId: string;
        reason: 'kicked' | 'banned' | string;
      };
    }
  | {
      type: 'HostChanged';
      payload: {
        previousHostId: string;
        newHostId: string;
      };
    };

export interface WebRtcSignal {
  from: string;
  target: string;
  signalType: WebRtcSignalType;
  payload: string;
}

export type WebRtcSignalMessage = {
  type: 'WebRtcSignal';
  payload: WebRtcSignal;
};

export type ControlRuntimeMessage =
  | { type: 'RoomBroadcast'; payload: RoomBroadcastMessage }
  | WebRtcSignalMessage;
