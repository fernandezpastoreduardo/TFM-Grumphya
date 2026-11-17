import type { ReactNode } from "react";

export type HomeEvaluationRequest = {
  ideaText: string;
  tone: "soft" | "hard";
};

export type EvaluationSlots = {
  workspace: ReactNode;
  feedback: ReactNode;
};
