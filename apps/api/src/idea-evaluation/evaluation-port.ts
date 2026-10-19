export const EVALUATION_PORT = Symbol("EVALUATION_PORT");

export type EvaluationPortInput = {
  ideaText: string;
  tone: "soft" | "hard";
  policyVersion: string;
  signal: AbortSignal;
  userId?: string;
};

export interface EvaluationPort {
  evaluate(input: EvaluationPortInput): Promise<unknown>;
}
