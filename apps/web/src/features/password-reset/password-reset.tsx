import { useEffect, useState, type FormEvent } from "react";
import "../../shared/styles/account.scss";
import "./password-reset.scss";
import {
  GENERIC_NOTICE,
  INVALID_LINK_NOTICE,
  PASSWORD_POLICY_NOTICE,
  SUCCESS_NOTICE,
} from "./password-reset.constants";
import { PasswordResetView } from "./components/PasswordResetView";
import {
  completePasswordReset,
  requestPasswordReset,
} from "./password-reset.service";
import { hasErrorCode, readResetToken } from "./password-reset.validation";

export function PasswordReset() {
  const [token] = useState(readResetToken);
  useEffect(() => {
    if (token && window.location.hash === "#" + token) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    }
  }, [token]);
  const [notice, setNotice] = useState("");
  const [finished, setFinished] = useState(false);
  const [isResetLinkInvalid, setIsResetLinkInvalid] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setNotice("");
    try {
      await requestPasswordReset(
        new FormData(event.currentTarget).get("email") ?? "",
      );
      setNotice(GENERIC_NOTICE);
    } catch {
      setNotice("No se ha podido procesar la solicitud. Inténtalo de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  async function completeReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !token) return;
    const form = new FormData(event.currentTarget);
    const password = form.get("password");
    const confirmation = form.get("password-confirmation");
    if (password !== confirmation) {
      setNotice("Las contraseñas no coinciden.");
      return;
    }
    setSubmitting(true);
    setNotice("");
    try {
      const result = await completePasswordReset(token, password ?? "");
      if (!result.ok) {
        if (hasErrorCode(result.body, "INVALID_RESET_LINK")) {
          setIsResetLinkInvalid(true);
        }
        setNotice(
          hasErrorCode(result.body, "INVALID_PASSWORD")
            ? PASSWORD_POLICY_NOTICE
            : INVALID_LINK_NOTICE,
        );
        return;
      }
      setFinished(true);
      setNotice(SUCCESS_NOTICE);
    } catch {
      setNotice("No se ha podido guardar la contraseña. Inténtalo de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PasswordResetView
      token={token}
      finished={finished}
      invalidLink={isResetLinkInvalid}
      notice={notice}
      submitting={submitting}
      onRequest={(event) => void requestReset(event)}
      onComplete={(event) => void completeReset(event)}
    />
  );
}
