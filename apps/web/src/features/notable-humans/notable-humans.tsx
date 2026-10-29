import { useEffect, useState } from "react";
import { BestUsers, type BestUsersState } from "./components/BestUsers";
import { getBestListBestUsers } from "./services/get-best-list-best-users";
import "./notable-humans.scss";

export function NotableHumans() {
  const [state, setState] = useState<BestUsersState>({ status: "loading" });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    getBestListBestUsers(controller.signal)
      .then((users) => {
        if (users.length === 0) {
          setState({ status: "empty" });
          return;
        }
        setState({ status: "success", users });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });

    return () => controller.abort();
  }, [revision]);

  return (
    <div className="humans-layout">
      <section
        className="content-card humans-card"
        aria-labelledby="humans-rank-title"
      >
        <div className="content-card-heading">
          <div>
            <span className="eyebrow">Clasificación actual</span>
            <h2 id="humans-rank-title">La gente que sí miró antes de saltar</h2>
          </div>
          <span
            className="round-illustration star-illustration"
            aria-hidden="true"
          >
            ✦
          </span>
        </div>
        <BestUsers
          state={state}
          onRetry={() => setRevision((value) => value + 1)}
        />
        <p className="privacy-footnote">
          Tus ideas aprobadas siguen siendo privadas. En esta clasificación solo
          mostramos alias y número de aprobaciones.
        </p>
      </section>
      <aside className="human-callout">
        <img
          className="human-callout-mascot"
          src="/assets/grumphya/notable-humans-callout.svg"
          alt=""
          aria-hidden="true"
        />
        <span className="eyebrow">Tu turno</span>
        <h2>La próxima idea brillante podría ser tuya.</h2>
        <p>
          No hace falta un pitch con fuegos artificiales. Empieza por explicar a
          quién ayudas.
        </p>
        <a className="button-secondary" href="/">
          Probar una idea <span aria-hidden="true">↗</span>
        </a>
      </aside>
    </div>
  );
}
