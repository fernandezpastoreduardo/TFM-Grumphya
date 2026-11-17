import { useEffect, useRef, useState } from "react";
import { clearAccessToken } from "../../infrastructure/auth/session";
import {
  BUTTON_TEXT,
  DELETE_ERROR,
  SESSION_REQUIRED_ERROR,
} from "./user-delete.constants";
import { deleteAccount as deleteUserAccount } from "./user-delete.service";
import {
  closeDeleteDialog,
  getConfirmButtonText,
  openDeleteDialog,
} from "./user-delete.utils";
import "./user-delete.scss";

export function UserDelete({ onDeleted }: { onDeleted?: () => void } = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !isOpen) return;
    if (!dialog.open) openDeleteDialog(dialog);
    cancelButtonRef.current?.focus();
  }, [isOpen]);

  function closeDialog() {
    if (isDeleting) return;
    if (dialogRef.current) closeDeleteDialog(dialogRef.current);
    setIsOpen(false);
    setError("");
  }

  async function handleDeleteAccount() {
    setIsDeleting(true);
    setError("");
    try {
      const result = await deleteUserAccount();
      if (!result.deleted) {
        setError(result.status === 401 ? SESSION_REQUIRED_ERROR : DELETE_ERROR);
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
              onClick={() => void handleDeleteAccount()}
            >
              {getConfirmButtonText(isDeleting)}
            </button>
          </div>
        </dialog>
      ) : null}
    </section>
  );
}
