import { useNativeDialog } from "../hooks/use-native-dialog";
import styles from "./email-verification-required-dialog.module.scss";

type EmailVerificationRequiredDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function EmailVerificationRequiredDialog({
  open,
  onClose,
}: EmailVerificationRequiredDialogProps) {
  const dialogRef = useNativeDialog(open);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="email-verification-required-title"
      aria-describedby="email-verification-required-copy"
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
      <h2 id="email-verification-required-title">
        Por seguridad tienes que confirmar tu correo
      </h2>
      <p id="email-verification-required-copy">
        Te hemos enviado un email con un enlace para que puedas confirmarlo.
      </p>
      <button className={styles.action} type="button" onClick={onClose}>
        Entendido
      </button>
    </dialog>
  );
}
