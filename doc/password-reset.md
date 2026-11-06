# Recuperación de contraseña

La pantalla `/recuperar-contrasena` responde con el mismo mensaje para cualquier dirección, exista o no una cuenta elegible. `POST /api/auth/password-reset/request` admite cinco solicitudes por minuto y dirección IP en un contador propio, separado del límite de renovación de sesión; la sexta devuelve `429` con `Retry-After`. Este límite se mantiene en cada proceso de la API y se suma al límite general de peticiones. El backend aplica además un límite por cuenta de tres solicitudes por hora, con al menos 60 segundos entre intentos aceptados. La respuesta tarda al menos 450 ms para reducir diferencias observables. Solo se permite el flujo para cuentas activas con rol `user`; Jappy y otras cuentas admin quedan excluidas.

Cada solicitud válida rota el token anterior. PostgreSQL guarda su hash SHA-256, la caducidad y el contador de intentos; el token en claro solo aparece en el fragmento del enlace enviado por SMTP y la pantalla lo elimina de la barra de direcciones tras leerlo. El enlace usa `WEB_ORIGIN` y `/restablecer-contrasena#…`; en producción `WEB_ORIGIN` debe ser HTTPS.

El enlace caduca en 20 minutos y solo se consume una vez. Al guardar la contraseña, el servidor aplica la misma política que el registro, guarda bcrypt cost 12 sobre un prehash SHA-256 hexadecimal (`bcrypt-sha256`) y revoca las sesiones activas dentro de la misma transacción. El flujo nunca crea una sesión nueva. Los correos de recuperación usan la plantilla Grumphya HTML y texto plano. Sin SMTP en desarrollo, se genera una vista previa local en memoria; no equivale a un envío. El envío es asíncrono: ante fallo SMTP se invalida el token y se registra solo un código de error, sin correo, token ni contraseña.

Si el enlace falta, no tiene un formato válido o ya caducó/se consumió, la
pantalla muestra el formulario para solicitar otro. Si el servidor detecta que
el enlace dejó de ser válido al guardar, informa del problema y cambia también
a ese formulario; los errores de política de contraseña conservan el formulario
de cambio para corregirla. El fragmento con el token se elimina de la barra de
direcciones al abrir la página.

La suite cubre la lógica con transporte SMTP simulado. El test de integración del repositorio PostgreSQL usa un esquema aislado en la base indicada por `REGISTRATION_TEST_DATABASE_URL`, la misma que configura CI para los tests de registro; no apunta al esquema de aplicación.
