import { useEffect, useRef, useState, type FormEvent } from "react";
import { isEmailAddress } from "../../shared/utils/email-address";
import { RegistrationForm } from "./components/registration-form";
import {
  LoadingSkeleton,
  SkeletonBlock,
} from "../../shared/components/loading-skeleton";
import type { Plan, RegistrationField } from "./register-with-plan.models";
import {
  EMAIL_ERROR,
  GENERIC_ERROR,
  PASSWORD_CONFIRMATION_ERROR,
  PASSWORD_ERROR,
  PENDING_COPY,
  PRIVACY_ERROR,
  STRONG_PASSWORD_ERROR,
  USERNAME_ERROR,
  USERNAME_PATTERN,
} from "./register-with-plan.constants";
import { isStrongPassword } from "./register-with-plan.validation";
import { ABUSE_CHALLENGE_NOTICE } from "../../shared/constants/abuse-challenge.constants";
import {
  loadSelectedPlan,
  resendRegistrationVerification,
  submitRegistration as submitRegistrationRequest,
} from "./register-with-plan.service";
import "./../../shared/styles/account.scss";
import "./register-with-plan.scss";

export function RegisterWithPlan() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [registeredEmail, setRegisteredEmail] = useState("");
  const submissionLocked = useRef(false);
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState<RegistrationField | null>(null);
  const [challengeNotice, setChallengeNotice] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [passwordConfirmationVisible, setPasswordConfirmationVisible] =
    useState(false);

  useEffect(() => {
    let active = true;
    loadSelectedPlan()
      .then((selectedPlan) => {
        if (active) setPlan(selectedPlan);
      })
      .catch(() => {
        if (active) setPlan(null);
      })
      .finally(() => {
        if (active) setLoadingPlan(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionLocked.current || submitted) return;
    setError("");
    setErrorField(null);
    setChallengeNotice("");
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const username = String(formData.get("username") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const passwordConfirmation = String(
      formData.get("passwordConfirmation") ?? "",
    );
    const privacyPolicyAcknowledged =
      formData.get("privacyPolicyAcknowledged") === "on";

    if (!isEmailAddress(email)) {
      setError(EMAIL_ERROR);
      setErrorField("email");
      return;
    }
    if (!USERNAME_PATTERN.test(username.normalize("NFC"))) {
      setError(USERNAME_ERROR);
      setErrorField("username");
      return;
    }
    if (!isStrongPassword(password)) {
      setError(password.length < 12 ? PASSWORD_ERROR : STRONG_PASSWORD_ERROR);
      setErrorField("password");
      return;
    }
    if (password !== passwordConfirmation) {
      setError(PASSWORD_CONFIRMATION_ERROR);
      setErrorField("passwordConfirmation");
      return;
    }
    if (!privacyPolicyAcknowledged) {
      setError(PRIVACY_ERROR);
      setErrorField("privacyPolicyAcknowledged");
      return;
    }

    submissionLocked.current = true;
    setSubmitted(true);
    setSubmitting(true);
    try {
      const result = await submitRegistrationRequest(
        {
          email,
          username,
          password,
        },
        () => setChallengeNotice(ABUSE_CHALLENGE_NOTICE),
      );
      if (result.pending) {
        setRegisteredEmail(email);
        setVerificationPending(true);
        return;
      }
      setError(result.message ?? GENERIC_ERROR);
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setChallengeNotice("");
      setSubmitting(false);
    }
  }

  async function resendVerification() {
    if (resending || !registeredEmail) return;
    setResending(true);
    setResendMessage("");
    try {
      if (
        await resendRegistrationVerification(registeredEmail, () =>
          setChallengeNotice(ABUSE_CHALLENGE_NOTICE),
        )
      ) {
        setResendMessage(
          "Si hay una verificación pendiente para ese correo, enviaremos otro enlace cuando sea posible.",
        );
      } else {
        setResendMessage(GENERIC_ERROR);
      }
    } catch {
      setResendMessage(GENERIC_ERROR);
    } finally {
      setChallengeNotice("");
      setResending(false);
    }
  }

  if (loadingPlan) {
    return (
      <LoadingSkeleton
        label="Comprobando el plan seleccionado"
        className="registration-skeleton"
      >
        <div className="content-card auth-card registration-skeleton-form">
          <SkeletonBlock className="skeleton-registration-label" />
          <SkeletonBlock className="skeleton-registration-title" />
          {Array.from({ length: 3 }, (_, index) => (
            <div className="registration-skeleton-field" key={index}>
              <SkeletonBlock className="skeleton-registration-label" />
              <SkeletonBlock className="skeleton-registration-input" />
            </div>
          ))}
          <SkeletonBlock className="skeleton-registration-button" />
        </div>
      </LoadingSkeleton>
    );
  }
  if (plan === null) {
    return (
      <section
        className="content-card account-plan-required"
        aria-labelledby="plan-required-title"
      >
        <span className="eyebrow">Primero, una decisión</span>
        <h2 id="plan-required-title">
          Elige un plan antes de crear la cuenta.
        </h2>
        <p>
          El alta solo está disponible al seleccionar Iluminado o Faltón. El
          plan gratis no necesita registro.
        </p>
        <a className="button-primary" href="/precios">
          Ver los planes <span aria-hidden="true">↗</span>
        </a>
      </section>
    );
  }
  if (verificationPending) {
    return (
      <section
        className="content-card registration-pending"
        aria-labelledby="registration-pending-title"
      >
        <span className="eyebrow">Un paso más</span>
        <h2 id="registration-pending-title">Revisa tu correo</h2>
        <p role="status">{PENDING_COPY}</p>
        <button
          className="button-primary"
          type="button"
          onClick={() => void resendVerification()}
          disabled={resending}
        >
          {resending ? "Solicitando…" : "Solicitar otro enlace"}
        </button>
        {resendMessage ? <p role="status">{resendMessage}</p> : null}
        {challengeNotice ? <p role="status">{challengeNotice}</p> : null}
      </section>
    );
  }
  return (
    <>
      <RegistrationForm
        plan={plan}
        submitting={submitting}
        submitted={submitted}
        error={error}
        challengeNotice={challengeNotice}
        errorField={errorField}
        passwordVisible={passwordVisible}
        passwordConfirmationVisible={passwordConfirmationVisible}
        onSubmit={submitRegistration}
        onTogglePassword={() => setPasswordVisible((visible) => !visible)}
        onTogglePasswordConfirmation={() =>
          setPasswordConfirmationVisible((visible) => !visible)
        }
      />
    </>
  );
}
