import { useEffect, useState } from "react";
import {
  EXTERNAL_ACCREDITATION_SITE_URL,
  getAccreditation,
  isSealDisplayAllowed,
} from "../accreditation-verification";
import "./accreditation-seal.scss";

const SEAL_CAPTIONS = {
  loading: "Consultando el estado del sello · Conocer la propuesta ↗",
  demonstration:
    "Demostración académica · Sin certificación oficial · Conocer la propuesta ↗",
  unavailable: "Sello no verificable o sin vigencia · Conocer la propuesta ↗",
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
    <a className="accreditation-seal" href={EXTERNAL_ACCREDITATION_SITE_URL}>
      {status === "demonstration" && (
        <img
          src="/assets/desarrolloseguro.org/icon.svg"
          width="128"
          height="128"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
        />
      )}
      <span className="accreditation-seal-copy">
        <span className="accreditation-seal-site">desarrolloseguro.org</span>
        <span className="accreditation-seal-caption">
          {SEAL_CAPTIONS[status]}
        </span>
      </span>
    </a>
  );
}
