export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const DEFAULT_CHUNK_SIZE = 64 * 1024;

export interface FileMetaFrame {
  type: 'FILE_META';
  fileId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  totalChunks: number;
}

export interface ChannelLike {
  readyState: 'connecting' | 'open' | 'closing' | 'closed';
  send: (payload: string | ArrayBuffer) => void;
}

interface IncomingFileState {
  meta: FileMetaFrame;
  chunks: ArrayBuffer[];
  receivedCount: number;
  timer: ReturnType<typeof setTimeout>;
}

export function buildTextFrame(message: string): string {
  return JSON.stringify({
    type: 'CHAT_TEXT',
    text: message,
  });
}

export function canSendImage(fileSize: number): boolean {
  return fileSize <= MAX_IMAGE_BYTES;
}

export function splitIntoChunks(buffer: ArrayBuffer, chunkSize: number = DEFAULT_CHUNK_SIZE): ArrayBuffer[] {
  const chunks: ArrayBuffer[] = [];
  let offset = 0;
  while (offset < buffer.byteLength) {
    const end = Math.min(offset + chunkSize, buffer.byteLength);
    chunks.push(buffer.slice(offset, end));
    offset = end;
  }
  return chunks;
}

export async function sendTextMessage(channel: ChannelLike, message: string): Promise<boolean> {
  if (channel.readyState !== 'open') return false;
  channel.send(buildTextFrame(message));
  return true;
}

export async function sendImageFile(
  channel: ChannelLike,
  file: File,
  fileId: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
): Promise<{ ok: boolean; reason?: 'FILE_TOO_LARGE' | 'CHANNEL_NOT_OPEN' }> {
  if (!canSendImage(file.size)) {
    return { ok: false, reason: 'FILE_TOO_LARGE' };
  }
  if (channel.readyState !== 'open') {
    return { ok: false, reason: 'CHANNEL_NOT_OPEN' };
  }

  const fileBuffer = await file.arrayBuffer();
  const chunks = splitIntoChunks(fileBuffer, chunkSize);
  const meta: FileMetaFrame = {
    type: 'FILE_META',
    fileId,
    fileName: file.name,
    mimeType: file.type,
    fileSize: file.size,
    totalChunks: chunks.length,
  };

  channel.send(JSON.stringify(meta));
  chunks.forEach((chunk) => channel.send(chunk));
  return { ok: true };
}

export class IncomingFileAssembler {
  private states = new Map<string, IncomingFileState>();
  private timeoutMs: number;

  constructor(timeoutMs: number = 30_000) {
    this.timeoutMs = timeoutMs;
  }

  registerMeta(meta: FileMetaFrame): void {
    const timer = setTimeout(() => {
      this.states.delete(meta.fileId);
    }, this.timeoutMs);
    this.states.set(meta.fileId, {
      meta,
      chunks: [],
      receivedCount: 0,
      timer,
    });
  }

  pushChunk(fileId: string, chunk: ArrayBuffer): { done: boolean; blob?: Blob } {
    const state = this.states.get(fileId);
    if (!state) return { done: false };

    state.chunks.push(chunk);
    state.receivedCount += 1;

    if (state.receivedCount < state.meta.totalChunks) {
      return { done: false };
    }

    clearTimeout(state.timer);
    this.states.delete(fileId);
    return {
      done: true,
      blob: new Blob(state.chunks, { type: state.meta.mimeType }),
    };
  }

  hasFile(fileId: string): boolean {
    return this.states.has(fileId);
  }
}

export class TransferTaskQueue {
  private readonly maxConcurrent: number;
  private activeCount = 0;
  private queue: Array<() => Promise<void>> = [];

  constructor(maxConcurrent: number = 2) {
    this.maxConcurrent = maxConcurrent;
  }

  enqueue(task: () => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      const wrapped = async () => {
        try {
          await task();
          resolve();
        } catch (error) {
          reject(error);
        } finally {
          this.activeCount -= 1;
          this.runNext();
        }
      };

      this.queue.push(wrapped);
      this.runNext();
    });
  }

  pendingCount(): number {
    return this.queue.length;
  }

  runningCount(): number {
    return this.activeCount;
  }

  private runNext(): void {
    if (this.activeCount >= this.maxConcurrent) return;
    const next = this.queue.shift();
    if (!next) return;
    this.activeCount += 1;
    void next();
  }
}
