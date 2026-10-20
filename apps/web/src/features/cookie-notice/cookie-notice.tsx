import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import "./cookie-notice.scss";

const COOKIE_NOTICE_TITLE = "Ni galletitas ni galletitos";
const COOKIE_NOTICE_DISMISSED_KEY = "grumphya.cookie-notice.dismissed.v1";
const COOKIE_NOTICE_COPY =
  "NO usamos cookies de terceros. Solo cookies propias y estrictamente necesarias para que la web no se caiga a pedazos y puedas usarla de forma anónima y segura.";
const SUPPORTS_NATIVE_MODAL =
  typeof HTMLDialogElement !== "undefined" &&
  typeof HTMLDialogElement.prototype.showModal === "function";

export function CookieNotice() {
  const [isOpen, setIsOpen] = useState(() => !hasDismissedNotice());
  const dialogRef = useRef<HTMLDialogElement>(null);
  const firstButtonRef = useRef<HTMLButtonElement>(null);
  const lastButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (SUPPORTS_NATIVE_MODAL) {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
      dialog.setAttribute("aria-modal", "true");
    }
    firstButtonRef.current?.focus();

    return () => {
      if (dialog.open) closeDialog(dialog);
    };
  }, []);

  function closeNotice() {
    persistNoticeDismissal();
    const dialog = dialogRef.current;
    if (dialog?.open) closeDialog(dialog);
    setIsOpen(false);
    previousFocusRef.current?.focus();
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeNotice();
      return;
    }

    if (event.key !== "Tab") return;

    if (event.shiftKey && document.activeElement === firstButtonRef.current) {
      event.preventDefault();
      lastButtonRef.current?.focus();
    } else if (
      !event.shiftKey &&
      document.activeElement === lastButtonRef.current
    ) {
      event.preventDefault();
      firstButtonRef.current?.focus();
    }
  }

  if (!isOpen) return null;

  const noticeDialog = (
    <dialog
      ref={dialogRef}
      aria-describedby="cookie-notice-copy"
      aria-labelledby="cookie-notice-title"
      aria-modal="true"
      className="cookie-notice"
      onKeyDown={handleDialogKeyDown}
      onCancel={(event) => {
        event.preventDefault();
        closeNotice();
      }}
    >
      <img
        alt="Grumphya le da una patada a una galleta"
        className="cookie-notice-mascot"
        height="190"
        src="/assets/grumphya/cookie-kick.png"
        width="285"
      />
      <h2 id="cookie-notice-title">{COOKIE_NOTICE_TITLE}</h2>
      <p id="cookie-notice-copy">{COOKIE_NOTICE_COPY}</p>
      <div className="cookie-notice-actions">
        <button
          ref={firstButtonRef}
          className="cookie-notice-button cookie-notice-button-primary"
          onClick={closeNotice}
          type="button"
        >
          Aceptar y continuar sin galletas
        </button>
        <button
          ref={lastButtonRef}
          className="cookie-notice-button cookie-notice-button-secondary"
          onClick={closeNotice}
          type="button"
        >
          Denegar y continuar sin galletas
        </button>
      </div>
    </dialog>
  );

  return SUPPORTS_NATIVE_MODAL ? (
    noticeDialog
  ) : (
    <div className="cookie-notice-backdrop">{noticeDialog}</div>
  );
}

function hasDismissedNotice(): boolean {
  try {
    return (
      window.localStorage.getItem(COOKIE_NOTICE_DISMISSED_KEY) === "true"
    );
  } catch {
    return false;
  }
}

function persistNoticeDismissal(): void {
  try {
    window.localStorage.setItem(COOKIE_NOTICE_DISMISSED_KEY, "true");
  } catch {
    // Storage can be unavailable in private browsing or restricted contexts.
  }
}

function closeDialog(dialog: HTMLDialogElement) {
  if (typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
}
