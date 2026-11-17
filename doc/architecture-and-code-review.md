# Arquitectura y revisión humana

Esta guía describe cómo debe organizarse el código para que otra persona pueda
entenderlo y revisarlo. La estructura no se decide por el tamaño del archivo:
se decide por las responsabilidades que contiene.

## Regla principal

Aplicamos SOLID y, sobre todo, el principio de responsabilidad única. Una
responsabilidad es una razón de cambio coherente: una regla de negocio, un
contrato de datos, una validación, una operación contra la API o una pieza de
presentación.

Cada pieza debe estar en el módulo que expresa esa responsabilidad:

| Responsabilidad                                     | Ubicación habitual                        |
| --------------------------------------------------- | ----------------------------------------- |
| Tipos y contratos de una feature                    | feature-name/*.models.ts                  |
| Constantes y copy reutilizable dentro de la feature | feature-name/*.constants.ts               |
| Validación de datos externos                        | feature-name/*.validation.ts              |
| Formateo y funciones puras                          | feature-name/*.formatters.ts o *.utils.ts |
| Peticiones y operaciones de datos                   | feature-name/*.service.ts                 |
| Estado, efectos y coordinación de UI                | feature-name/use-*.ts                     |
| Maquetado y comportamiento presentacional           | feature-name/components/                  |
| Coordinación de la feature                          | feature-name/feature-name.tsx             |

Estos nombres son una guía visible para la revisión. Si una responsabilidad no
encaja, se elige un nombre que describa el comportamiento de negocio y se
documenta la decisión.

## El número de líneas no decide

Un módulo de cinco líneas se separa si mezcla responsabilidades distintas.
Por ejemplo, un componente pequeño no debe declarar a la vez el contrato de
datos, una constante de negocio y una petición HTTP solo porque el archivo sea
corto. La separación puede producir módulos pequeños; eso es correcto cuando
cada módulo tiene una razón de cambio clara.

Del mismo modo, no se divide un archivo solo para reducir su contador de
líneas. Una página estática que solo representa copy y estructura puede seguir
siendo un único componente porque tiene una sola responsabilidad. La decisión
debe poder explicarse en términos de comportamiento, no de tamaño.

## Regla de alcance

- Si una pieza la usa una sola feature, permanece dentro de esa feature.
- Si dos o más features la usan realmente, pasa a shared/.
- No se mueve código a shared/ por anticipar un uso futuro.
- La carpeta y el nombre deben revelar qué hace la aplicación; evitar nombres
  técnicos que oculten la funcionalidad.

## Contenedor y presentación

El archivo principal de una feature conserva la responsabilidad de coordinar:

1. Obtener el estado del hook.
2. Conectar handlers con servicios y componentes.
3. Elegir el estado de carga, error o contenido.
4. Renderizar el componente de presentación apropiado.

No debe contener simultáneamente la validación de payloads, la implementación
de las peticiones, el formateo de fechas y toda la maqueta de la página.

Ejemplos vigentes:

- idea-evaluation: idea-evaluation.tsx coordina el flujo;
  use-idea-evaluation.ts mantiene el estado y los efectos; los componentes
  de components/ representan cada zona de la UI. evaluation-process.ts conserva
  la interfaz de importación anterior; las peticiones están en
  evaluation-service.ts y la validación de respuestas en evaluation.validation.ts.
- roast: RoastInput.tsx representa el formulario;
  use-roast-input.ts coordina el envío; roast-input.service.ts encapsula la
  operación HTTP; los modelos y constantes están separados.
- user-profile: user-profile.tsx compone las secciones del perfil;
  use-user-profile.ts gestiona estado y transiciones;
  user-profile.service.ts ejecuta las operaciones de datos y usa los
  contratos comprobados en user-profile.validation.ts.
- admin-dashboard: admin-dashboard.tsx elige la pestaña y compone la vista;
  use-admin-dashboard.ts coordina la carga; admin-dashboard.service.ts consulta
  la API; los archivos admin-dashboard.validation.*.ts validan cada bloque del
  contrato, y tabs/ contiene la presentación de cada sección.

## Lista de revisión humana

Antes de aprobar un cambio, comprueba:

- ¿Cada tipo, constante, operación de datos, validación, formateador y pieza
  de UI se puede encontrar en un módulo con nombre claro?
- ¿El contenedor de la feature coordina en lugar de implementar todas las
  responsabilidades?
- ¿Los datos externos se validan como unknown antes de usarse?
- ¿La regla de alcance se ha aplicado con usos reales?
- ¿La extracción conserva los contratos, estados de error, accesibilidad y
  comportamiento observable?
- ¿Una persona que no conoce el cambio puede seguir el flujo leyendo primero
  el contenedor y después sus módulos especializados?
- ¿Se añadieron o actualizaron pruebas de comportamiento cuando cambió una
  operación, una validación o una transición de UI?

## Verificación local

Después de reorganizar una feature, ejecuta las puertas locales que permita el
entorno:

    pnpm lint
    pnpm typecheck
    pnpm test
    pnpm format:check
    git diff --check

Las pruebas que necesitan abrir sockets locales requieren el permiso de entorno
correspondiente. Estas comprobaciones son locales y no sustituyen una revisión
humana del diseño.
