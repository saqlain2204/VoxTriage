import { useCallback, useEffect, useRef, useState } from "react";

interface UseAudioRecorderReturn {
  /** Whether the mic is currently capturing */
  isRecording: boolean;
  /** Start capturing mic audio */
  start: () => Promise<void>;
  /** Stop capturing audio */
  stop: () => void;
  /** Last error */
  error: string | null;
}

/**
 * Captures microphone audio and calls `onChunk` with base64-encoded PCM16 data
 * at regular intervals.
 */
export function useAudioRecorder(
  onChunk: (base64: string) => void,
  chunkIntervalMs = 500,
): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const bufferRef = useRef<Float32Array[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onChunkRef = useRef(onChunk);

  // Keep callback ref fresh without re-creating start/stop.
  useEffect(() => {
    onChunkRef.current = onChunk;
  }, [onChunk]);

  const flushBuffer = useCallback(() => {
    const chunks = bufferRef.current;
    if (chunks.length === 0) return;
    bufferRef.current = [];

    // Concatenate all float samples.
    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    // Convert to PCM16.
    const pcm16 = new Int16Array(merged.length);
    for (let i = 0; i < merged.length; i++) {
      const s = Math.max(-1, Math.min(1, merged[i]!));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    // Base64 encode.
    const bytes = new Uint8Array(pcm16.buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    const base64 = btoa(binary);
    onChunkRef.current(base64);
  }, []);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    flushBuffer();

    processorRef.current?.disconnect();
    processorRef.current = null;

    if (contextRef.current?.state !== "closed") {
      void contextRef.current?.close();
    }
    contextRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    setIsRecording(false);
  }, [flushBuffer]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: 16000 });
      contextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e: AudioProcessingEvent) => {
        const input = e.inputBuffer.getChannelData(0);
        bufferRef.current.push(new Float32Array(input));
      };

      source.connect(processor);
      processor.connect(ctx.destination);

      intervalRef.current = setInterval(flushBuffer, chunkIntervalMs);
      setIsRecording(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Microphone access denied";
      setError(message);
      setIsRecording(false);
    }
  }, [chunkIntervalMs, flushBuffer]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isRecording, start, stop, error };
}
