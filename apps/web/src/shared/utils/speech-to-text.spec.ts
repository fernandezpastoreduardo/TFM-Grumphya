import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startSpeechToText } from "./speech-to-text";

const TRANSCRIPT_TEXT = "Una aplicación para compartir libros";

function installSpeechRecognitionMock() {
  const recognizer = {
    lang: "",
    processLocally: false,
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
  Object.assign(constructor, {
    available: vi.fn().mockResolvedValue("available"),
    install: vi.fn().mockResolvedValue(true),
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
  it("starts local Spanish recognition and returns final speech as text", async () => {
    const { recognizer, constructor } = installSpeechRecognitionMock();
    const onTranscript = vi.fn();
    const onError = vi.fn();

    const session = startSpeechToText({ onTranscript, onError });

    await waitFor(() => expect(constructor).toHaveBeenCalledOnce());
    expect(recognizer.lang).toBe("es-ES");
    expect(recognizer.processLocally).toBe(true);
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

  it("ignores malformed browser events and does not deliver a result twice", async () => {
    const { recognizer } = installSpeechRecognitionMock();
    const onTranscript = vi.fn();
    startSpeechToText({ onTranscript, onError: vi.fn() });
    await waitFor(() => expect(recognizer.start).toHaveBeenCalledOnce());

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

  it("signals when the browser ends recognition naturally", async () => {
    const { recognizer } = installSpeechRecognitionMock();
    const onEnd = vi.fn();
    startSpeechToText({
      onTranscript: vi.fn(),
      onError: vi.fn(),
      onEnd,
    });
    await waitFor(() => expect(recognizer.start).toHaveBeenCalledOnce());

    recognizer.onend?.();

    expect(onEnd).toHaveBeenCalledOnce();
  });

  it("classifies microphone permission errors without exposing raw browser errors", async () => {
    const { recognizer } = installSpeechRecognitionMock();
    const onError = vi.fn();

    startSpeechToText({ onTranscript: vi.fn(), onError });
    await waitFor(() => expect(recognizer.start).toHaveBeenCalledOnce());
    recognizer.onerror?.({ error: "not-allowed", message: "private detail" });

    expect(onError).toHaveBeenCalledWith("permission-denied");
    expect(onError).not.toHaveBeenCalledWith(
      expect.stringContaining("private"),
    );
  });

  it("stops an active recognition session", async () => {
    const { recognizer } = installSpeechRecognitionMock();
    const session = startSpeechToText({
      onTranscript: vi.fn(),
      onError: vi.fn(),
    });
    await waitFor(() => expect(recognizer.start).toHaveBeenCalledOnce());

    session?.stop();

    expect(recognizer.stop).toHaveBeenCalledOnce();
  });

  it("installs a missing local Spanish speech pack before recognition", async () => {
    const { recognizer, constructor } = installSpeechRecognitionMock();
    const recognitionApi = constructor as unknown as {
      available: ReturnType<typeof vi.fn>;
      install: ReturnType<typeof vi.fn>;
    };
    recognitionApi.available.mockResolvedValue("downloadable");
    const onPreparing = vi.fn();

    startSpeechToText({
      onTranscript: vi.fn(),
      onError: vi.fn(),
      onPreparing,
    });

    await waitFor(() => expect(recognizer.start).toHaveBeenCalledOnce());
    expect(onPreparing).toHaveBeenCalledOnce();
    expect(recognitionApi.install).toHaveBeenCalledWith({
      langs: ["es-ES"],
      processLocally: true,
      quality: "dictation",
    });
    expect(recognizer.processLocally).toBe(true);
  });

  it("reports local speech as unavailable when installing the speech pack fails", async () => {
    const { recognizer, constructor } = installSpeechRecognitionMock();
    const recognitionApi = constructor as unknown as {
      available: ReturnType<typeof vi.fn>;
      install: ReturnType<typeof vi.fn>;
    };
    recognitionApi.available.mockResolvedValue("downloadable");
    recognitionApi.install.mockResolvedValue(false);
    const onError = vi.fn();
    const onEnd = vi.fn();

    startSpeechToText({ onTranscript: vi.fn(), onError, onEnd });

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith("local-unavailable"),
    );
    expect(recognizer.start).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it("does not start recognition if the user stops while the local speech pack is installing", async () => {
    const { recognizer, constructor } = installSpeechRecognitionMock();
    const recognitionApi = constructor as unknown as {
      available: ReturnType<typeof vi.fn>;
      install: ReturnType<typeof vi.fn>;
    };
    recognitionApi.available.mockResolvedValue("downloadable");
    let finishInstall: ((installed: boolean) => void) | undefined;
    recognitionApi.install.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          finishInstall = resolve;
        }),
    );
    const onError = vi.fn();
    const onPreparing = vi.fn();
    const session = startSpeechToText({
      onTranscript: vi.fn(),
      onError,
      onPreparing,
    });

    await waitFor(() => expect(onPreparing).toHaveBeenCalledOnce());
    session?.stop();
    finishInstall?.(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(recognizer.start).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports a failed local-availability check without starting recognition", async () => {
    const { recognizer, constructor } = installSpeechRecognitionMock();
    const recognitionApi = constructor as unknown as {
      available: ReturnType<typeof vi.fn>;
      install: ReturnType<typeof vi.fn>;
    };
    recognitionApi.available.mockRejectedValue(new Error("private detail"));
    const onError = vi.fn();

    startSpeechToText({ onTranscript: vi.fn(), onError });

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith("local-unavailable"),
    );
    expect(onError).not.toHaveBeenCalledWith(
      expect.stringContaining("private"),
    );
    expect(recognitionApi.install).not.toHaveBeenCalled();
    expect(recognizer.start).not.toHaveBeenCalled();
  });

  it("does not fall back to remote recognition when local Spanish is unavailable", async () => {
    const { recognizer, constructor } = installSpeechRecognitionMock();
    const recognitionApi = constructor as unknown as {
      available: ReturnType<typeof vi.fn>;
    };
    recognitionApi.available.mockResolvedValue("unavailable");
    const onError = vi.fn();

    startSpeechToText({ onTranscript: vi.fn(), onError });

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith("local-unavailable"),
    );
    expect(recognizer.start).not.toHaveBeenCalled();
  });

  it("does not start recognition when the browser lacks the local-only setting", async () => {
    const { recognizer } = installSpeechRecognitionMock();
    Reflect.deleteProperty(recognizer, "processLocally");
    const onError = vi.fn();

    startSpeechToText({ onTranscript: vi.fn(), onError });

    await waitFor(() => expect(onError).toHaveBeenCalledWith("unsupported"));
    expect(recognizer.start).not.toHaveBeenCalled();
  });
});
