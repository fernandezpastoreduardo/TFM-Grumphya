import { useNativeDialog } from "../../../shared/hooks/use-native-dialog";
import styles from "./RoastFailureDialog.module.scss";

type RoastFailureDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function RoastFailureDialog({ open, onClose }: RoastFailureDialogProps) {
  const dialogRef = useNativeDialog(open);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="roast-failure-title"
      aria-describedby="roast-failure-copy"
      aria-modal="true"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button
        className={styles.close}
        type="button"
        aria-label="Cerrar aviso"
        onClick={onClose}
      >
        <span aria-hidden="true">×</span>
      </button>
      <img
        className={styles.mascot}
        src="/assets/grumphya/evaluation-error-spilled-coffee.svg"
        alt="Grumphya triste junto a una taza de café derramada"
      />
      <h2 id="roast-failure-title">Se nos ha derramado el café</h2>
      <p id="roast-failure-copy">
        La respuesta se ha quedado a medio camino. Grumphya ha perdido el hilo
        entre una taza y otra; no se te ha descontado el envío. Prueba de nuevo
        dentro de un rato.
      </p>
      <button className={styles.action} type="button" onClick={onClose}>
        Seguir intentándolo
      </button>
    </dialog>
  );
}
