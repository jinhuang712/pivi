import type { RoomSnapshot } from '../types/channel';
import { parseInviteCode, prettifyInviteCode, probeRoomEndpoint, type EndpointProbeResult } from './inviteCode';

const DEFAULT_PROBE_TIMEOUTS = [100, 200, 350];

export class JoinRoomResolutionError extends Error {
  constructor(
    public readonly code:
      | 'invalid-invite'
      | 'endpoint-unreachable'
      | 'room-not-found',
    message: string,
  ) {
    super(message);
    this.name = 'JoinRoomResolutionError';
  }
}

interface ResolveJoinRoomOptions {
  findRoomByInviteCode: (inviteCode: string) => RoomSnapshot | undefined;
  probeTimeouts?: number[];
  probeRoomEndpointImpl?: typeof probeRoomEndpoint;
  prettifyInviteCodeImpl?: typeof prettifyInviteCode;
  parseInviteCodeImpl?: typeof parseInviteCode;
}

export interface ResolveJoinRoomResult {
  formattedInviteCode: string;
  room: RoomSnapshot;
}

export const resolveJoinRoom = async (
  code: string,
  {
    findRoomByInviteCode,
    probeTimeouts = DEFAULT_PROBE_TIMEOUTS,
    probeRoomEndpointImpl = probeRoomEndpoint,
    prettifyInviteCodeImpl = prettifyInviteCode,
    parseInviteCodeImpl = parseInviteCode,
  }: ResolveJoinRoomOptions,
): Promise<ResolveJoinRoomResult> => {
  let formattedInviteCode: string;

  try {
    formattedInviteCode = await prettifyInviteCodeImpl(code);
  } catch {
    throw new JoinRoomResolutionError('invalid-invite', '邀请码无效或已过期，请确认输入无误。');
  }

  let parsedInvite;
  try {
    parsedInvite = await parseInviteCodeImpl(formattedInviteCode);
  } catch {
    throw new JoinRoomResolutionError('invalid-invite', '邀请码无效或已过期，请确认输入无误。');
  }

  const lastProbe = await probeInviteEndpointWithRetry(
    parsedInvite.ipv4,
    parsedInvite.port,
    probeTimeouts,
    probeRoomEndpointImpl,
  );
  if (!lastProbe.reachable) {
    throw new JoinRoomResolutionError('endpoint-unreachable', mapProbeFailureToMessage(lastProbe));
  }

  const room = findRoomByInviteCode(formattedInviteCode);
  if (!room) {
    throw new JoinRoomResolutionError('room-not-found', '邀请码已解析，但房间尚未就绪，请稍后重试。');
  }

  return {
    formattedInviteCode,
    room,
  };
};

export const probeInviteEndpointWithRetry = async (
  ipv4: string,
  port: number,
  probeTimeouts = DEFAULT_PROBE_TIMEOUTS,
  probeRoomEndpointImpl = probeRoomEndpoint,
) => {
  let lastProbe: EndpointProbeResult = {
    reachable: false,
    failureKind: 'unknown',
    elapsedMs: 0,
  };

  for (const timeout of probeTimeouts) {
    lastProbe = await probeRoomEndpointImpl(ipv4, port, timeout);
    if (lastProbe.reachable) {
      return lastProbe;
    }
  }

  return lastProbe;
};

const mapProbeFailureToMessage = (probe: EndpointProbeResult) => {
  switch (probe.failureKind) {
    case 'connection-refused':
      return '房主入口暂未就绪，请稍后重试。';
    case 'timeout':
    case 'unreachable':
      return '房主入口不可达，请检查网络或防火墙设置。';
    default:
      return '房主入口连接失败，请稍后重试。';
  }
};
