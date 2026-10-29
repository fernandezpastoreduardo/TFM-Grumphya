export type SpeechToTextError =
  | "unsupported"
  | "local-unavailable"
  | "permission-denied"
  | "no-speech"
  | "failed";

type SpeechToTextOptions = {
  onTranscript: (transcript: string) => void;
  onError: (error: SpeechToTextError) => void;
  onPreparing?: () => void;
  onStart?: () => void;
  onEnd?: () => void;
};

type SpeechRecognitionLike = {
  lang: string;
  processLocally: boolean;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionOptions = {
  langs: string[];
  processLocally: true;
  quality: "dictation";
};

type SpeechRecognitionAvailability =
  "available" | "downloadable" | "downloading" | "unavailable";

type SpeechRecognitionConstructor = {
  new (): SpeechRecognitionLike;
  prototype: SpeechRecognitionLike;
  available?: (options: SpeechRecognitionOptions) => Promise<unknown>;
  install?: (options: SpeechRecognitionOptions) => Promise<boolean>;
};
type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

export type SpeechToTextSession = { stop: () => void };

const SPEECH_LANGUAGE = "es-ES";
const SPEECH_QUALITY = "dictation";
const ANDROID_USER_AGENT_PATTERN = /android/i;
const LOCAL_SPEECH_OPTIONS: SpeechRecognitionOptions = {
  langs: [SPEECH_LANGUAGE],
  processLocally: true,
  quality: SPEECH_QUALITY,
};
const PERMISSION_ERRORS = new Set(["not-allowed", "service-not-allowed"]);

export function isSpeechToTextSupported(): boolean {
  if (typeof window === "undefined") return false;

  if (ANDROID_USER_AGENT_PATTERN.test(window.navigator.userAgent)) {
    return false;
  }

  const speechWindow = window as SpeechRecognitionWindow;
  const Recognition =
    speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
  if (
    !Recognition ||
    typeof Recognition.available !== "function" ||
    typeof Recognition.install !== "function"
  ) {
    return false;
  }
  return "processLocally" in Recognition.prototype;
}

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
  if (error === "language-not-supported") return "local-unavailable";
  return "failed";
}

function isSpeechRecognitionAvailability(
  value: unknown,
): value is SpeechRecognitionAvailability {
  return (
    value === "available" ||
    value === "downloadable" ||
    value === "downloading" ||
    value === "unavailable"
  );
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
  onPreparing,
  onStart,
  onEnd,
}: SpeechToTextOptions): SpeechToTextSession | null {
  const speechWindow = window as SpeechRecognitionWindow;
  const Recognition =
    speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
  if (
    !Recognition ||
    typeof Recognition.available !== "function" ||
    typeof Recognition.install !== "function"
  ) {
    onError("unsupported");
    return null;
  }
  const recognitionConstructor = Recognition;
  const checkLocalAvailability = Recognition.available;
  const installLocalSpeech = Recognition.install;

  let recognition: SpeechRecognitionLike | null = null;
  let isStopped = false;
  let hasDeliveredTranscript = false;
  const session: SpeechToTextSession = {
    stop() {
      if (isStopped) return;
      isStopped = true;
      if (!recognition) return;
      try {
        recognition.stop();
      } catch {
        onError("failed");
      }
    },
  };

  void prepareLocalRecognition()
    .then((isReady) => {
      if (isStopped || !isReady) return;
      recognition = new recognitionConstructor();
      if (!("processLocally" in recognition)) {
        onError("unsupported");
        onEnd?.();
        return;
      }
      recognition.processLocally = true;
      if (recognition.processLocally !== true) {
        onError("unsupported");
        onEnd?.();
        return;
      }
      recognition.lang = SPEECH_LANGUAGE;
      recognition.interimResults = false;
      recognition.continuous = false;
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
        onStart?.();
      } catch (error) {
        const errorName =
          isRecord(error) && typeof error.name === "string"
            ? error.name
            : undefined;
        onError(normalizeSpeechError(errorName));
        onEnd?.();
      }
    })
    .catch(() => {
      if (isStopped) return;
      onError("failed");
      onEnd?.();
    });

  return session;

  async function prepareLocalRecognition(): Promise<boolean> {
    let availability: unknown;
    try {
      availability = await checkLocalAvailability(LOCAL_SPEECH_OPTIONS);
    } catch {
      if (isStopped) return false;
      onError("local-unavailable");
      onEnd?.();
      return false;
    }
    if (isStopped) return false;
    if (!isSpeechRecognitionAvailability(availability)) {
      onError("failed");
      onEnd?.();
      return false;
    }
    if (availability === "available") return true;
    if (availability === "unavailable") {
      onError("local-unavailable");
      onEnd?.();
      return false;
    }

    onPreparing?.();
    try {
      const installed = await installLocalSpeech(LOCAL_SPEECH_OPTIONS);
      if (isStopped) return false;
      if (installed) return true;
      onError("local-unavailable");
    } catch {
      onError("local-unavailable");
    }
    onEnd?.();
    return false;
  }
}
