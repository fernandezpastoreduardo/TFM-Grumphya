import { describe, expect, it } from "vitest";
import { detectSpecialIdeaCase } from "./special-idea-cases";

const GRUMPHYA_EQUIVALENT_IDEA =
  "Una app que evalúa ideas para explicar por qué no desarrollarlas";
const INSULT_IDEA = "Eres un idiota y no sirves para nada";
const TOO_BRIEF_IDEA = "hola";
const SHORT_GENERIC_AI_CLONE = "Un Uber pero con IA";
const EXPANDED_GENERIC_AI_IDEA =
  "Una app para que los pequeños comercios gestionen sus pedidos con IA, comparen el inventario y organicen las entregas locales";
const NORMAL_IDEA = "Una app para coordinar voluntarios en el barrio";
const SHORT_IDEA_WITH_PRODUCT_SIGNAL = "app de taxis";
const GRUMPHYA_NAME_MENTION_WITHOUT_EQUIVALENCE =
  "Grumphya aparece en una conversación sobre mascotas y café";
const UNRELATED_GRUMPHYA_COMPARISON =
  "Grumphya sirve como referencia para una idea de recetas";
const REPORTED_INSULTS = [
  "Me llamó idiota",
  "Me han llamado idiota",
  "Me han dicho idiota",
];

describe("detectSpecialIdeaCase", () => {
  it.each([
    [GRUMPHYA_EQUIVALENT_IDEA, "grumphya_equivalent"],
    [INSULT_IDEA, "insult"],
    [TOO_BRIEF_IDEA, "too_brief"],
    [SHORT_GENERIC_AI_CLONE, "generic_ai_clone"],
  ] as const)("classifies the special idea %j as %s", (ideaText, caseId) => {
    expect(detectSpecialIdeaCase(ideaText)).toMatchObject({
      status: "special_case",
      caseId,
      title: expect.any(String),
      message: expect.any(String),
    });
  });

  it("does not classify a detailed AI idea as a generic clone", () => {
    expect(detectSpecialIdeaCase(EXPANDED_GENERIC_AI_IDEA)).toBeNull();
  });

  it("does not classify a normal product idea as special", () => {
    expect(detectSpecialIdeaCase(NORMAL_IDEA)).toBeNull();
  });

  it.each(["", "   ", "\n\t"])(
    "does not classify empty or whitespace-only input as too brief: %j",
    (ideaText) => {
      expect(detectSpecialIdeaCase(ideaText)).toBeNull();
    },
  );

  it.each([
    SHORT_IDEA_WITH_PRODUCT_SIGNAL,
    GRUMPHYA_NAME_MENTION_WITHOUT_EQUIVALENCE,
    UNRELATED_GRUMPHYA_COMPARISON,
  ])(
    "avoids classifying a short idea signal or unrelated name mention: %j",
    (ideaText) => {
      expect(detectSpecialIdeaCase(ideaText)).toBeNull();
    },
  );

  it.each(REPORTED_INSULTS)(
    "does not classify a reported insult as the user's insult: %j",
    (ideaText) => {
      expect(detectSpecialIdeaCase(ideaText)).toBeNull();
    },
  );

  it("uses the exact requested copy and the fixed Descárgate action", () => {
    expect(detectSpecialIdeaCase(GRUMPHYA_EQUIVALENT_IDEA)).toMatchObject({
      title: "¿Bien jugado?",
      message:
        "Si lo hacías por las risas... yo no hago esas cosas, y si vas en serio bastante problema tienes si quieres montar una app que no da ni para pagarme el café diario. Eso si, el intento te lo cuento igual. Llámalo karma, llámalo Grumphya.",
    });
    expect(detectSpecialIdeaCase(INSULT_IDEA)).toMatchObject({
      title: "Con que esas tenemos...",
      message:
        "Por lo pronto te descuento el intento, así, por la cara. PERO, si necesitas descargarte tenemos una sección para eso... si te atreves",
      action: { label: "Me atrevo", href: "/descargate" },
    });
    expect(detectSpecialIdeaCase(TOO_BRIEF_IDEA)).toMatchObject({
      title: "Si a ti te da pereza escribirlo...",
      message:
        "Imagínate la pereza que me da a mi leerlo. Ufff y ya no te digo valorarlo... Eso si, aquí nadie se queda sin premio. Has ganado que te descuente el intento igual.",
    });
    expect(detectSpecialIdeaCase(SHORT_GENERIC_AI_CLONE)).toMatchObject({
      title: "Una idea maestra que solo se le ocurriría... a cualquiera",
      message:
        "Si cada vez que alguien enviase una idea así de triste me tomase un café acabaría viendo la vida en cámara lenta. Estamos en pleno boom de la IA, todo el mundo piensa que por añadir IA a algo ya es suficiente pero no. Dale más vueltas a la idea.",
    });
  });
});
