import { useEffect, useRef, useState } from "react";
import "./transcript-user-idea.scss";
import {
  isSpeechToTextSupported,
  startSpeechToText,
  type SpeechToTextError,
  type SpeechToTextSession,
} from "../../shared/utils/speech-to-text";

type TranscriptUserIdeaProps = {
  onTranscript: (transcript: string) => void;
};

const DICTATE_LABEL = {
  IDLE: "Dictar idea",
  LISTENING: "Parar dictado",
} as const;
const ERROR_MESSAGES: Record<SpeechToTextError, string> = {
  unsupported:
    "Este navegador no permite comprobar que el dictado se procese en el dispositivo. Puedes escribirla, qué remedio.",
  "local-unavailable":
    "El paquete de voz local en español no está disponible. No enviaremos el audio a otro servicio; puedes escribir la idea.",
  "permission-denied":
    "No hay permiso al micrófono. Puedes escribirla; no hace falta negociar con el navegador.",
  "no-speech": "No he oído nada. Prueba otra vez o escribe la idea.",
  failed:
    "El dictado local ha fallado. Tu audio no se envía a otro servicio; puedes escribir sin dramas.",
};
const PREPARING_STATUS =
  "Preparando el reconocimiento de voz local en español…";
const LISTENING_STATUS =
  "Escuchando en este dispositivo. Suelta la idea; luego podrás corregir la transcripción.";

export function TranscriptUserIdea({ onTranscript }: TranscriptUserIdeaProps) {
  const [isAvailable] = useState(isSpeechToTextSupported);
  const [isListening, setIsListening] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [error, setError] = useState("");
  const sessionRef = useRef<SpeechToTextSession | null>(null);

  useEffect(
    () => () => {
      sessionRef.current?.stop();
    },
    [],
  );

  function handleError(reason: SpeechToTextError) {
    sessionRef.current = null;
    setIsListening(false);
    setIsPreparing(false);
    setError(ERROR_MESSAGES[reason]);
  }

  function handleDictation() {
    setError("");
    if (isListening) {
      sessionRef.current?.stop();
      sessionRef.current = null;
      setIsListening(false);
      setIsPreparing(false);
      return;
    }

    setIsListening(true);
    setIsPreparing(true);
    sessionRef.current = startSpeechToText({
      onTranscript,
      onError: handleError,
      onPreparing: () => setIsPreparing(true),
      onStart: () => setIsPreparing(false),
      onEnd: () => {
        sessionRef.current = null;
        setIsListening(false);
        setIsPreparing(false);
      },
    });
    if (!sessionRef.current) setIsListening(false);
  }

  if (!isAvailable) return null;

  return (
    <div className="idea-dictation">
      <button
        className="idea-dictation-button"
        type="button"
        aria-pressed={isListening}
        onClick={handleDictation}
      >
        <span className="dictation-icon" aria-hidden="true">
          {isListening ? (
            <svg viewBox="0 0 24 24" focusable="false">
              <rect x="7" y="7" width="10" height="10" rx="1.5" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" focusable="false">
              <rect x="9" y="3" width="6" height="12" rx="3" />
              <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3m-4 0h8" />
            </svg>
          )}
        </span>
        {isListening ? DICTATE_LABEL.LISTENING : DICTATE_LABEL.IDLE}
      </button>
      {isListening ? (
        <span className="idea-dictation-status" role="status">
          {isPreparing ? PREPARING_STATUS : LISTENING_STATUS}
        </span>
      ) : null}
      {error ? (
        <p className="idea-dictation-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
