import { useState, type FormEvent } from "react";
import "../../shared/styles/account.scss";
import "./authentication-page.scss";
import {
  notifySessionChanged,
  setAccessToken,
} from "../../infrastructure/auth/session";
import { AuthenticationForm } from "./components/AuthenticationForm";
import { LOGIN_ERROR } from "./authentication.constants";
import { login } from "./authentication.service";

export function AuthenticationPage() {
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setNotice("");
    try {
      const result = await login(new FormData(event.currentTarget), setNotice);
      setAccessToken(result.accessToken);
      notifySessionChanged();
      window.location.assign(
        result.role === "admin" ? "/panel-control" : "/perfil",
      );
    } catch {
      setNotice(LOGIN_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthenticationForm
      submitting={submitting}
      notice={notice}
      onSubmit={(event) => void submitAuth(event)}
    />
  );
}
