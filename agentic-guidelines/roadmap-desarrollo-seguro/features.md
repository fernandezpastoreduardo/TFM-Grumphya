# Features de la primera fase operativa

## F0. Separación e identidad honesta

Como visitante, quiero reconocer que Desarrollo Seguro pertenece al mismo proyecto académico y saber desde dónde se realizó la medición. El informe muestra proveedor de observación «worker del VPS de Grumphya», versión del perfil, fecha UTC y rutas cubiertas. No usa «certificación independiente» ni «cumple RGPD». El sello de Grumphya es local y neutral: «Consultar verificación técnica», sin imagen con texto de certificación. Se mantienen enlaces antiguos como ficha académica histórica o redirección clara al informe.

**Aceptación:** cargar Grumphya no solicita recursos a Desarrollo Seguro como tercero; al estar en el mismo origen solo hay navegación voluntaria. Ningún resultado simulado o fecha manual aparece como escaneo operativo.

## F1. Registro de dominios y búsqueda pública

grumphya.com es el primer dominio inscrito, configurado explícitamente por el operador y con muestra fija: /, /precios y una ruta pública de la ficha. Los dominios inscritos se escanean cada hora. El buscador acepta un hostname público normalizado, sin URL, IP, puerto ni ruta introducida por el visitante. Un dominio no inscrito puede solicitar un diagnóstico puntual de su página principal, con límites globales, por dominio y por IP; no queda inscrito ni recibe sello. Los resultados existentes pueden consultarse aunque el propietario no haya reclamado el dominio, con el alcance y la procedencia indicados. Ofrecer mecanismo administrativo de exclusión/opt-out y no publicar diagnósticos de un dominio excluido.

**Aceptación:** una búsqueda nueva no crea alta horaria; entradas inválidas se rechazan antes de DNS; el endpoint no admite URL arbitraria. Un dominio inscrito y otro no inscrito reciben alcance diferente y copy distinto.

## F2. Escaneo público de bajo impacto

El motor realiza DNS, negociación TLS, HEAD/GET de URLs públicas y navegación anónima limitada. No inicia sesión, no envía formularios, no hace fuzzing, fuerza bruta, enumeración de rutas ni DAST agresivo. Consulta robots.txt para rutas rastreadas y se identifica con User-Agent y contacto. La navegación registra intentos de recursos de terceros y los bloquea; un intento viola el perfil estricto de privacidad de la muestra. Cookies propias se evalúan por atributos aplicables, sin guardar valores. Ver [controls-and-evidence.md](controls-and-evidence.md) y [scanner-safety.md](scanner-safety.md).

**Aceptación:** cada control tiene resultado y evidencia mínima; un fallo de navegador o un bloqueo del sitio produce unknown, no pass. Las solicitudes por escaneo están acotadas y son visibles en métricas.

## F3. Hora, caché y ejecución única

El scheduler programa los dominios inscritos cuando cumplen 60 minutos desde el último resultado completo. Al abrir el sello o buscar, si el último informe del perfil vigente terminó hace menos de 60 minutos, se devuelve sin red nueva. Si tiene 60 minutos o más, se crea o reutiliza un único trabajo por dominio/perfil; la UI muestra «actualizando». El reloj se inyecta en pruebas. Un trabajo fallido deja el último informe como histórico y el estado actual «no evaluable» o «caducado», nunca «conforme vigente». Los trabajos tienen lease, timeout, reintento acotado y recuperación tras reinicio.

**Aceptación:** frontera 59:59/60:00; diez clics simultáneos no originan diez escaneos; reiniciar worker no pierde ni duplica un resultado confirmado.

## F4. Informe y sello

La landing actual en /desarrollo-seguro/ sigue siendo introductoria. La nueva aplicación de consulta, servida bajo /desarrollo-seguro/app/, contiene buscador, ficha por dominio, controles, fecha/hora, estado, alcance, fuente de observación, historial breve y errores. El sello local del footer enlaza directamente al informe de grumphya.com. Si el resultado está en curso, la página espera mediante consultas acotadas; el servidor nunca bloquea una petición web durante un escaneo completo.

El veredicto visible es «supera controles observables», «no supera controles observables», «no evaluable», «en curso» o «caducado». «Supera» exige todos los controles obligatorios evaluados en la muestra. La página aclara que desde el mismo VPS no se verifica una perspectiva de Internet independiente ni el código interno.

**Aceptación:** accesibilidad de teclado, lector de pantalla y 320 px; fallos y stale no muestran un sello de aprobación; la ruta antigua /acreditaciones/DS-GRUMPHYA-2026-001 no contradice el nuevo informe.

## F5. Operación compartida sin mezclar datos

Web estática propia, API propia y worker propio dentro del monorepo y de la misma release. Base lógica y roles propios en la instancia PostgreSQL existente; no compartir tablas ni credenciales con Grumphya. Proxy único por rutas del mismo host; solo Caddy publica 80/443. CI construye y escanea imágenes, ejecuta pruebas con red simulada y smoke integrado; el despliegue a producción conserva la confirmación manual actual. Recursos del worker y profundidad del escaneo se limitan para proteger la API y DB de Grumphya.

**Aceptación:** detener el worker no detiene Grumphya; un fallo de migración/imagen de Desarrollo Seguro bloquea la release antes de alterar producción; backups y restauración de sus datos se prueban sin tocar las tablas de Grumphya.

## Límite de la fase

No crear desarrolloseguro.com, hosting externo, repo separado, despliegue independiente, visita desde otra red, verificación de sesiones privadas, afirmación legal, auditoría humana ni nivel ASVS completo. Si la prueba de seguridad de salida o capacidad falla, el buscador de dominios ajenos permanece deshabilitado y el informe de Grumphya queda «no evaluable» cuando falte un control obligatorio; no se elimina el gate para publicar.
