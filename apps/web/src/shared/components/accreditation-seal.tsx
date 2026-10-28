import { useEffect, useState } from "react";
import {
  ACCREDITATION_VERIFICATION_URL,
  getAccreditation,
  isSealDisplayAllowed,
} from "../accreditation-verification";
import "./accreditation-seal.scss";

const SEAL_CAPTIONS = {
  loading: "Consultando el estado del sello · Ver ficha ↗",
  demonstration:
    "Demostración académica · Sin certificación oficial · Ver ficha ↗",
  unavailable: "Sello no verificable o sin vigencia · Ver ficha ↗",
} as const;

export function AccreditationSeal() {
  const [status, setStatus] = useState<
    "loading" | "demonstration" | "unavailable"
  >("loading");

  useEffect(() => {
    let active = true;
    getAccreditation()
      .then((record) => {
        if (!active) return;
        setStatus(
          isSealDisplayAllowed(
            record,
            window.location.hostname,
            import.meta.env.DEV,
          )
            ? "demonstration"
            : "unavailable",
        );
      })
      .catch(() => {
        if (active) setStatus("unavailable");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <a
      className="accreditation-seal"
      href={ACCREDITATION_VERIFICATION_URL}
      aria-label="Verificar demostración de Desarrollo Seguro para Grumphya"
    >
      {status === "demonstration" && (
        <img
          src="/assets/desarrollo-seguro/sello-s4.webp"
          width="512"
          height="512"
          alt="Sello ilustrado de Desarrollo Seguro"
          loading="lazy"
          decoding="async"
        />
      )}
      <span className="accreditation-seal-caption">
        {SEAL_CAPTIONS[status]}
      </span>
    </a>
  );
}
