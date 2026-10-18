# Usuarios, credenciales y secretos

## Lo que existe ahora

- GitHub: repositorio privado `fernandezpastoreduardo/TFM-Grumphya`; el acceso se realiza mediante la sesión SSH/CLI ya configurada en el equipo. No copiar ni documentar su token o clave privada.
- Desarrollo Docker PostgreSQL: base/rol `grumphya_dev`, puerto enlazado solo a `127.0.0.1:5433`; `pnpm db:setup` genera una contraseña aleatoria en `.env.docker` con permisos `0600`. Mantén también `.env.openai` y `.env` con permisos `0600`. Los tres archivos están ignorados por Git.
- PostgreSQL Homebrew preexistente: la base y extensión creadas en la verificación inicial permanecen en `5432`; el flujo de la app usa el contenedor independiente en `5433`.
- Cuentas Grumphya: el alta con plan y activación simulada están implementados; el login usa alias o correo y contraseña. La verificación real del correo y el segundo factor siguen pendientes. Revisa [plan de seguridad del registro y similitud](security-and-similarity-roadmap.md) para los controles y límites restantes.
- Embeddings: adaptador OpenAI API `text-embedding-3-small` implementado. `OPENAI_API_KEY` se configura en el archivo local ignorado `.env`; el valor y la vigencia de la clave no se documentan ni se muestran, y deben gestionarse desde OpenAI Platform. El evaluador requiere además activar `EVALUATION_PROVIDER=openai` en `.env.openai` antes de procesar evaluaciones. En Compose, `.env.docker`, `.env.openai` y `.env` se montan desde el host como secretos de archivo en `/run/secrets`. El entrypoint de API usa allowlists separadas por archivo: `.env.docker` para PostgreSQL/JWT/HMAC, `.env.openai` para proveedor/modelo/timeout y `.env` únicamente para `OPENAI_API_KEY`, evitando que un archivo sobrescriba credenciales de otro ámbito. Es una protección de transporte al contenedor local, no cifrado en reposo ni sustituto de un secret manager. `docker compose config` debe mostrar rutas, nunca los valores. Pagos, correo real y producción siguen sin configurar.
- La moderación de avatares reutiliza `OPENAI_API_KEY` y llama desde el servidor a `omni-moderation-latest`; no se configura ni expone una clave adicional al navegador. Sin clave o si el proveedor/moderador falla, la subida falla de forma cerrada (no se guarda el avatar). El servicio envía el WebP reducido de 128×128 a OpenAI, no los bytes originales. Este tratamiento externo debe explicarse en la política de privacidad antes del uso público.

### Rotación en Docker local

- Tras cambiar `ACCESS_TOKEN_SECRET`, `ANONYMOUS_IP_HMAC_SECRET` o la configuración/clave OpenAI, recrea la API para que vuelva a leer los archivos montados. Rotar `ACCESS_TOKEN_SECRET` invalida los access tokens ya emitidos; rotar `ANONYMOUS_IP_HMAC_SECRET` cambia la señal antiabuso de los perfiles anónimos existentes.
- Cambiar `GRUMPHYA_DB_PASSWORD` en `.env.docker` no modifica la contraseña del rol PostgreSQL en un volumen ya inicializado. Coordina el cambio con `ALTER ROLE` en la base existente y recrea la API con el nuevo secreto. No elimines el volumen como mecanismo de rotación.
- Los secretos respaldados por archivos locales requieren rotación manual. En producción se debe usar el secret manager del proveedor y su procedimiento de rotación.

## Cómo tratar secretos futuros

- En local, guarda secretos en un gestor de credenciales del sistema o archivo ignorado por Git con permisos de usuario. No reutilices `.env` compartidos ni los adjuntes a issues.
- En despliegue, usa el secret manager/variables protegidas del proveedor y limita quién puede leerlos.
- La contraseña de cada usuario final debe guardarse mediante un hash moderno para contraseñas (Argon2id preferente; alternativa revisada y parametrizada), con límites de intentos y mensajes de login genéricos.
- Los refresh tokens deben ser aleatorios, almacenarse de forma revocable/hasheada en servidor y salir únicamente en cookie `HttpOnly`, `Secure`, `SameSite` según la especificación funcional.
- Claves de firma, cifrado, DB runtime, migrador, proveedor IA y GitHub/deploy son secretos distintos por entorno; no compartir credenciales entre staging y producción.
- Nunca registrar tokens, contraseñas, cookies, audio, texto privado de ideas o secretos en logs/telemetría.

## Sesiones de usuario

- La API firma JWT de acceso con HS256, `iss=grumphya-api`, `aud=grumphya-web`, `sub` UUID, `jti` UUID aleatorio por emisión y vencimiento de 10 minutos. `ACCESS_TOKEN_SECRET` es obligatorio y debe aportar al menos 32 bytes; se carga desde el secret manager en despliegue y el script local genera un secreto aleatorio en `.env.docker` ignorado por Git.
- El access token viaja en `Authorization: Bearer` y se conserva solo en memoria del navegador. Los endpoints de perfil, ideas aprobadas, contratación de plan y baja requieren firma válida y una fila de sesión activa en SQL.
- Las rutas protegidas autentican con `Authorization: Bearer <accessToken>`. El refresh token no autoriza endpoints: es aleatorio, solo se entrega en cookie `HttpOnly`, `SameSite=Strict`, `Secure` en producción, `Path=/api`; la base almacena su hash. Cada refresh rota el refresh token y el hash del JWT activo. La migración `016_auth_refresh_rotation_history.sql` guarda el hash del refresh anterior a la última rotación en `previous_refresh_token_hash` (nunca el token claro); el siguiente refresh lo reemplaza. `POST /api/auth/logout` revoca la sesión con el hash actual o el inmediatamente anterior, para cubrir una llamada de logout que se solape con una rotación. Un token de dos o más rotaciones atrás no se acepta.
- «Recordarme» fija una vigencia máxima de 30 días desde el login. Sin marcarlo, la cookie es de sesión y la sesión caduca en servidor a las 24 horas. La rotación no amplía la fecha absoluta de caducidad.
- La renovación concurrente comparte una sola petición dentro de la pestaña y el estado de logout no se restaura tras limpiar la sesión. Aún no hay coordinación single-flight entre pestañas: si dos pestañas renuevan a la vez, el backend falla cerrado y una puede pedir iniciar sesión de nuevo aunque la otra conserve una sesión válida. La coordinación entre pestañas queda pendiente; este comportamiento no concede acceso a una sesión inválida.
- Login limita los intentos por IP, usa un mensaje genérico para credenciales inválidas y verifica las contraseñas existentes con scrypt. Las mutaciones con cookie exigen `Origin` exacto y JSON; el borrado de cuenta también se limita y valida CSRF.

## Rotación y respuesta

Ante una exposición: revoca la credencial en el proveedor, genera otra, actualiza el secret manager, reinicia/rota sesiones afectadas y revisa logs de acceso. Borrar un secreto del último commit no lo revoca: hay que rotarlo en origen.

No incluyas valores reales de contraseñas, claves, tokens, cookies de sesión o DSN privados en documentación, capturas o ejemplos. Usa nombres y placeholders como `<secreto-inyectado-por-secret-manager>`.
