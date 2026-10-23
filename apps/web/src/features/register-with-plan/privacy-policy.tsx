import "../../shared/styles/account.scss";
import "./privacy-policy.scss";

const RIGHTS = [
  "Acceso, rectificación y supresión de tus datos.",
  "Oposición y limitación del tratamiento, cuando procedan.",
  "Portabilidad de los datos que hayas facilitado, en los supuestos previstos por la normativa.",
  "Retirar un consentimiento en cualquier momento, si un tratamiento se basa en él. La retirada no afecta a lo tratado antes.",
];

export function PrivacyPolicy() {
  return (
    <article
      className="content-card privacy-policy"
      aria-labelledby="privacy-policy-title"
    >
      <header className="privacy-policy-header">
        <span className="eyebrow">Borrador pendiente de validación</span>
        <h2 id="privacy-policy-title">Política de privacidad</h2>
        <p>
          Este texto describe el funcionamiento que se ha podido comprobar en el
          repositorio. No está listo para publicarse: los datos entre corchetes
          y los puntos indicados como pendientes deben confirmarse antes de
          abrir el servicio a usuarios reales.
        </p>
        <p className="privacy-policy-version">
          Versión de trabajo · 23 de octubre de 2026
        </p>
      </header>

      <section aria-labelledby="privacy-controller-title">
        <h3 id="privacy-controller-title">1. Quién trata tus datos</h3>
        <p>
          El responsable del tratamiento es{" "}
          <strong>Eduardo Fernández Pastor</strong>, con domicilio en{" "}
          <strong>[PENDIENTE: domicilio postal]</strong>. Puedes contactar para
          cuestiones de privacidad o para ejercer tus derechos en{" "}
          <a href="mailto:contacto@grumphya.com">contacto@grumphya.com</a>.
        </p>
        <p>No se ha designado delegado o delegada de protección de datos.</p>
      </section>

      <section aria-labelledby="privacy-data-title">
        <h3 id="privacy-data-title">2. Qué datos usamos y de dónde proceden</h3>
        <ul>
          <li>
            <strong>Cuenta y acceso:</strong> correo electrónico, alias, hash de
            contraseña, estado y fecha de verificación, aceptación y versión de
            la política, sesiones y datos del plan. Los proporcionas al crear y
            usar la cuenta.
          </li>
          <li>
            <strong>Ideas y mensajes:</strong> el texto que envías para evaluar
            una idea o pedir una respuesta de roast, además de la respuesta
            generada. La aplicación necesita el texto para atender esa petición.
          </li>
          <li>
            <strong>Uso anónimo:</strong> una cookie opaca de navegador permite
            recordar por separado los intentos gratuitos de ideas y roast. En la
            base de datos se conserva el hash de esa cookie, no su valor. Se usa
            además un HMAC temporal de la IP como defensa contra la creación
            repetida de perfiles; no se guarda la IP en claro en ese contador.
          </li>
          <li>
            <strong>Ideas aprobadas y rechazadas:</strong> para una cuenta, se
            puede guardar el título de una idea aprobada de forma privada. Las
            ideas rechazadas se agregan sin una relación con tu cuenta y se
            conserva un título seguro y una representación semántica; el texto
            original no se guarda en ese registro.
          </li>
          <li>
            <strong>Rankings:</strong> el ranking de ideas rechazadas puede
            mostrar un título seguro y el número de veces que se ha recibido;
            nunca muestra el autor ni el texto original. Otros rankings pueden
            mostrar el alias y el número de aprobaciones o mensajes roast y,
            según el ranking, el avatar. Esos alias, contadores y avatares son
            visibles públicamente y no deben describirse como anónimos. Las
            ideas aprobadas no se publican.
          </li>
          <li>
            <strong>Contacto:</strong> asunto y contenido de los mensajes que
            envías desde el formulario autenticado, vinculados a tu cuenta para
            que el equipo pueda responderte.
          </li>
          <li>
            <strong>Avatar:</strong> la imagen que eliges se procesa en el
            servidor y, tras convertirse a WebP de 128 × 128, se envía al
            proveedor de moderación. Si se aprueba, se publica como imagen de tu
            perfil.
          </li>
          <li>
            <strong>Preferencias del navegador:</strong> el tema visual y el
            cierre del aviso de cookies se guardan en el almacenamiento local
            del navegador. La sesión de acceso se mantiene en memoria en la
            página; la renovación usa una cookie protegida.
          </li>
          <li>
            <strong>Datos técnicos:</strong> pueden tratarse datos de conexión
            necesarios para prestar y proteger el servicio.{" "}
            <strong>
              [PENDIENTE: confirmar el inventario efectivo de registros del
              proxy, alojamiento y otros sistemas operativos.]
            </strong>
          </li>
        </ul>
        <p>
          No escribas datos especialmente sensibles ni información de otras
          personas en ideas, mensajes o imágenes salvo que sea imprescindible y
          tengas derecho a compartirla.
        </p>
      </section>

      <section aria-labelledby="privacy-audience-title">
        <h3 id="privacy-audience-title">A quién se dirige el servicio</h3>
        <p>
          Grumphya se ofrece en España. El responsable indica que no ha fijado
          una edad mínima y que permite el uso a personas menores de edad.{" "}
          <strong>
            [PENDIENTE: revisar las bases jurídicas y definir las medidas para
            informar y obtener o verificar la autorización de padres o tutores
            cuando sea necesaria.]
          </strong>
        </p>
      </section>

      <section aria-labelledby="privacy-purposes-title">
        <h3 id="privacy-purposes-title">3. Para qué los usamos</h3>
        <ul>
          <li>
            Crear y proteger tu cuenta, verificar el correo y gestionar el
            acceso.
          </li>
          <li>Evaluar las ideas y generar las respuestas que solicites.</li>
          <li>
            Comprobar similitudes, aplicar límites de uso y prevenir abusos.
          </li>
          <li>
            Guardar el historial privado de ideas aprobadas y gestionar los
            planes simulados.
          </li>
          <li>
            Recibir y responder consultas de contacto y enviarte los correos
            transaccionales solicitados.
          </li>
          <li>Revisar automáticamente los avatares y mostrar los aprobados.</li>
          <li>
            Proteger la disponibilidad, seguridad y funcionamiento técnico del
            servicio.
          </li>
        </ul>
        <p>
          La contratación de planes descrita en esta versión es una simulación:
          el código revisado no procesa pagos reales ni datos de tarjetas.
        </p>
        <p>
          Según la información facilitada por el responsable, los datos no se
          venden ni se usan para publicidad o analítica. Su uso es técnico y
          está dirigido a prestar y proteger las funciones de Grumphya. Para
          ejecutarlas, sí se comunican datos a proveedores técnicos, como OpenAI
          para las funciones de inteligencia artificial; su intervención no
          equivale a una venta de datos.
        </p>
        <p>
          <strong>
            [PENDIENTE: el responsable debe asignar y documentar la base
            jurídica aplicable a cada finalidad.]
          </strong>{" "}
          El repositorio no permite decidir por sí solo si corresponde ejecución
          de un contrato, medidas precontractuales, interés legítimo,
          consentimiento u otra base. Si un dato es necesario para una función,
          se indicará en el propio formulario; los campos opcionales y sus
          consecuencias también deben identificarse antes de publicar.
        </p>
      </section>

      <section aria-labelledby="privacy-ai-title">
        <h3 id="privacy-ai-title">4. Uso de inteligencia artificial</h3>
        <p>
          Cuando una función de IA está activada, el servidor puede enviar a
          OpenAI el texto de la idea para evaluarla, crear una representación
          semántica y comparar similitudes. En la comparación también se envían
          esa representación y títulos seguros de ideas candidatas. Para generar
          una respuesta de roast se envía el mensaje correspondiente. La
          moderación de avatares envía la imagen procesada descrita arriba. La
          configuración de evaluación indica que las solicitudes usan
          <code>store: false</code>; esto no permite afirmar por sí solo cuánto
          tiempo conserva el proveedor los datos o qué condiciones contractuales
          resultan aplicables.
        </p>
        <p>
          La evaluación se refiere a la viabilidad de la idea que has escrito.
          En el flujo revisado no se ha identificado una decisión sobre tu
          persona con efectos jurídicos o consecuencias similares
          significativas. La respuesta es una valoración automatizada del
          concepto y puede equivocarse; no sustituye una decisión profesional.{" "}
          <strong>
            [PENDIENTE: confirmar este análisis para todos los usos, modelos y
            datos que se admitan.]
          </strong>
        </p>
      </section>

      <section aria-labelledby="privacy-providers-title">
        <h3 id="privacy-providers-title">5. Quién puede recibir datos</h3>
        <p>
          OpenAI interviene como proveedor técnico de las funciones de IA: puede
          recibir el texto de ideas o mensajes para generar respuestas y la
          imagen procesada cuando se solicita moderar un avatar. También
          intervienen servicios técnicos de correo, alojamiento, base de datos,
          copias de seguridad y entrega de la web. El proveedor SMTP efectivo y
          los proveedores activos en producción deben confirmarse.
        </p>
        <p>
          <strong>
            [PENDIENTE: confirmar el rol y contrato de cada proveedor,
            subencargados, países de tratamiento/acceso y mecanismo válido para
            cualquier transferencia fuera del Espacio Económico Europeo.]
          </strong>
          No se afirmará que los datos permanecen en una región concreta hasta
          verificar la configuración real.
        </p>
        <p>
          El sistema envía correos de verificación, recuperación de contraseña y
          confirmación de contacto. El proveedor SMTP efectivo y las condiciones
          de tratamiento deben confirmarse antes de publicar.
        </p>
      </section>

      <section aria-labelledby="privacy-retention-title">
        <h3 id="privacy-retention-title">6. Cuánto tiempo se conservan</h3>
        <ul>
          <li>
            La cookie de perfil anónimo se configura para durar hasta 400 días.
            La identidad y el contador asociados en la base de datos no caducan
            automáticamente mientras el diseño conserve el límite de por vida.
          </li>
          <li>
            El HMAC de IP para limitar la creación repetida de perfiles tiene
            una ventana de 24 horas. Las respuestas idempotentes tienen una
            caducidad lógica de 24 horas, pero su eliminación física depende de
            actividad posterior; no hay una purga periódica independiente.
          </li>
          <li>
            El registro conserva los datos de cuenta mientras exista la cuenta.
            La baja elimina en la base de datos la cuenta, los datos
            dependientes, los mensajes asociados y el archivo de avatar; no se
            ha confirmado cuánto tardan en desaparecer las copias de seguridad.
            Por ello, todavía no se puede afirmar que un clic elimine
            permanentemente todos los datos de cualquier copia o sistema
            externo.
          </li>
          <li>
            El texto original de ideas rechazadas no queda en el registro de
            rechazo; su título seguro y vector tienen una exclusión lógica tras
            24 meses documentada, pero la purga física automática está
            pendiente.
          </li>
          <li>
            Los plazos de conservación de mensajes de contacto, datos de uso de
            IA asociados a una cuenta, registros técnicos, correo y copias de
            seguridad requieren una decisión y verificación operativa.
          </li>
        </ul>
        <p>
          <strong>
            [PENDIENTE: aprobar plazos efectivos por categoría y un
            procedimiento verificable de eliminación de copias y datos
            derivados.]
          </strong>
        </p>
      </section>

      <section aria-labelledby="privacy-cookies-title">
        <h3 id="privacy-cookies-title">7. Cookies y almacenamiento local</h3>
        <p>
          El código revisado utiliza una cookie propia para el perfil anónimo y
          cookies protegidas para las funciones de cuenta y registro. También
          guarda en el almacenamiento local del navegador la preferencia de
          tema, el cierre del aviso informativo y, como alternativa de
          sincronización entre pestañas, una señal de cambio de sesión. No es
          una cookie.
        </p>
        <p>
          Según el responsable, no se utilizan cookies de terceros ni analítica.
          El código revisado usa cookies propias y almacenamiento local del
          navegador.{" "}
          <strong>
            [PENDIENTE: verificar el despliegue real, confirmar duración y
            finalidad de cada tecnología, y publicar un inventario/política de
            cookies coherente con la LSSI y la guía vigente de la AEPD.]
          </strong>
          La presencia de una cookie en el código no determina por sí sola si
          está exenta de consentimiento.
        </p>
      </section>

      <section aria-labelledby="privacy-security-title">
        <h3 id="privacy-security-title">8. Seguridad</h3>
        <p>
          El proyecto incluye controles de acceso, contraseñas almacenadas como
          hash, cookies de sesión protegidas, validación de solicitudes, límites
          de uso y separación de servicios. Estas medidas describen el diseño
          implementado; no suponen una garantía absoluta. La configuración
          efectiva del despliegue, el acceso operativo, el cifrado de copias y
          las medidas de cada proveedor deben verificarse.
        </p>
      </section>

      <section aria-labelledby="privacy-rights-title">
        <h3 id="privacy-rights-title">9. Tus derechos</h3>
        <p>
          Puedes solicitar al responsable que confirme si trata tus datos y, en
          su caso, ejercer los derechos previstos en la normativa:
        </p>
        <ul>
          {RIGHTS.map((right) => (
            <li key={right}>{right}</li>
          ))}
        </ul>
        <p>
          Escribe a{" "}
          <a href="mailto:contacto@grumphya.com">contacto@grumphya.com</a> e
          indica qué derecho quieres ejercer y cómo podemos localizar los datos.
          Solo se solicitará información adicional cuando sea necesaria para
          verificar tu identidad. El responsable responderá dentro de los plazos
          legales aplicables.
        </p>
        <p>
          También puedes presentar una reclamación ante la Agencia Española de
          Protección de Datos en <a href="https://www.aepd.es/">www.aepd.es</a>,
          especialmente si no has recibido respuesta o no estás de acuerdo con
          ella.
        </p>
      </section>

      <section aria-labelledby="privacy-voice-title">
        <h3 id="privacy-voice-title">10. Dictado por voz</h3>
        <p>
          El navegador ofrece dictado solo cuando admite reconocimiento local y
          la aplicación solicita procesarlo en el dispositivo. La disponibilidad
          depende del navegador y del dispositivo; puedes escribir o pegar el
          texto en su lugar.{" "}
          <strong>
            [PENDIENTE: verificar el comportamiento en cada navegador admitido y
            confirmar si algún sistema operativo descarga componentes o realiza
            comunicaciones propias.]
          </strong>
        </p>
      </section>

      <section aria-labelledby="privacy-changes-title">
        <h3 id="privacy-changes-title">11. Cambios en esta política</h3>
        <p>
          Si cambia el tratamiento de datos, actualizaremos esta página e
          indicaremos la fecha y versión. Cuando el cambio requiera una nueva
          información o consentimiento, se te comunicará por el medio que
          corresponda.
        </p>
      </section>

      <footer className="privacy-policy-pending" role="note">
        <strong>Borrador, no publicar todavía.</strong>
        <span>
          La matriz de tratamientos, las evidencias del repositorio y los
          bloqueos previos a publicación están en{" "}
          <code>doc/privacy-policy-assessment.md</code>. Requiere completar los
          campos pendientes y revisión del responsable y profesional de
          privacidad.
        </span>
      </footer>
    </article>
  );
}
