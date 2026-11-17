export type ErrorPageStatus = "404" | "429" | "500";

export type ErrorCopy = {
  label: string;
  headline: string;
  description: string;
  scene: string;
  primary: string;
  secondary?: string;
};
