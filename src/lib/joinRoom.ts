import { RelayFallbackEngine } from '../media/relayFallback';
import type { RoomNetworkPath, RoomSnapshot } from '../types/channel';
import { parseInviteCode, prettifyInviteCode, probeRoomEndpoint, type EndpointProbeResult } from './inviteCode';

const DEFAULT_PROBE_TIMEOUTS = [100, 200, 350];

export class JoinRoomResolutionError extends Error {
  constructor(
    public readonly code:
      | 'invalid-invite'
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
  networkPath: RoomNetworkPath;
  resolutionNotice?: string;
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

  const room = findRoomByInviteCode(formattedInviteCode);
  if (!room) {
    throw new JoinRoomResolutionError('room-not-found', '邀请码已解析，但房间尚未就绪，请稍后重试。');
  }

  const lastProbe = await probeInviteEndpointWithRetry(
    parsedInvite.ipv4,
    parsedInvite.port,
    probeTimeouts,
    probeRoomEndpointImpl,
  );
  if (!lastProbe.reachable && shouldFallbackToRelay(lastProbe)) {
    return {
      formattedInviteCode,
      room,
      networkPath: 'relay',
      resolutionNotice: '房主直连入口不可达，已回退到中转模式。',
    };
  }

  return {
    formattedInviteCode,
    room,
    networkPath: 'p2p',
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

const shouldFallbackToRelay = (probe: EndpointProbeResult) => {
  const engine = new RelayFallbackEngine();
  const decision = engine.processIceState({
    peerId: 'host-runtime',
    iceState: probe.reachable ? 'connected' : 'failed',
    checkingElapsedMs: probe.elapsedMs,
  });

  return decision === 'switch_to_relay';
};
