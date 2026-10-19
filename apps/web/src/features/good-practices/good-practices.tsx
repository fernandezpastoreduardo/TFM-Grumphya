import "./good-practices.scss";

export function GoodPractices() {
  return (
    <div className="practices-page">
      <section className="practices-intro">
        <span className="eyebrow">Una mirada sin sarcasmo</span>
        <h2>Prototipar rápido está bien. Validar antes está mejor.</h2>
        <p>
          Construir software consume tiempo, presupuesto y atención. Una
          evaluación temprana no decide por ti: te ayuda a descubrir qué
          necesitas comprobar.
        </p>
        <div className="practice-companions" aria-hidden="true">
          <span className="practice-companion practice-companion-pink" />
          <span className="practice-companion practice-companion-yellow" />
        </div>
      </section>
      <div className="practice-steps">
        <article>
          <span>01</span>
          <div>
            <h3>Encuentra el problema real</h3>
            <p>
              Habla con las personas que lo viven. Pregunta qué hacen hoy, qué
              les cuesta y cuándo fue la última vez que intentaron resolverlo.
            </p>
          </div>
          <b aria-hidden="true">⌕</b>
        </article>
        <article>
          <span>02</span>
          <div>
            <h3>Comprueba tus supuestos</h3>
            <p>
              Separa lo que sabes de lo que estás suponiendo. Busca señales
              observables antes de estimar el tamaño del mercado.
            </p>
          </div>
          <b aria-hidden="true">↗</b>
        </article>
        <article>
          <span>03</span>
          <div>
            <h3>Construye lo mínimo que aprenda</h3>
            <p>
              Elige una prueba pequeña que pueda refutar tu hipótesis. El
              objetivo inicial no es lanzar mucho: es aprender pronto.
            </p>
          </div>
          <b aria-hidden="true">✳</b>
        </article>
      </div>
      <aside className="calm-note">
        <img
          className="calm-mascot"
          src="/assets/grumphya/good-practices-validate-idea.png"
          alt=""
          aria-hidden="true"
        />
        <div>
          <strong>Sobre IA y vibe-coding</strong>
          <p>
            Las herramientas generativas aceleran algunas tareas, pero no
            sustituyen criterio de producto, revisión técnica, seguridad ni
            pruebas con usuarios. Y cada uso tiene un coste.
          </p>
        </div>
      </aside>
      <p className="prototype-stamp">Contenido editorial en revisión.</p>
    </div>
  );
}
