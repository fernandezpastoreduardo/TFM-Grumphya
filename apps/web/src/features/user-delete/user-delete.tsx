import { useEffect, useRef, useState } from "react";
import {
  authenticatedFetch,
  clearAccessToken,
} from "../../infrastructure/auth/session";
import "./user-delete.scss";

const DELETE_ERROR =
  "No se ha podido completar la baja. Tu cuenta sigue activa; inténtalo de nuevo.";
const SESSION_REQUIRED_ERROR =
  "Tu sesión ya no está activa. Entra en tu cuenta para continuar.";
const BUTTON_TEXT = {
  TRIGGER: "Darme de baja y BORRAR MI CUENTA",
  CANCEL: "Cancelar",
  CONFIRM: "Confirmo que quiero darme de baja",
  DELETING: "Eliminando tu cuenta…",
} as const;

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function UserDelete({ onDeleted }: { onDeleted?: () => void } = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !isOpen) return;
    if (!dialog.open) openDialog(dialog);
    cancelButtonRef.current?.focus();
  }, [isOpen]);

  function closeDialog() {
    if (isDeleting) return;
    if (dialogRef.current) closeNativeDialog(dialogRef.current);
    setIsOpen(false);
    setError("");
  }

  async function deleteAccount() {
    setIsDeleting(true);
    setError("");
    try {
      const response = await authenticatedFetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const result: unknown = await readJson(response);
      if (!response.ok || !isDeletedResult(result)) {
        setError(
          response.status === 401 ? SESSION_REQUIRED_ERROR : DELETE_ERROR,
        );
        return;
      }
      clearAccessToken();
      if (onDeleted) onDeleted();
      else window.location.assign("/");
    } catch {
      setError(DELETE_ERROR);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <section
      className="profile-delete-section"
      aria-labelledby="delete-account-title"
    >
      <div>
        <span className="eyebrow">Una decisión definitiva</span>
        <h2 id="delete-account-title">¿Quieres dejar Grumphya?</h2>
        <p>
          Puedes borrar tu cuenta y todos sus datos desde aquí. La baja es
          inmediata.
        </p>
      </div>
      <button
        className="profile-delete-trigger"
        type="button"
        onClick={() => setIsOpen(true)}
      >
        {BUTTON_TEXT.TRIGGER}
      </button>
      {isOpen ? (
        <dialog
          ref={dialogRef}
          className="profile-delete-dialog"
          aria-labelledby="delete-dialog-title"
          aria-describedby="delete-dialog-description"
          onCancel={(event) => {
            event.preventDefault();
            closeDialog();
          }}
          onClose={() => setIsOpen(false)}
        >
          <span className="eyebrow">Baja inmediata</span>
          <h2 id="delete-dialog-title">Esta acción no se puede deshacer</h2>
          <p id="delete-dialog-description">
            La baja es inmediata e irreversible. En cuanto confirmes, borraremos
            tu usuario, tus ideas aprobadas y los intentos restantes asociados a
            tu cuenta. También se eliminarán tus planes y sesiones. El borrado
            es físico.
          </p>
          {error ? <p role="alert">{error}</p> : null}
          <div className="profile-delete-actions">
            <button
              ref={cancelButtonRef}
              className="button-secondary"
              type="button"
              disabled={isDeleting}
              onClick={closeDialog}
            >
              {BUTTON_TEXT.CANCEL}
            </button>
            <button
              className="profile-delete-confirm"
              type="button"
              disabled={isDeleting}
              onClick={() => void deleteAccount()}
            >
              {getConfirmButtonText(isDeleting)}
            </button>
          </div>
        </dialog>
      ) : null}
    </section>
  );
}

function isDeletedResult(value: unknown): value is { deleted: true } {
  return (
    typeof value === "object" &&
    value !== null &&
    "deleted" in value &&
    value.deleted === true
  );
}

function getConfirmButtonText(isDeleting: boolean): string {
  if (isDeleting) return BUTTON_TEXT.DELETING;
  return BUTTON_TEXT.CONFIRM;
}

function openDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeNativeDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}
