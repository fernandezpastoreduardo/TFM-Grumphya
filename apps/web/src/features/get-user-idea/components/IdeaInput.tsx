import { MAX_IDEA_LENGTH } from "../idea-input-rules";
import { TranscriptUserIdea } from "../../transcript-user-idea/transcript-user-idea";

type IdeaInputProps = {
  value: string;
  onChange: (value: string) => void;
  onDictatedText: (transcript: string) => void;
  errorMessage?: string;
};

const IDEA_INPUT_LABEL = "¿Qué aplicación tienes en mente?";
const IDEA_INPUT_HELP =
  "Quién la usaría, qué le duele y qué haría la app. Lo básico, vamos.";
const INPUT_ID = "idea-text";
const HELP_ID = "idea-text-help";
const ERROR_ID = "idea-text-error";

export function IdeaInput({
  value,
  onChange,
  onDictatedText,
  errorMessage,
}: IdeaInputProps) {
  const describedBy = errorMessage ? `${HELP_ID} ${ERROR_ID}` : HELP_ID;

  return (
    <div className="idea-input-field">
      <label className="idea-input-label" htmlFor={INPUT_ID}>
        {IDEA_INPUT_LABEL}
      </label>
      <div className="idea-input-area">
        <textarea
          id={INPUT_ID}
          name="ideaText"
          className="idea-input-textarea"
          rows={5}
          maxLength={MAX_IDEA_LENGTH}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          placeholder="Pega aquí tu idea. Vamos a ver qué agujeros trae."
          aria-describedby={describedBy}
          aria-invalid={Boolean(errorMessage)}
        />
        <TranscriptUserIdea onTranscript={onDictatedText} />
      </div>
      <div className="idea-input-meta">
        <span id={HELP_ID}>{IDEA_INPUT_HELP}</span>
        <span aria-live="polite">
          {value.length}/{MAX_IDEA_LENGTH}
        </span>
      </div>
      {errorMessage ? (
        <p className="idea-input-error" id={ERROR_ID} role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
