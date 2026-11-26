import { useNativeDialog } from "../../../shared/hooks/use-native-dialog";

export function PricingLessonDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useNativeDialog(true);

  return (
    <dialog
      ref={dialogRef}
      className="prototype-dialog"
      aria-labelledby="ultra-dialog-title"
      aria-modal="true"
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <button
        className="dialog-close"
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
      >
        ×
      </button>
      <img
        className="dialog-mascot"
        src="/assets/grumphya/ultrachachi-reality-check.svg"
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
      />
      <span className="eyebrow">Una lección gratis</span>
      <h2 id="ultra-dialog-title">¿Aún estamos así de verde?</h2>
      <p>
        La IA es cara. NADIE te ofrecerá algo potenciado por IA sin cobrarte más
        al mes o por cada uso.
      </p>
      <p>Si lo hacen, será porque venderán tus datos, y aquí no hacemos eso.</p>
      <strong>Tus buenas ideas, las aprobadas, son tuyas y solo tuyas.</strong>
    </dialog>
  );
}
