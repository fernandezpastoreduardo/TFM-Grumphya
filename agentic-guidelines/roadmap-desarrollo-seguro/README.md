# Roadmap operativo de Desarrollo Seguro dentro de Grumphya

## Decisión vigente

La primera fase operativa se ejecutará en el **mismo VPS, dominio grumphya.com, repositorio TFM-Grumphya y despliegue manual aprobado**. Incluirá un escáner real de bajo impacto, resultados persistidos, comprobación horaria del dominio inscrito grumphya.com y análisis bajo demanda desde el sello o la búsqueda. Desarrollo Seguro seguirá siendo una iniciativa académica del mismo operador: el informe dirá «verificación técnica automatizada de superficies públicas desde el VPS de Grumphya», con páginas, hora, controles y límites. No afirmará independencia de red, auditoría externa, certificación oficial, cumplimiento RGPD ni ausencia de vulnerabilidades.

La fase posterior podrá mover el servicio a su propio dominio, repo, base/volumen y despliegue, y obtener una perspectiva de red verdaderamente remota. También queda para más adelante cualquier prueba de controles internos que no se pueda observar desde HTTP/TLS/navegador público. La limitación actual no justifica simular resultados: cada resultado operativo procederá de una ejecución real.

## Orden de lectura para Luna

1. [features.md](features.md): capacidades, prioridades y aceptación.
2. [controls-and-evidence.md](controls-and-evidence.md): perfil de controles y lenguaje público.
3. [scanner-safety.md](scanner-safety.md): límites de red y protección del VPS.
4. [DTOs.md](DTOs.md): contratos de API y estados.
5. [persistence.md](persistence.md): casos, trabajos y resultados.
6. [components.md](components.md): límites de código, procesos y rutas.
7. [operations.md](operations.md): integración con el despliegue actual.
8. [test-plan.md](test-plan.md): TDD y pruebas de bloqueo.
9. [execution.md](execution.md): slices ordenados y puertas de publicación.
10. [plan-desarrollo-seguro.md](plan-desarrollo-seguro.md): visión completa y fases posteriores.

Este README y los documentos 1–9 definen la primera fase. El plan general se interpreta conforme a ellos. Luna debe volver a revisar main antes de programar: las rutas y scripts pueden cambiar.

## Límites de separación dentro del monorepo

El código de negocio, web, API, worker, migraciones y datos de Desarrollo Seguro tendrán nombres y carpetas propias. El único contacto con Grumphya será: un enlace/sello local en su footer, las rutas del proxy/Nginx, la instancia física de PostgreSQL, el Compose y la release compartida. No importar servicios de ideas, cuentas, planes, OpenAI, correo ni sesiones de Grumphya al núcleo de Desarrollo Seguro. No reutilizar credenciales de aplicación ni tablas de Grumphya. El recurso visual del sello no cargará dominios de terceros.

La primera fase puede dejar la landing estática de prototype/ como introducción y montar la aplicación de consulta bajo /desarrollo-seguro/app/. La imagen S4 actual contiene «Aplicación certificada»; antes de mostrar un estado operativo, cambiarla por un sello local neutral o por un enlace textual. La ficha académica actual se preserva o se marca histórica y remite al informe operativo, sin mezclar fechas manuales con escaneos reales.

## Qué cuenta como primera fase operativa completada

- grumphya.com inscrito como caso propio y escaneado automáticamente al menos en varios ciclos horarios reales, desde el worker del VPS, con historial y caducidad.
- Un clic en el sello y una búsqueda usan el mismo mecanismo: resultado de menos de 60 minutos se reutiliza; si está vencido, se inicia un solo trabajo y la página muestra «en curso» hasta completarse.
- Un dominio público no inscrito puede obtener un diagnóstico puntual acotado y sujeto a cuota. No recibe sello ni monitorización horaria por esa consulta.
- TLS, HTTP, cabeceras, recursos/cookies en navegador limpio y calidad básica se valoran solo sobre las URLs muestreadas. Error o cobertura insuficiente se presentan como «no evaluable».
- El worker no puede alcanzar redes internas, metadatos ni puertos ajenos a 80/443; la protección se prueba con redirecciones y DNS adversarios. Los límites de CPU/memoria y la carga real del VPS superan la puerta de [operations.md](operations.md).
- El despliegue sigue el flujo actual: PR con CI, release desde main mediante workflow_dispatch con confirmación manual. No se publica un escáner abierto si falla una puerta de seguridad o capacidad.

Este turno solo actualiza documentación. Luna ejecutará la fase cuando se le encargue; leer estos documentos no inicia escaneos ni despliegues.
