# Componentes y límites de arquitectura

## Regla de ubicación

Aplicar AGENTS.md: un componente usado por una feature queda dentro de ella; si se usa por dos o más, pasa a shared. El nombre de la feature describe la función de negocio. El contenedor React principal conserva el nombre de la feature. Evitar crear un paquete genérico «scanner» hasta que exista un segundo consumidor real.

## Mapa actual a conservar

- prototype/index.html y prototype/styles.css: landing académica bajo /desarrollo-seguro/. No convertirla en una segunda SPA para esta fase.
- apps/web/src/shared/components/accreditation-seal.tsx: sello compartido del footer. Mantener imagen local y consulta al mismo origen.
- apps/web/src/features/accreditation-verification/: ficha del caso.
- apps/web/src/shared/accreditation-verification.ts: contrato/cliente usado por sello y ficha; sigue en shared por sus dos consumidores.
- apps/api/src/verify-accreditation/: caso de uso, controlador y módulo actuales.
- apps/api/migrations/ y registro en run-migrations.ts: migraciones versionadas de PostgreSQL.

## Componentes propuestos

| Componente | Responsabilidad | Ubicación orientativa |
| --- | --- | --- |
| Formulario estático de búsqueda | Enviar hostname por GET al mismo origen; sin JavaScript ni terceros | prototype/index.html |
| DomainLookup | Contenedor de búsqueda: leer parámetro, consultar API, estados de carga y navegación | apps/web/src/features/domain-lookup/domain-lookup.tsx |
| DomainLookupForm, LookupResult | Presentación pura; datos y callbacks por props | components/ dentro de domain-lookup |
| Cliente de consulta | Parsear respuesta desconocida y exponer unión discriminada; solo compartido si también lo usa la ficha | local en domain-lookup; mover a shared solo tras segundo uso |
| GetDomainCase | Validación, normalización y consulta por dominio; nunca realiza red externa | apps/api/src/verify-accreditation/ o subcarpeta de negocio |
| GetAccreditation | Proyección compatible del registro por ID | conservar caso de uso existente |
| AccreditationRepository | Puerto de lectura; implementación PostgreSQL y doble en memoria para pruebas | feature backend + infraestructura de DB existente |
| EvidencePresenter | Filtrar y redactar solo campos públicos; sin cuerpos completos ni secretos | feature backend |
| Clock | Fecha inyectable en casos de uso y pruebas | local hasta que otra feature lo use |

El módulo NestJS de esta fase puede seguir llamándose verify-accreditation para minimizar churn. Si Luna decide renombrarlo a development-security, debe hacerlo en un cambio coherente con imports, endpoints y tests, sin alterar el comportamiento público. No duplicar dos fuentes de verdad para el mismo registro.

## Flujo de lectura

1. El formulario de /desarrollo-seguro/ navega a /acreditaciones/buscar?dominio=….
2. DomainLookup valida para UX, envía GET /api/development-security/domains/:hostname y valida la respuesta recibida en runtime.
3. GetDomainCase normaliza y busca en el repositorio. Devuelve caso conocido o «sin evaluación»; no crea trabajo ni consulta DNS.
4. El enlace al caso conocido lleva a /acreditaciones/DS-GRUMPHYA-2026-001.
5. La ficha y el sello siguen usando GET /api/accreditations/:id. Ambos reciben una proyección del mismo caso persistido.
6. Si falla API/DB, la UI informa de error temporal; el sello oculta la imagen.

## Límite de extracción

La parte portable son DTOs de dominio, normalizador, catálogo de evidencias, casos de uso y tablas ds_. La parte acoplada son adaptadores de ruta React/Nest, Nginx, imágenes locales y la integración del footer. Mantener dependencias hacia el núcleo de Desarrollo Seguro en un solo sentido; no permitir imports desde el núcleo hacia cuentas, planes, evaluaciones, administración o datos personales de Grumphya.

La futura aplicación tendrá web/API/worker, base y Compose propios. Ese diseño no autoriza construir ahora worker, scheduler, Caddy adicional ni conexiones salientes de escaneo.
