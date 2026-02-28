import { useCallback, useEffect, useRef, useState } from "react";

/** Browser speech recognition types (vendor-prefixed). */
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult | undefined;
}

interface SpeechRecognitionResult {
  readonly length: number;
  readonly isFinal: boolean;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative | undefined;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event & { error: string }) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

interface UseSpeechRecognitionReturn {
  /** Whether the browser supports Web Speech API */
  isSupported: boolean;
  /** Whether it's actively listening */
  isListening: boolean;
  /** Start speech recognition */
  start: () => void;
  /** Stop speech recognition */
  stop: () => void;
}

/**
 * Uses the Web Speech API (browser-native) for live speech-to-text.
 * Calls `onResult` with each recognized text segment.
 * Falls back gracefully if the API isn't available.
 */
export function useSpeechRecognition(
  onResult: (text: string, isFinal: boolean) => void,
): UseSpeechRecognitionReturn {
  const SpeechRecognition =
    typeof window !== "undefined"
      ? window.SpeechRecognition ?? window.webkitSpeechRecognition
      : undefined;

  const isSupported = !!SpeechRecognition;
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const onResultRef = useRef(onResult);
  const shouldRestartRef = useRef(false);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  const stop = useCallback(() => {
    shouldRestartRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const start = useCallback(() => {
    if (!SpeechRecognition) return;

    // Stop any existing instance first.
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;
    shouldRestartRef.current = true;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result) {
          const alt = result[0];
          if (alt) {
            onResultRef.current(alt.transcript, result.isFinal);
          }
        }
      }
    };

    recognition.onerror = (event) => {
      // "no-speech" and "aborted" are non-fatal; everything else stops.
      if (event.error !== "no-speech" && event.error !== "aborted") {
        shouldRestartRef.current = false;
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      // Auto-restart if we're supposed to be listening (browser cuts off after pauses).
      if (shouldRestartRef.current) {
        try {
          recognition.start();
        } catch {
          setIsListening(false);
        }
      } else {
        setIsListening(false);
      }
    };

    try {
      recognition.start();
      setIsListening(true);
    } catch {
      setIsListening(false);
    }
  }, [SpeechRecognition]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { isSupported, isListening, start, stop };
}
