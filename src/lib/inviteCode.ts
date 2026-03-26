import { invoke } from '@tauri-apps/api/core';

export type InviteEndpointScope =
  | 'private-lan-ipv4'
  | 'public-mapped-ipv4'
  | 'public-direct-ipv4';

export type InviteJoinMode = 'direct-host' | 'host-relay-preferred';

export interface InviteCodePayload {
  endpointScope: InviteEndpointScope;
  joinMode: InviteJoinMode;
  ipv4: string;
  port: number;
  expirySlot: number;
}

export interface PreparedRoomInvite {
  inviteCode: string;
  port: number;
  reusedLastSuccessfulPort: boolean;
}

export const INVITE_CODE_LENGTH = 16;
export const INVITE_CODE_GROUPS = 4;
export const INVITE_CODE_GROUP_SIZE = 4;

export const getCurrentInviteExpirySlot = (date = new Date()) =>
  Math.floor(date.getTime() / (5 * 60 * 1000)) % 1024;

export const normalizeInviteCode = (code: string) =>
  code.toUpperCase().replace(/[^A-Z0-9]/g, '');

export const generateInviteCode = (payload: InviteCodePayload) =>
  invoke<string>('generate_invite_code', { payload });

export const prettifyInviteCode = (code: string) =>
  invoke<string>('prettify_invite_code', { code });

export const parseInviteCode = (code: string, currentSlot = getCurrentInviteExpirySlot()) =>
  invoke<InviteCodePayload>('parse_invite_code', { code, currentSlot });

export const prepareRoomInvite = (ipv4: string, expirySlot: number) =>
  invoke<PreparedRoomInvite>('prepare_room_invite', { ipv4, expirySlot });
