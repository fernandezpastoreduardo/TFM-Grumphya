import "../../shared/styles/account.scss";

export function TermsAndConditions() {
  return (
    <article className="content-card privacy-policy-placeholder">
      <h2>Tratamiento de las ideas y los dictados</h2>
      <p>
        El texto se procesa para evaluar la idea. Si se rechaza, conservamos un
        título genérico y una representación matemática para detectar envíos
        parecidos; no guardamos el texto original. Una cookie recuerda tus tres
        usos gratuitos y una señal temporal derivada de la IP ayuda a frenar la
        creación repetida de perfiles. El dictado solo se inicia si el navegador
        puede transcribir en este dispositivo; puede descargar el paquete local
        de voz en español. Revisa la transcripción antes de enviar. Si no está
        disponible el reconocimiento local, puedes escribir la idea y el audio
        no se envía a otro servicio.
      </p>
    </article>
  );
}
