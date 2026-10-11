import { useEffect, useRef, useState } from "react";
import {
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
    "Este navegador no trae dictado por voz. Puedes escribirla, qué remedio.",
  "permission-denied":
    "No hay permiso al micrófono. Puedes escribirla; no hace falta negociar con el navegador.",
  "no-speech": "No he oído nada. Prueba otra vez o escribe la idea.",
  failed:
    "El dictado ha fallado. Tu texto sigue aquí; puedes escribir sin dramas.",
};

export function TranscriptUserIdea({ onTranscript }: TranscriptUserIdeaProps) {
  const [isListening, setIsListening] = useState(false);
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
    setError(ERROR_MESSAGES[reason]);
  }

  function handleDictation() {
    setError("");
    if (isListening) {
      sessionRef.current?.stop();
      sessionRef.current = null;
      setIsListening(false);
      return;
    }

    setIsListening(true);
    sessionRef.current = startSpeechToText({
      onTranscript,
      onError: handleError,
      onEnd: () => {
        sessionRef.current = null;
        setIsListening(false);
      },
    });
    if (!sessionRef.current) setIsListening(false);
  }

  return (
    <div className="idea-dictation">
      <button
        className="idea-dictation-button"
        type="button"
        aria-pressed={isListening}
        onClick={handleDictation}
      >
        <span aria-hidden="true">{isListening ? "■" : "🎙"}</span>
        {isListening ? DICTATE_LABEL.LISTENING : DICTATE_LABEL.IDLE}
      </button>
      {isListening ? (
        <span className="idea-dictation-status" role="status">
          Escuchando. Suelta la idea; luego podrás corregir la transcripción.
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
