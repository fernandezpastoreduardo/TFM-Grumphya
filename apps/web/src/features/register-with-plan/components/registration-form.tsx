import type { FormEvent } from "react";
import type { Plan, RegistrationField } from "../register-with-plan.models";
import {
  PASSWORD_VISIBILITY_LABEL,
  PENDING_COPY,
  PLAN_NAMES,
} from "../register-with-plan.constants";

type RegistrationFormProps = {
  plan: Plan;
  submitting: boolean;
  submitted: boolean;
  error: string;
  errorField: RegistrationField | null;
  passwordVisible: boolean;
  passwordConfirmationVisible: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onTogglePassword: () => void;
  onTogglePasswordConfirmation: () => void;
};

export function RegistrationForm({
  plan,
  submitting,
  submitted,
  error,
  errorField,
  passwordVisible,
  passwordConfirmationVisible,
  onSubmit,
  onTogglePassword,
  onTogglePasswordConfirmation,
}: RegistrationFormProps) {
  return (
    <div className="auth-layout">
      <section
        className="content-card auth-card"
        aria-labelledby="registration-title"
      >
        <span className="eyebrow">Plan seleccionado: {PLAN_NAMES[plan]}</span>
        <h2 id="registration-title">Vamos a ponerle nombre a la cuenta</h2>
        <form
          className="registration-form"
          onSubmit={onSubmit}
          noValidate
          aria-busy={submitting}
        >
          <div className="registration-field">
            <label htmlFor="registration-email">Correo electrónico</label>
            <input
              id="registration-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              aria-invalid={errorField === "email"}
              aria-describedby={
                errorField === "email" ? "registration-error" : undefined
              }
            />
          </div>
          <div className="registration-field">
            <label htmlFor="registration-username">Nombre de usuario</label>
            <input
              id="registration-username"
              name="username"
              autoComplete="username"
              required
              minLength={3}
              maxLength={30}
              aria-invalid={errorField === "username"}
              aria-describedby={
                errorField === "username" ? "registration-error" : undefined
              }
            />
          </div>
          <div className="registration-field">
            <label htmlFor="registration-password">Contraseña</label>
            <div className="registration-password-field">
              <input
                className="registration-password-input"
                id="registration-password"
                name="password"
                type={passwordVisible ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                aria-describedby={
                  errorField === "password"
                    ? "registration-error registration-password-help"
                    : "registration-password-help"
                }
                aria-invalid={errorField === "password"}
              />
              <button
                className="registration-password-toggle"
                type="button"
                aria-controls="registration-password"
                aria-label={
                  passwordVisible
                    ? PASSWORD_VISIBILITY_LABEL.HIDE
                    : PASSWORD_VISIBILITY_LABEL.SHOW
                }
                onClick={onTogglePassword}
              >
                {passwordVisible ? "Ocultar" : "Mostrar"}
              </button>
            </div>
            <p id="registration-password-help">
              Mínimo 12 caracteres, con mayúscula, minúscula, número y carácter
              especial.
            </p>
          </div>
          <div className="registration-field">
            <label htmlFor="registration-password-confirmation">
              Repite la contraseña
            </label>
            <div className="registration-password-field">
              <input
                className="registration-password-input"
                id="registration-password-confirmation"
                name="passwordConfirmation"
                type={passwordConfirmationVisible ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                aria-describedby={
                  errorField === "passwordConfirmation"
                    ? "registration-error"
                    : undefined
                }
                aria-invalid={errorField === "passwordConfirmation"}
              />
              <button
                className="registration-password-toggle"
                type="button"
                aria-controls="registration-password-confirmation"
                aria-label={
                  passwordConfirmationVisible
                    ? PASSWORD_VISIBILITY_LABEL.HIDE
                    : PASSWORD_VISIBILITY_LABEL.SHOW
                }
                onClick={onTogglePasswordConfirmation}
              >
                {passwordConfirmationVisible ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </div>
          <label
            className="registration-privacy"
            htmlFor="privacy-policy-acknowledged"
          >
            <input
              id="privacy-policy-acknowledged"
              name="privacyPolicyAcknowledged"
              type="checkbox"
              required
              aria-invalid={errorField === "privacyPolicyAcknowledged"}
              aria-describedby={
                errorField === "privacyPolicyAcknowledged"
                  ? "registration-error"
                  : undefined
              }
            />
            <span>
              He leído la{" "}
              <a href="/politica-de-privacidad">política de privacidad</a>.{" "}
              <span className="registration-terms-link">
                Consulta también los{" "}
                <a href="/terminos-y-condiciones">términos y condiciones</a>.
              </span>
            </span>
          </label>
          {error ? (
            <p
              className="registration-error"
              id="registration-error"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          <button
            className="button-primary"
            type="submit"
            disabled={submitting || submitted}
          >
            {submitting
              ? "Dándote de alta…"
              : submitted
                ? "Alta enviada"
                : "Crear cuenta y verificar correo"}{" "}
            <span aria-hidden="true">↗</span>
          </button>
        </form>
        <p className="auth-privacy">{PENDING_COPY}</p>
      </section>
      <aside className="auth-aside">
        <div
          className="auth-creature auth-creature-register"
          aria-hidden="true"
        />
        <h2>Un mes. Sin renovaciones automáticas.</h2>
        <p>
          Si quieres otro, vuelves a contratar. No tendrás que cancelar nada;
          aquí no ponemos trampas de calendario.
        </p>
      </aside>
    </div>
  );
}
