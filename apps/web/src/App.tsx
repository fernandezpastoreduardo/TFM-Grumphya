import { useEffect, useState } from "react";

type Health = { status: string; database: string; pgvector: string };

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    fetch("/api/health")
      .then((response) => response.json())
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  return (
    <main className="shell">
      <p className="eyebrow">Tu idea, con los pies en la tierra</p>
      <h1>
        Antes de construirla,
        <br />
        <span>vamos a ponerla a prueba.</span>
      </h1>
      <p className="intro">
        Grumphya te ayuda a pensar en los riesgos y las preguntas que conviene
        resolver antes de invertir tiempo y dinero.
      </p>
      <section className="status" aria-live="polite">
        <span className={health?.status === "ok" ? "light online" : "light"} />
        {health
          ? `Servicios listos · PostgreSQL ${health.pgvector} con pgvector`
          : "Conectando con los servicios…"}
      </section>
      <label htmlFor="idea">¿Qué aplicación tienes en mente?</label>
      <textarea
        id="idea"
        rows={5}
        maxLength={800}
        placeholder="Describe para quién es, qué problema resuelve y cómo…"
      />
      <button type="button" disabled>
        Evaluar idea <span aria-hidden="true">↗</span>
      </button>
      <small>
        Prototipo técnico · La evaluación se habilitará en el siguiente paso
      </small>
    </main>
  );
}
