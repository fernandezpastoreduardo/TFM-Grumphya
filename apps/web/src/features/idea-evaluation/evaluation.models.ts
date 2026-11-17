export type EvaluationStatus =
  | "RECHAZADA"
  | "REQUIERE_REVISION"
  | "SIN_BLOQUEO_EVIDENTE"
  | "IDEA_INSUFICIENTE";

export type EvaluationProcessResult = {
  status: EvaluationStatus;
  score: number | null;
  headline: string;
  message: string;
  safeTitle?: string;
  existingProductExample?: string;
  failedCriteria?: string[];
};

export type SimilarIdeaMatchResult = {
  status: "similar_idea_match";
  headline: string;
  safeTitle: string;
  submissionCount: number;
};

export type SpecialIdeaCaseResult = {
  status: "special_case";
  caseId: "grumphya_equivalent" | "insult" | "too_brief" | "generic_ai_clone";
  title: string;
  message: string;
  action?: { label: "Me atrevo"; href: "/descargate" };
};

export type EvaluationSubmissionResult =
  EvaluationProcessResult | SimilarIdeaMatchResult | SpecialIdeaCaseResult;
