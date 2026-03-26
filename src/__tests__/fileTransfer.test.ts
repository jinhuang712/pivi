import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_CHUNK_SIZE,
  IncomingFileAssembler,
  MAX_IMAGE_BYTES,
  TransferTaskQueue,
  canSendImage,
  sendImageFile,
  sendTextMessage,
  splitIntoChunks,
} from '../media/fileTransfer';

describe('fileTransfer', () => {
  it('should block oversized image', async () => {
    const channel = {
      readyState: 'open',
      send: vi.fn(),
    } as const;
    const oversized = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], 'huge.png', {
      type: 'image/png',
    });

    const result = await sendImageFile(channel, oversized, 'file-1');
    expect(result).toEqual({ ok: false, reason: 'FILE_TOO_LARGE' });
    expect(channel.send).not.toHaveBeenCalled();
  });

  it('should split buffer with expected chunk count and tail size', () => {
    const buffer = new Uint8Array(150_000).buffer;
    const chunks = splitIntoChunks(buffer, DEFAULT_CHUNK_SIZE);
    expect(chunks.length).toBe(3);
    expect(chunks[2].byteLength).toBe(18_928);
  });

  it('should rebuild blob when all chunks are received', () => {
    const assembler = new IncomingFileAssembler(10_000);
    assembler.registerMeta({
      type: 'FILE_META',
      fileId: 'f1',
      fileName: 'a.png',
      mimeType: 'image/png',
      fileSize: 10,
      totalChunks: 2,
    });

    const part1 = new Uint8Array([1, 2, 3]).buffer;
    const part2 = new Uint8Array([4, 5]).buffer;
    const first = assembler.pushChunk('f1', part1);
    expect(first.done).toBe(false);
    const second = assembler.pushChunk('f1', part2);
    expect(second.done).toBe(true);
    expect(second.blob?.size).toBe(5);
    expect(assembler.hasFile('f1')).toBe(false);
  });

  it('should cleanup stale file after timeout', () => {
    vi.useFakeTimers();
    const assembler = new IncomingFileAssembler(50);
    assembler.registerMeta({
      type: 'FILE_META',
      fileId: 'timeout-file',
      fileName: 'a.png',
      mimeType: 'image/png',
      fileSize: 10,
      totalChunks: 2,
    });
    expect(assembler.hasFile('timeout-file')).toBe(true);
    vi.advanceTimersByTime(51);
    expect(assembler.hasFile('timeout-file')).toBe(false);
    vi.useRealTimers();
  });

  it('should limit concurrent transfer tasks to 2', async () => {
    const queue = new TransferTaskQueue(2);
    let running = 0;
    let maxRunning = 0;

    const createTask = () => async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 20));
      running -= 1;
    };

    await Promise.all([
      queue.enqueue(createTask()),
      queue.enqueue(createTask()),
      queue.enqueue(createTask()),
      queue.enqueue(createTask()),
      queue.enqueue(createTask()),
    ]);

    expect(maxRunning).toBe(2);
  });

  it('should send text frame when channel is open', async () => {
    const channel = {
      readyState: 'open',
      send: vi.fn(),
    } as const;
    const ok = await sendTextMessage(channel, 'hello');
    expect(ok).toBe(true);
    expect(channel.send).toHaveBeenCalledTimes(1);
  });

  it('canSendImage should allow exactly 5MB', () => {
    expect(canSendImage(MAX_IMAGE_BYTES)).toBe(true);
  });
});
