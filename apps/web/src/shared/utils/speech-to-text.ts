export type SpeechToTextError =
  "unsupported" | "permission-denied" | "no-speech" | "failed";

type SpeechToTextOptions = {
  onTranscript: (transcript: string) => void;
  onError: (error: SpeechToTextError) => void;
  onEnd?: () => void;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

export type SpeechToTextSession = { stop: () => void };

const SPEECH_LANGUAGE = "es-ES";
const PERMISSION_ERRORS = new Set(["not-allowed", "service-not-allowed"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isArrayLike(value: unknown): value is ArrayLike<unknown> {
  return (
    isRecord(value) &&
    typeof value.length === "number" &&
    Number.isInteger(value.length) &&
    value.length >= 0
  );
}

function normalizeSpeechError(error: unknown): SpeechToTextError {
  if (typeof error !== "string") return "failed";
  if (PERMISSION_ERRORS.has(error)) return "permission-denied";
  if (error === "no-speech") return "no-speech";
  return "failed";
}

function getFinalTranscript(event: unknown): string {
  if (!isRecord(event) || !isArrayLike(event.results)) return "";
  const transcripts: string[] = [];
  const results = event.results;
  const resultIndex =
    typeof event.resultIndex === "number" &&
    Number.isInteger(event.resultIndex) &&
    event.resultIndex >= 0
      ? Math.min(event.resultIndex, results.length)
      : 0;
  for (let index = resultIndex; index < results.length; index += 1) {
    const result = results[index];
    if (!isArrayLike(result) || result.length === 0) continue;
    const alternative = result[0];
    const transcript =
      isRecord(alternative) && typeof alternative.transcript === "string"
        ? alternative.transcript
        : "";
    if (transcript.trim()) {
      transcripts.push(transcript.trim());
    }
  }
  return transcripts.join(" ");
}

export function startSpeechToText({
  onTranscript,
  onError,
  onEnd,
}: SpeechToTextOptions): SpeechToTextSession | null {
  const speechWindow = window as SpeechRecognitionWindow;
  const Recognition =
    speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
  if (!Recognition) {
    onError("unsupported");
    return null;
  }

  let recognition: SpeechRecognitionLike;
  try {
    recognition = new Recognition();
  } catch {
    onError("failed");
    return null;
  }
  recognition.lang = SPEECH_LANGUAGE;
  recognition.interimResults = false;
  recognition.continuous = false;
  let hasDeliveredTranscript = false;
  recognition.onresult = (event) => {
    if (hasDeliveredTranscript) return;
    const transcript = getFinalTranscript(event);
    if (transcript) {
      hasDeliveredTranscript = true;
      onTranscript(transcript);
    }
  };
  recognition.onerror = (event) => {
    const error = isRecord(event) ? event.error : undefined;
    onError(normalizeSpeechError(error));
  };
  recognition.onend = () => onEnd?.();

  try {
    recognition.start();
  } catch {
    onError("failed");
    return null;
  }

  let isStopped = false;
  return {
    stop() {
      if (isStopped) return;
      isStopped = true;
      try {
        recognition.stop();
      } catch {
        onError("failed");
      }
    },
  };
}
