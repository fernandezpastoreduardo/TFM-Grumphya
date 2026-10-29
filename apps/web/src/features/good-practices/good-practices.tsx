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
          src="/assets/grumphya/good-practices-validate-idea.svg"
          alt=""
          aria-hidden="true"
        />
        <div>
          <strong>Sobre IA y vibe-coding</strong>
          <p>
            El vibe-coding —pedir código a la IA y pegarlo sin entenderlo ni
            revisarlo— te hace perder el control del proyecto. Puede dejar
            fallos de seguridad, romper otras partes cuando cambies algo y
            producir un programa difícil de mantener. Si crece el número de
            usuarios, también pueden aparecer límites y costes que nadie previó.
            La IA no se hace responsable: tendrás que encontrar y arreglar esos
            problemas tú. Antes de publicar, entiende cada cambio, revísalo y
            prueba qué ocurre cuando algo falla. Si no puedes hacerlo, no pongas
            ese código en manos de usuarios.
          </p>
        </div>
      </aside>
    </div>
  );
}
