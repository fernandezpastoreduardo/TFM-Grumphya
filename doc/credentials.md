# Usuarios, credenciales y secretos

## Lo que existe ahora

- GitHub: repositorio privado `fernandezpastoreduardo/TFM-Grumphya`; el acceso se realiza mediante la sesión SSH/CLI ya configurada en el equipo. No copiar ni documentar su token o clave privada.
- Desarrollo Docker PostgreSQL: base/rol `grumphya_dev`, puerto enlazado solo a `127.0.0.1:5433`; `pnpm db:setup` genera una contraseña aleatoria en `.env.docker` con permisos `0600`. El archivo está ignorado por Git.
- PostgreSQL Homebrew preexistente: la base y extensión creadas en la verificación inicial permanecen en `5432`; el flujo de la app usa el contenedor independiente en `5433`.
- Cuentas Grumphya: el alta con plan, verificación local simulada, activación de plan simulada y refresh de sesión están implementados; el login general y la cuenta administrativa no están implementados. Revisa [plan de seguridad del registro y similitud](security-and-similarity-roadmap.md) para los controles existentes y pendientes del alta.
- Embeddings: adaptador OpenAI API `text-embedding-3-small` implementado. `OPENAI_API_KEY` se configura en el archivo local ignorado `.env.openai`; el valor y la vigencia de la clave no se documentan ni se muestran, y deben gestionarse desde OpenAI Platform. El evaluador requiere además activar `EVALUATION_PROVIDER=openai` en `.env.openai` antes de procesar evaluaciones. Pagos, correo real y producción siguen sin configurar.

## Cómo tratar secretos futuros

- En local, guarda secretos en un gestor de credenciales del sistema o archivo ignorado por Git con permisos de usuario. No reutilices `.env` compartidos ni los adjuntes a issues.
- En despliegue, usa el secret manager/variables protegidas del proveedor y limita quién puede leerlos.
- La contraseña de cada usuario final debe guardarse mediante un hash moderno para contraseñas (Argon2id preferente; alternativa revisada y parametrizada), con límites de intentos y mensajes de login genéricos.
- Los refresh tokens deben ser aleatorios, almacenarse de forma revocable/hasheada en servidor y salir únicamente en cookie `HttpOnly`, `Secure`, `SameSite` según la especificación funcional.
- Claves de firma, cifrado, DB runtime, migrador, proveedor IA y GitHub/deploy son secretos distintos por entorno; no compartir credenciales entre staging y producción.
- Nunca registrar tokens, contraseñas, cookies, audio, texto privado de ideas o secretos en logs/telemetría.

## Rotación y respuesta

Ante una exposición: revoca la credencial en el proveedor, genera otra, actualiza el secret manager, reinicia/rota sesiones afectadas y revisa logs de acceso. Borrar un secreto del último commit no lo revoca: hay que rotarlo en origen.

No incluyas valores reales de contraseñas, claves, tokens, cookies de sesión o DSN privados en documentación, capturas o ejemplos. Usa nombres y placeholders como `<secreto-inyectado-por-secret-manager>`.
