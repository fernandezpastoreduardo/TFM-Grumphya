import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  COOKIE_NOTICE_COPY,
  COOKIE_NOTICE_TITLE,
  SUPPORTS_NATIVE_MODAL,
} from "./cookie-notice.constants";
import { closeCookieDialog } from "./cookie-notice.dialog";
import {
  hasAcknowledgedNotice,
  recordNoticeAcknowledgement,
} from "./cookie-notice.storage";
import "./cookie-notice.scss";

export function CookieNotice({
  deferInitialStorage = false,
}: {
  deferInitialStorage?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(() =>
    deferInitialStorage ? false : !hasAcknowledgedNotice(),
  );
  const dialogRef = useRef<HTMLDialogElement>(null);
  const firstButtonRef = useRef<HTMLButtonElement>(null);
  const lastLinkRef = useRef<HTMLAnchorElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (deferInitialStorage && !hasAcknowledgedNotice()) setIsOpen(true);
  }, [deferInitialStorage]);

  useEffect(() => {
    if (!isOpen) return;
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
      if (dialog.open) closeCookieDialog(dialog);
    };
  }, [isOpen]);

  function closeNotice() {
    recordNoticeAcknowledgement();
    const dialog = dialogRef.current;
    if (dialog?.open) closeCookieDialog(dialog);
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
      lastLinkRef.current?.focus();
    } else if (
      !event.shiftKey &&
      document.activeElement === lastLinkRef.current
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
        sizes="(max-width: 480px) 188px, 225px"
        src="/assets/grumphya/cookie-kick-188.webp"
        srcSet="/assets/grumphya/cookie-kick-188.webp 188w, /assets/grumphya/cookie-kick-376.webp 376w, /assets/grumphya/cookie-kick.webp 570w"
        width="285"
      />
      <h2 id="cookie-notice-title">{COOKIE_NOTICE_TITLE}</h2>
      <p id="cookie-notice-copy">{COOKIE_NOTICE_COPY}</p>
      <a
        ref={lastLinkRef}
        className="cookie-notice-details"
        href="/politica-de-privacidad"
        onClick={closeNotice}
      >
        Leer la política de privacidad
      </a>
      <div className="cookie-notice-actions">
        <button
          ref={firstButtonRef}
          className="cookie-notice-button cookie-notice-button-primary"
          onClick={closeNotice}
          type="button"
        >
          Entendido
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
