import { afterEach, describe, expect, it, vi } from "vitest";
import { startSpeechToText } from "./speech-to-text";

const TRANSCRIPT_TEXT = "Una aplicación para compartir libros";

function installSpeechRecognitionMock() {
  const recognizer = {
    lang: "",
    interimResults: true,
    continuous: true,
    onresult: null as ((event: unknown) => void) | null,
    onerror: null as ((event: unknown) => void) | null,
    onend: null as (() => void) | null,
    start: vi.fn(),
    stop: vi.fn(),
  };
  const constructor = vi.fn(function SpeechRecognitionMock() {
    return recognizer;
  });
  Object.defineProperty(window, "SpeechRecognition", {
    configurable: true,
    value: constructor,
  });
  return { recognizer, constructor };
}

afterEach(() => {
  Reflect.deleteProperty(window, "SpeechRecognition");
  Reflect.deleteProperty(window, "webkitSpeechRecognition");
});

describe("startSpeechToText", () => {
  it("starts Spanish recognition and returns final speech as text", () => {
    const { recognizer, constructor } = installSpeechRecognitionMock();
    const onTranscript = vi.fn();
    const onError = vi.fn();

    const session = startSpeechToText({ onTranscript, onError });

    expect(constructor).toHaveBeenCalledOnce();
    expect(recognizer.lang).toBe("es-ES");
    expect(recognizer.interimResults).toBe(false);
    expect(recognizer.continuous).toBe(false);
    expect(recognizer.start).toHaveBeenCalledOnce();
    recognizer.onresult?.({
      results: [[{ transcript: TRANSCRIPT_TEXT }]],
      resultIndex: 0,
    });
    expect(onTranscript).toHaveBeenCalledWith(TRANSCRIPT_TEXT);
    expect(session?.stop).toBeTypeOf("function");
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports unsupported browsers without throwing", () => {
    const onTranscript = vi.fn();
    const onError = vi.fn();

    const session = startSpeechToText({ onTranscript, onError });

    expect(session).toBeNull();
    expect(onError).toHaveBeenCalledWith("unsupported");
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("ignores malformed browser events and does not deliver a result twice", () => {
    const { recognizer } = installSpeechRecognitionMock();
    const onTranscript = vi.fn();
    startSpeechToText({ onTranscript, onError: vi.fn() });

    recognizer.onresult?.({ results: "not a result list" });
    recognizer.onresult?.({
      results: [[{ transcript: TRANSCRIPT_TEXT }]],
      resultIndex: 0,
    });
    recognizer.onresult?.({
      results: [[{ transcript: "Duplicado" }]],
      resultIndex: 0,
    });

    expect(onTranscript).toHaveBeenCalledOnce();
    expect(onTranscript).toHaveBeenCalledWith(TRANSCRIPT_TEXT);
  });

  it("signals when the browser ends recognition naturally", () => {
    const { recognizer } = installSpeechRecognitionMock();
    const onEnd = vi.fn();
    startSpeechToText({
      onTranscript: vi.fn(),
      onError: vi.fn(),
      onEnd,
    });

    recognizer.onend?.();

    expect(onEnd).toHaveBeenCalledOnce();
  });

  it("classifies microphone permission errors without exposing raw browser errors", () => {
    const { recognizer } = installSpeechRecognitionMock();
    const onError = vi.fn();

    startSpeechToText({ onTranscript: vi.fn(), onError });
    recognizer.onerror?.({ error: "not-allowed", message: "private detail" });

    expect(onError).toHaveBeenCalledWith("permission-denied");
    expect(onError).not.toHaveBeenCalledWith(
      expect.stringContaining("private"),
    );
  });

  it("stops an active recognition session", () => {
    const { recognizer } = installSpeechRecognitionMock();
    const session = startSpeechToText({
      onTranscript: vi.fn(),
      onError: vi.fn(),
    });

    session?.stop();

    expect(recognizer.stop).toHaveBeenCalledOnce();
  });
});
