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
    <a className="accreditation-seal" href={ACCREDITATION_VERIFICATION_URL}>
      {status === "demonstration" && (
        <picture>
          <source
            media="(max-width: 767px)"
            srcSet="/assets/desarrollo-seguro/sello-s4-mobile.webp 84w"
            sizes="42px"
            type="image/webp"
          />
          <img
            src="/assets/desarrollo-seguro/sello-s4.webp"
            width="128"
            height="128"
            alt="Sello ilustrado de Desarrollo Seguro"
            loading="lazy"
            decoding="async"
          />
        </picture>
      )}
      <span className="accreditation-seal-caption">
        {SEAL_CAPTIONS[status]}
      </span>
    </a>
  );
}
