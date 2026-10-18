# Baja física de cuenta

## Comportamiento

La página de perfil ofrece la acción «Darme de baja y BORRAR MI CUENTA». Antes de enviar la
solicitud se abre un diálogo accesible que explica que la eliminación es
inmediata e irreversible y afecta al usuario, sus ideas aprobadas, sus planes,
sesiones e intentos restantes. «Cancelar» cierra el diálogo sin enviar una
solicitud. «Confirmo que quiero darme de baja» inicia el proceso.

La interfaz envía `DELETE /api/account` con `Content-Type: application/json`.
La ruta está protegida por `AccessTokenGuard`; el identificador del usuario
procede exclusivamente de `request.user.userId`, nunca de parámetros o del
cuerpo de la solicitud. Al completar, la API responde `{"deleted":true}` y
borra la cookie HttpOnly de refresh. La interfaz redirige a la página inicial.
La operación elimina también el archivo privado del avatar del usuario; la URL
pública de ese avatar deja de servirlo tras la baja.

## Persistencia y privacidad

`PostgresUserDeleteRepository` bloquea el registro de `users` y ejecuta la
operación en una transacción. Borra explícitamente `simulated_purchases` y
`subscriptions`, cuyas claves foráneas históricas no tienen borrado en cascada,
y elimina después el registro de `users`. Las claves foráneas de `auth_sessions`,
`pending_registrations`, `account_daily_plan_usage` y `approved_ideas` eliminan
físicamente los datos dependientes al borrar el usuario. Las ideas rechazadas
son agregadas y anónimas, no contienen una relación de usuario que pueda
eliminarse.

Antes de retirar el archivo de avatar, el repositorio conserva temporalmente
una copia en memoria. Si falla una consulta o el `COMMIT`, revierte la
transacción y restaura el archivo. Si también falla la restauración, registra
un error sin datos personales; en ese caso el usuario de SQL permanece por el
rollback, pero el avatar podría faltar y requerir reparación operativa.

No se realiza un borrado lógico ni se conservan datos de perfil para recuperar
la cuenta. El endpoint solo usa la identidad autenticada actual. Un identificador
ausente, inválido o asociado a una sesión caducada se responde como sesión no
autenticada. Los fallos de base de datos revierten la transacción SQL; la
restauración del archivo tras un fallo se intenta y su posible fallo se registra.

## Cobertura automatizada

Las pruebas de servicio cubren identidad válida, identidad inválida y sesión sin
usuario. Las pruebas del repositorio comprueban orden de borrado transaccional y
el caso en que el usuario ya no existe. Las pruebas de interfaz cubren el texto
de confirmación, Cancelar, la solicitud de borrado y el error del servidor.
