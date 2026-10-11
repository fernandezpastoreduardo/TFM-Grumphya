export type IdeaTone = "soft" | "hard";

export type GetUserIdeaRequest = {
  ideaText: string;
  tone: IdeaTone;
};

export type IdeaTextValidation =
  | { valid: true; value: string }
  | {
      valid: false;
      reason: "not_text" | "empty" | "too_short" | "too_long";
    };

export type InvalidIdeaTextReason = Extract<
  IdeaTextValidation,
  { valid: false }
>["reason"];
