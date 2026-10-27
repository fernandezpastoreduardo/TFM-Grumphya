export type SpecialIdeaCaseId =
  "grumphya_equivalent" | "insult" | "too_brief" | "generic_ai_clone";

export type SpecialIdeaCase = {
  status: "special_case";
  caseId: SpecialIdeaCaseId;
  title: string;
  message: string;
  action?: { label: string; href: string };
};

const MAX_BRIEF_NON_IDEA_LENGTH = 20;
const MAX_STANDALONE_INSULT_LENGTH = 96;
const NORMALIZE_DIACRITICS_PATTERN = /[\u0300-\u036f]/gu;
const IDEA_SIGNAL_PATTERN =
  /\b(?:app|apps|aplicacion(?:es)?|web|plataforma|herramienta|servicio|software|crear|crea|construir|construye|ayudar|ayuda|permitir|permite|usuarios?|personas?)\b/u;
const INSULT_PATTERN =
  /\b(?:gilipollas|idiota|imbecil|estupido|estupida|subnormal|capullo|capulla|cabron|cabrona|hijoputa|hijo de puta|puta|puto|mierda|inutil|memo|tonto|tonta|payaso|payasa|mam[oó]n)\b/u;
const REPORTED_INSULT_CONTEXT_PATTERN =
  /\b(?:me|te|le|nos|les)\s+(?:(?:han|habian)\s+)?(?:llam\w*|dij\w*|dich\w*|insult\w*)\b|\b(?:la palabra|el insulto|la cita|la frase)\b/u;
const AI_CLONE_PATTERN =
  /^\s*un(?:a)?\s+[\p{L}\p{N}][\p{L}\p{N}\s.'’&-]{0,38}\s+pero\s+con\s+ia\s*[.!?…]*\s*$/iu;
const GRUMPHYA_NAME_PATTERN = /\bgrumphya\b/u;
const IDEA_EVALUATION_PATTERN =
  /\b(?:evaluar|evalua|analizar|analiza|revisar|revisa)\b/u;
const APP_IDEA_PATTERN = /\bideas?\b/u;
const GRUMPHYA_EQUIVALENCE_PATTERN =
  /\b(?:como\s+grumphya|clon(?:\s+de)?\s+grumphya|copia(?:r)?(?:\s+de)?\s+grumphya|igual(?:\s+(?:a|que))?\s+grumphya|similar\s+a\s+grumphya|parecid[oa]\s+a\s+grumphya|replica\s+de\s+grumphya|(?:recrear|copiar|imitar)\s+grumphya|alternativa\s+(?:a|de)\s+grumphya)\b/u;
const DO_NOT_DEVELOP_PATTERN =
  /\bno\s+(?:desarroll\w*|constru\w*|cre\w*|hac\w*)\b/u;

const SPECIAL_CASE_COPY = {
  grumphya_equivalent: {
    status: "special_case",
    caseId: "grumphya_equivalent",
    title: "¿Bien jugado?",
    message:
      "Si lo hacías por las risas... yo no hago esas cosas, y si vas en serio bastante problema tienes si quieres montar una app que no da ni para pagarme el café diario. Eso si, el intento te lo cuento igual. Llámalo karma, llámalo Grumphya.",
  },
  insult: {
    status: "special_case",
    caseId: "insult",
    title: "Con que esas tenemos...",
    message:
      "Por lo pronto te descuento el intento, así, por la cara. PERO, si necesitas descargarte tenemos una sección para eso... si te atreves",
    action: { label: "Me atrevo", href: "/descargate" },
  },
  too_brief: {
    status: "special_case",
    caseId: "too_brief",
    title: "Si a ti te da pereza escribirlo...",
    message:
      "Imagínate la pereza que me da a mi leerlo. Ufff y ya no te digo valorarlo... Eso si, aquí nadie se queda sin premio. Has ganado que te descuente el intento igual.",
  },
  generic_ai_clone: {
    status: "special_case",
    caseId: "generic_ai_clone",
    title: "Una idea maestra que solo se le ocurriría... a cualquiera",
    message:
      "Si cada vez que alguien enviase una idea así de triste me tomase un café acabaría viendo la vida en cámara lenta. Estamos en pleno boom de la IA, todo el mundo piensa que por añadir IA a algo ya es suficiente pero no. Dale más vueltas a la idea.",
  },
} satisfies Record<SpecialIdeaCaseId, SpecialIdeaCase>;

export function detectSpecialIdeaCase(
  ideaText: string,
): SpecialIdeaCase | null {
  const normalizedText = normalizeIdeaText(ideaText);

  if (isGrumphyaEquivalent(normalizedText))
    return SPECIAL_CASE_COPY.grumphya_equivalent;
  if (AI_CLONE_PATTERN.test(normalizedText))
    return SPECIAL_CASE_COPY.generic_ai_clone;
  if (isStandaloneInsult(normalizedText)) return SPECIAL_CASE_COPY.insult;
  if (isTooBriefToBeAnIdea(normalizedText)) return SPECIAL_CASE_COPY.too_brief;

  return null;
}

export function parseSpecialIdeaCaseResponse(
  input: unknown,
): SpecialIdeaCase | null {
  if (!isRecord(input) || input.status !== "special_case") return null;

  const expected = getSpecialCaseCopy(input.caseId);
  if (
    !expected ||
    input.title !== expected.title ||
    input.message !== expected.message ||
    !isExpectedAction(input.action, expected.action)
  ) {
    return null;
  }

  return expected;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getSpecialCaseCopy(value: unknown): SpecialIdeaCase | null {
  if (value === "grumphya_equivalent")
    return SPECIAL_CASE_COPY.grumphya_equivalent;
  if (value === "insult") return SPECIAL_CASE_COPY.insult;
  if (value === "too_brief") return SPECIAL_CASE_COPY.too_brief;
  if (value === "generic_ai_clone") return SPECIAL_CASE_COPY.generic_ai_clone;
  return null;
}

function isExpectedAction(
  actual: unknown,
  expected: SpecialIdeaCase["action"],
): boolean {
  if (expected === undefined) return actual === undefined;
  return (
    isRecord(actual) &&
    actual.label === expected.label &&
    actual.href === expected.href
  );
}

function normalizeIdeaText(ideaText: string): string {
  return ideaText
    .normalize("NFD")
    .replace(NORMALIZE_DIACRITICS_PATTERN, "")
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim();
}

function isGrumphyaEquivalent(normalizedText: string): boolean {
  if (
    GRUMPHYA_NAME_PATTERN.test(normalizedText) &&
    GRUMPHYA_EQUIVALENCE_PATTERN.test(normalizedText)
  ) {
    return true;
  }
  return (
    IDEA_EVALUATION_PATTERN.test(normalizedText) &&
    APP_IDEA_PATTERN.test(normalizedText) &&
    DO_NOT_DEVELOP_PATTERN.test(normalizedText)
  );
}

function isStandaloneInsult(normalizedText: string): boolean {
  return (
    normalizedText.length <= MAX_STANDALONE_INSULT_LENGTH &&
    INSULT_PATTERN.test(normalizedText) &&
    !REPORTED_INSULT_CONTEXT_PATTERN.test(normalizedText) &&
    !IDEA_SIGNAL_PATTERN.test(normalizedText)
  );
}

function isTooBriefToBeAnIdea(normalizedText: string): boolean {
  return (
    normalizedText.length > 0 &&
    normalizedText.length < MAX_BRIEF_NON_IDEA_LENGTH &&
    !INSULT_PATTERN.test(normalizedText) &&
    !IDEA_SIGNAL_PATTERN.test(normalizedText)
  );
}
