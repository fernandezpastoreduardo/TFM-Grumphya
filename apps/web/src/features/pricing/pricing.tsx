import { useState } from "react";
import { useSessionStatus } from "../../infrastructure/auth/use-session-status";
import { recordAnonymousPlanSelection } from "../../shared/utils/anonymous-analytics";
import { PricingView } from "./components/PricingView";
import { ABUSE_CHALLENGE_NOTICE } from "../../shared/constants/abuse-challenge.constants";
import { PLAN_SELECTION_ERROR, type PricingPlan } from "./pricing.constants";
import { createRegistrationIntent } from "./pricing.service";
import "./pricing.scss";

export function Pricing() {
  const session = useSessionStatus();
  const [selectingPlan, setSelectingPlan] = useState<PricingPlan | null>(null);
  const [selectionError, setSelectionError] = useState("");
  const [challengeNotice, setChallengeNotice] = useState("");

  async function selectPlan(plan: PricingPlan) {
    void recordAnonymousPlanSelection(plan);
    setSelectionError("");
    setChallengeNotice("");
    if (session.isAuthenticated === true) {
      window.location.assign("/perfil");
      return;
    }
    if (session.isAuthenticated === null) return;
    setSelectingPlan(plan);
    try {
      if (
        !(await createRegistrationIntent(plan, () =>
          setChallengeNotice(ABUSE_CHALLENGE_NOTICE),
        ))
      ) {
        setSelectionError(PLAN_SELECTION_ERROR);
        return;
      }
      window.location.assign("/crear-cuenta");
    } catch {
      setSelectionError(PLAN_SELECTION_ERROR);
    } finally {
      setChallengeNotice("");
      setSelectingPlan(null);
    }
  }

  return (
    <PricingView
      isAuthenticated={session.isAuthenticated}
      selectingPlan={selectingPlan}
      selectionError={selectionError}
      challengeNotice={challengeNotice}
      onSelectPlan={(plan) => void selectPlan(plan)}
    />
  );
}
