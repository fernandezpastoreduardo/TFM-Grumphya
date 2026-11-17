import type { ReactNode } from "react";

export type EvaluationDialogProps = {
  open: boolean;
  isEvaluating: boolean;
  onClose: () => void;
  children: ReactNode;
};
