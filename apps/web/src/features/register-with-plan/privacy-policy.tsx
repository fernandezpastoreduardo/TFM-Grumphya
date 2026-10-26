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
        <span className="eyebrow">Privacidad</span>
        <h2 id="privacy-policy-title">Política de privacidad</h2>
        <p>
          Aquí explicamos qué datos usamos para prestar Grumphya, con quién se
          comparten y durante cuánto tiempo los conservamos.
        </p>
        <p className="privacy-policy-version">
          Versión 4 · 26 de octubre de 2026
        </p>
      </header>

      <section aria-labelledby="privacy-controller-title">
        <h3 id="privacy-controller-title">1. Quién trata tus datos</h3>
        <p>
          El responsable del tratamiento es{" "}
          <strong>Eduardo Fernández Pastor</strong>, con domicilio en{" "}
          <strong>Avenida de América 46, 4.º A, 50007 Zaragoza, España</strong>.
          Puedes contactar para cuestiones de privacidad o para ejercer tus
          derechos en{" "}
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
            <strong>Uso sin cuenta:</strong> una cookie opaca mantiene un perfil
            seudónimo del navegador y recuerda por separado los intentos
            gratuitos de ideas y roast; no identifica por sí sola a una persona.
            En la base de datos se conserva el hash de esa cookie, no su valor.
            También se usa durante 24 horas un HMAC de la IP como defensa frente
            a la creación repetida de perfiles; no se guarda la IP en claro en
            ese contador.
          </li>
          <li>
            <strong>Ideas aprobadas y rechazadas:</strong> para una cuenta, se
            puede guardar el título de una idea aprobada de forma privada. De
            las ideas rechazadas se conserva un título generado para ser seguro
            y una representación semántica; el texto original no queda en el
            corpus. Si envías una idea con tu cuenta, el historial privado
            también relaciona esa idea con tu cuenta y muestra el título y el
            número de recepciones solo a ti.
          </li>
          <li>
            <strong>Diagnóstico de errores de evaluación:</strong> si el
            evaluador devuelve una respuesta que el servidor no puede
            interpretar, el texto de esa idea puede conservarse temporalmente
            junto al error para investigarlo. Solo las cuentas administradoras
            pueden consultar ese detalle y se elimina a los 30 días.
          </li>
          <li>
            <strong>Rankings:</strong> el ranking educativo de ideas rechazadas
            puede mostrar el título generado para ser seguro y el número de
            veces que se ha recibido. No muestra autor, cuenta, texto original,
            historial privado ni identificadores. El filtro automático reduce
            datos de contacto y fragmentos literales, pero no puede garantizar
            que un título o su contexto nunca permita reconocer a alguien. Otros
            rankings pueden mostrar el alias y el número de aprobaciones o
            mensajes roast y, según el ranking, el avatar. Esos alias,
            contadores y avatares son visibles públicamente y no deben
            describirse como anónimos. Las ideas aprobadas no se publican.
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
            <strong>Preferencias del navegador:</strong> el tema visual, la
            confirmación de lectura de este aviso y una señal aleatoria de
            sincronización entre pestañas pueden guardarse en el almacenamiento
            local del navegador. La sesión de acceso se mantiene en memoria en
            la página; la renovación usa una cookie protegida.
          </li>
          <li>
            <strong>Datos técnicos:</strong> pueden tratarse datos de conexión
            necesarios para prestar y proteger el servicio. IONOS puede tratar
            metadatos técnicos de conexión y operación como proveedor de
            alojamiento, conforme a la configuración y los registros del
            servicio.
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
          Grumphya se ofrece en España y no establece una edad mínima. Cuando
          una operación se base en el consentimiento y la persona tenga menos de
          14 años, debe prestarlo quien ejerza la patria potestad o tutela. Si
          una función requiere capacidad para asumir obligaciones, la persona
          menor debe contar con la intervención de su representante legal cuando
          corresponda.
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
          venden ni se usan para anuncios personalizados. El ranking de ideas
          rechazadas tiene una finalidad educativa: mostrar ejemplos de
          problemas que se repiten y fomentar el uso de Grumphya. Para prestar
          otras funciones, sí se comunican datos a proveedores técnicos, como
          OpenAI para las funciones de inteligencia artificial; su intervención
          no equivale a una venta de datos.
        </p>
        <p>
          La base jurídica depende de cada finalidad. La ejecución de las
          funciones que solicitas y la gestión de la cuenta se basan en la
          prestación del servicio; la seguridad, la prevención del abuso y las
          métricas técnicas necesarias se basan en el interés legítimo del
          responsable en mantener un servicio seguro y fiable. Para fomentar el
          uso educativo de Grumphya y mostrar ejemplos de ideas rechazadas que
          se repiten, el ranking publica títulos generados para ser seguros y
          recuentos agregados, sin autor ni relación pública con cuentas. Este
          tratamiento se basa en el interés legítimo del responsable. El filtro
          automático reduce algunos datos identificativos, pero no elimina por
          completo el riesgo de identificación indirecta; la finalidad, la
          ponderación y las salvaguardas se explican en la evaluación de
          privacidad. Puedes oponerte por motivos relacionados con tu situación
          particular escribiendo a contacto@grumphya.com. Los rankings que
          muestran alias, avatares o actividad de cuentas sí requieren una
          autorización expresa y voluntaria, revocable desde el perfil.
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
          resultan aplicables. Según la documentación vigente de OpenAI, la API
          no usa por defecto las entradas y salidas para entrenar modelos. Los
          registros de supervisión de abuso pueden contener parte del contenido
          y conservarse hasta 30 días con la configuración estándar; puede haber
          excepciones legales o de seguridad. Algunas funciones aprobadas de
          retención reducida cambian ese plazo.{" "}
          <a href="https://developers.openai.com/api/docs/guides/your-data">
            Consulta los controles de datos de la API de OpenAI.
          </a>
        </p>
        <p>
          La evaluación valora la idea que has escrito, no tu idoneidad como
          persona. El resultado puede equivocarse y no sustituye una decisión
          profesional. No se usa para tomar decisiones automatizadas sobre ti
          que produzcan efectos jurídicos o te afecten significativamente de
          forma similar.
        </p>
      </section>

      <section aria-labelledby="privacy-providers-title">
        <h3 id="privacy-providers-title">5. Quién puede recibir datos</h3>
        <p>
          OpenAI interviene como proveedor técnico de las funciones de IA: puede
          recibir el texto de ideas o mensajes para generar respuestas y la
          imagen procesada cuando se solicita moderar un avatar. El código se
          conecta a la API global de OpenAI y no fija un endpoint regional
          europeo. El despliegue documentado usa un VPS de IONOS para la web,
          API y base de datos. IONOS también presta el servicio SMTP. Las copias
          se conservan solo el tiempo estrictamente necesario para atender el
          servicio y recuperar datos ante incidencias.
        </p>
        <p>
          La información contractual de OpenAI para clientes del Espacio
          Económico Europeo identifica a OpenAI Ireland Ltd. como entidad
          contratante y contempla transferencias posteriores con garantías
          aplicables, como cláusulas contractuales tipo o decisiones de
          adecuación. La API puede usar subencargados.{" "}
          <a href="https://openai.com/en-GB/policies/data-processing-addendum/">
            Consulta el anexo de tratamiento de datos de OpenAI
          </a>{" "}
          y su{" "}
          <a href="https://openai.com/policies/sub-processor-list/">
            lista de subencargados
          </a>
          . La aplicación usa el endpoint global y no acredita una región de
          tratamiento determinada. La ubicación y configuración del proyecto y
          las condiciones de los proveedores de alojamiento y correo deben
          verificarse.
        </p>
        <p>
          El sistema envía correos de verificación, recuperación de contraseña y
          confirmación de contacto mediante SMTP de IONOS. Sus condiciones de
          tratamiento y las ubicaciones de almacenamiento o acceso dependen de
          la configuración y el contrato del servicio.
        </p>
      </section>

      <section aria-labelledby="privacy-retention-title">
        <h3 id="privacy-retention-title">6. Cuánto tiempo se conservan</h3>
        <ul>
          <li>
            El perfil sin cuenta y sus contadores se conservan hasta 400 días
            desde el último uso. La cookie del perfil también dura hasta 400
            días.
          </li>
          <li>
            El HMAC de IP para limitar la creación repetida de perfiles tiene
            una ventana de 24 horas. Las respuestas idempotentes tienen una
            caducidad de 24 horas; un proceso periódico elimina las respuestas
            caducadas.
          </li>
          <li>
            El registro conserva los datos de cuenta mientras exista la cuenta.
            La baja elimina en la base de datos la cuenta, los datos
            dependientes, los mensajes asociados y el archivo de avatar. Las
            copias de seguridad se conservan solo durante el tiempo
            estrictamente necesario para atender el servicio y recuperar datos
            ante incidencias; los datos eliminados pueden permanecer en ellas
            hasta que se sobrescriban o eliminen conforme a ese ciclo.
          </li>
          <li>
            El texto original de ideas rechazadas no queda en el corpus de
            similitud. El título generado para ser seguro y el vector usados
            para detectar coincidencias, junto con el contador del ranking
            histórico, se conservan hasta 24 meses desde la última recepción y
            después se eliminan. El historial privado asociado a una cuenta
            permanece mientras exista la cuenta y se elimina al darla de baja.
          </li>
          <li>
            Los mensajes de contacto y las métricas técnicas y de uso de IA se
            conservan hasta 12 meses; los eventos de error y el texto de idea
            asociado a un fallo de evaluación, hasta 30 días. Los correos pueden
            seguir disponibles en los buzones según sus propias reglas de
            conservación.
          </li>
        </ul>
        <p>
          Cuando exista una obligación legal de conservar información, se
          mantendrá bloqueada durante el plazo exigido y después se eliminará.
        </p>
      </section>

      <section aria-labelledby="privacy-cookies-title">
        <h3 id="privacy-cookies-title">7. Cookies y almacenamiento local</h3>
        <p>
          El código utiliza una cookie propia para el perfil sin cuenta, dos
          cookies temporales durante el alta y una cookie protegida para la
          sesión. La cookie del perfil dura hasta 400 días; la intención de alta
          y la confirmación del plan caducan a los 15 minutos. La cookie de
          sesión dura hasta 30 días si eliges «Recordarme» y, si no, es de
          sesión, con caducidad máxima de 24 horas en el servidor. Todas son
          cookies propias <code>HttpOnly</code>, <code>SameSite=Strict</code> y
          <code>Secure</code> en producción. También se guarda en{" "}
          <code>localStorage</code> el tema visual y la confirmación de lectura
          del aviso; si el navegador no admite <code>BroadcastChannel</code>, se
          guarda una señal aleatoria para sincronizar cambios de sesión entre
          pestañas.
        </p>
        <p>
          Según el responsable, no se utilizan cookies de terceros ni analítica.
          El código revisado usa cookies propias y almacenamiento local del
          navegador. El botón «Entendido» registra únicamente que se ha cerrado
          el aviso informativo; no solicita consentimiento para otros fines.{" "}
          Estas tecnologías se utilizan para prestar funciones solicitadas,
          mantener la sesión y recordar preferencias; el aviso informativo no
          sustituye a un consentimiento cuando la normativa lo exige. La
          presencia de una cookie en el código no determina por sí sola si está
          exenta de consentimiento.
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
          Si te opones a que un título aparezca en el ranking de ideas
          rechazadas, incluye el título publicado o información suficiente para
          localizarlo y escribe a contacto@grumphya.com. Revisaremos la
          solicitud manualmente y, si procede, retiraremos el título y su
          recuento del ranking público. El corpus no conserva el texto original
          y el recuento público agrega ideas similares sin separar las
          aportaciones individuales. Retirar una idea puede afectar al título y
          al recuento compartidos.
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
          texto en su lugar. El navegador o el sistema operativo puede aplicar
          sus propias condiciones al reconocimiento de voz; consulta la
          información del proveedor de tu dispositivo. Si no quieres usar el
          dictado, puedes escribir o pegar el texto.
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
    </article>
  );
}
