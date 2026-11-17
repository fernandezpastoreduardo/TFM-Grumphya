import { useEffect, useState } from "react";
import { getAccreditation } from "../../shared/accreditation-verification";
import type { VerificationState } from "./accreditation-verification.models";

export function useAccreditationVerification() {
  const [state, setState] = useState<VerificationState>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    getAccreditation()
      .then((record) => {
        if (active) setState({ kind: "success", record });
      })
      .catch(() => {
        if (active) setState({ kind: "error" });
      });
    return () => {
      active = false;
    };
  }, []);

  return state;
}
