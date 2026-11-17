import { useEffect, useRef, useState } from "react";
import type {
  Plan,
  VerificationStatus,
} from "./registration-verification.models";
import {
  confirmRegistrationPlan,
  resendRegistrationVerification,
  verifyRegistration,
} from "./registration-verification.service";

const RESEND_SUCCESS_MESSAGE =
  "Si hay una verificación pendiente para ese correo, enviaremos otro enlace cuando sea posible.";
const RESEND_ERROR_MESSAGE =
  "No se ha podido procesar la solicitud. Inténtalo más tarde.";

export function useRegistrationVerification() {
  const [status, setStatus] = useState<VerificationStatus>("checking");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [verificationToken, setVerificationToken] = useState("");
  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const verificationTokenRead = useRef(false);

  useEffect(() => {
    if (verificationTokenRead.current) return;
    verificationTokenRead.current = true;
    const token = window.location.hash.slice(1);
    window.history.replaceState(
      {},
      "",
      window.location.pathname + window.location.search,
    );
    if (!token) {
      setStatus("verification_error");
      return;
    }
    setVerificationToken(token);
    setStatus("ready");
  }, []);

  async function verifyEmail() {
    if (!verificationToken || status === "verifying") return;
    setStatus("verifying");
    try {
      const result = await verifyRegistration(verificationToken);
      if (!result) {
        setStatus("verification_error");
        return;
      }
      setPlan(result.plan);
      setVerificationToken("");
      setStatus("verified");
    } catch {
      setStatus("verification_error");
    }
  }

  async function resendVerification() {
    if (resending) return;
    setResending(true);
    setResendMessage("");
    try {
      const sent = await resendRegistrationVerification(resendEmail);
      setResendMessage(sent ? RESEND_SUCCESS_MESSAGE : RESEND_ERROR_MESSAGE);
    } catch {
      setResendMessage(RESEND_ERROR_MESSAGE);
    } finally {
      setResending(false);
    }
  }

  async function confirmSimulatedPlan() {
    if (plan === null) return;
    setStatus("confirming");
    try {
      setStatus(
        (await confirmRegistrationPlan(plan))
          ? "success"
          : "confirmation_error",
      );
    } catch {
      setStatus("confirmation_error");
    }
  }

  return {
    status,
    plan,
    resendEmail,
    resending,
    resendMessage,
    setResendEmail,
    verifyEmail,
    resendVerification,
    confirmSimulatedPlan,
  };
}
