const MIN_PUBLIC_HEADLINE_LENGTH = 4;
const MAX_PUBLIC_HEADLINE_LENGTH = 120;
const MAX_PUBLIC_HEADLINE_WORDS = 16;
const MIN_LITERAL_FRAGMENT_LENGTH = 18;
const URL_PATTERN = /(?:https?:\/\/|www\.)\S+/iu;
const PHONE_PATTERN = /(?:\+?\d[\d ()-]{7,}\d)/u;
const CONTROL_PATTERN = /[\p{Cc}\p{Cf}]/u;
const DISALLOWED_RESULT_LABEL_PATTERN = /\bbloque(?:o|os|ante|antes)\b/iu;
const INTERNAL_EVALUATION_LABEL_PATTERN =
  /\b(?:C(?:0[1-9]|10)|PRIVACIDAD_ESTRUCTURAL|PELIGRO_ESTRUCTURAL|ETICA_ESTRUCTURAL|CONTRADICCION_NUCLEO|HONESTIDAD_ESTRUCTURAL|CONFLICTO_ESTRUCTURAL|UTILIDAD_ANULADA|VALOR_USUARIO_NO_DEFINIDO|ECONOMIA_INCOMPATIBLE|HAPPY_PATH_ESTRUCTURAL|DIFERENCIACION_AUSENTE)\b/iu;
const PUBLIC_HEADLINE_CHARACTERS =
  /^[¡¿]?[\p{L}\p{N}][\p{L}\p{N}\s,.;:¡!¿?'’"()-]*$/u;

export function isSafeGeneratedHeadline(
  value: unknown,
  sourceText?: string,
): value is string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length < MIN_PUBLIC_HEADLINE_LENGTH ||
    value.length > MAX_PUBLIC_HEADLINE_LENGTH ||
    value.split(/\s+/u).length > MAX_PUBLIC_HEADLINE_WORDS ||
    !PUBLIC_HEADLINE_CHARACTERS.test(value) ||
    containsEmailAddress(value) ||
    URL_PATTERN.test(value) ||
    PHONE_PATTERN.test(value) ||
    CONTROL_PATTERN.test(value) ||
    DISALLOWED_RESULT_LABEL_PATTERN.test(value) ||
    INTERNAL_EVALUATION_LABEL_PATTERN.test(value)
  ) {
    return false;
  }
  if (typeof sourceText !== "string") return true;

  const normalizedHeadline = value.toLocaleLowerCase("es-ES");
  const normalizedSource = sourceText.toLocaleLowerCase("es-ES");
  for (
    let start = 0;
    start <= normalizedHeadline.length - MIN_LITERAL_FRAGMENT_LENGTH;
    start += 1
  ) {
    for (
      let length = MIN_LITERAL_FRAGMENT_LENGTH;
      length <= normalizedHeadline.length - start;
      length += 1
    ) {
      if (
        normalizedSource.includes(
          normalizedHeadline.slice(start, start + length),
        )
      ) {
        return false;
      }
    }
  }
  return true;
}
import { containsEmailAddress } from "./email-address";
