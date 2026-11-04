import { useEffect, useRef } from "react";

type UsageLimitScope = "ideas" | "roasts";

type UsageLimitDialogProps = {
  open: boolean;
  scope: UsageLimitScope;
  onClose: () => void;
};

const USAGE_LIMIT_COPY = {
  ideas: {
    id: "idea-usage-limit",
    copy: "Has usado tus 11 evaluaciones de hoy en Iluminado. Hasta Grumphya sabe cuándo parar. Vuelve mañana y seguimos con la siguiente idea.",
  },
  roasts: {
    id: "roast-usage-limit",
    copy: "Has usado tus 11 envíos de hoy en Faltón. Hasta Grumphya tiene un límite (aunque cueste creerlo). Vuelve mañana.",
  },
} as const;

export function UsageLimitDialog({
  open,
  scope,
  onClose,
}: UsageLimitDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const copy = USAGE_LIMIT_COPY[scope];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    } else if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="prototype-dialog usage-limit-dialog"
      aria-labelledby={`${copy.id}-title`}
      aria-describedby={`${copy.id}-copy`}
      onClose={onClose}
    >
      <button
        className="dialog-close"
        type="button"
        aria-label="Cerrar aviso de cuota diaria agotada"
        onClick={onClose}
      >
        ×
      </button>
      <img src="/assets/grumphya/mascot-crossed-arms.webp" alt="" />
      <span className="eyebrow">Por hoy ya está bien</span>
      <h2 id={`${copy.id}-title`}>Se acabaron los intentos</h2>
      <p id={`${copy.id}-copy`}>{copy.copy}</p>
      <a className="button-primary" href="/precios">
        Ver planes <span aria-hidden="true">↗</span>
      </a>
    </dialog>
  );
}
