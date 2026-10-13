import { useState } from "react";

export function Contact() {
  const [dismissed, setDismissed] = useState(false);
  function dismissForm() {
    setDismissed(true);
  }
  return (
    <div className="contact-layout">
      <section
        className={`content-card contact-card ${dismissed ? "contact-faded" : ""}`}
        aria-labelledby="contact-form-title"
      >
        <span className="eyebrow">Formulario de contacto</span>
        <h2 id="contact-form-title">Escribe lo que nadie te ha pedido</h2>
        <form
          onFocusCapture={dismissForm}
          onSubmit={(event) => {
            event.preventDefault();
            dismissForm();
          }}
        >
          <label>
            Nombre
            <input type="text" placeholder="Tu nombre" />
          </label>
          <label>
            Email
            <input type="email" placeholder="nombre@ejemplo.es" />
          </label>
          <label>
            Mensaje
            <textarea placeholder="Al grano, por favor." rows={4} />
          </label>
          <button className="button-primary" type="submit">
            Enviar mensaje <span aria-hidden="true">↗</span>
          </button>
        </form>
        <p className="contact-plan-note">
          El formulario completo estará disponible para cuentas con plan activo.
        </p>
      </section>
      <aside className="contact-side">
        <div className="contact-creature" aria-hidden="true" />
        <p>Prometemos leerlo. Algún día. Quizá con café.</p>
      </aside>
      {dismissed ? (
        <dialog
          open
          className="prototype-dialog contact-dialog"
          aria-labelledby="contact-dialog-title"
        >
          <button
            className="dialog-close"
            type="button"
            aria-label="Cerrar"
            onClick={() => setDismissed(false)}
          >
            ×
          </button>
          <span className="eyebrow">Grumphya tiene algo que decir</span>
          <h2 id="contact-dialog-title">
            Acéptalo: ahora mismo a nadie le importa lo que tengas que decir.
          </h2>
          <p>
            El formulario se ha esfumado. Si tienes un plan activo, el contacto
            real estará disponible cuando esté listo.
          </p>
        </dialog>
      ) : null}
      <p className="prototype-stamp">
        Vista de demostración; no se envía ningún mensaje.
      </p>
    </div>
  );
}
