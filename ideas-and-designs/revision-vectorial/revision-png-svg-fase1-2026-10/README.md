# Revisión SVG — fase 1

Rama: `feat/ui`. Esta carpeta conserva propuestas y material de revisión; sus
archivos no son los assets servidos por la app.

## Estado de los assets en la app

Después de esta revisión, 27 ilustraciones se sirven como SVG optimizados en
`apps/web/public/assets/grumphya/`. El telón (`stage-curtain-v2.webp`) y el
público (`audience-rounded.webp`) permanecen en WebP. Los SVG fuente de estas
dos capas y las demás vectorizaciones originales se conservan en
`svg-vectorizados-originales-adjuntos-2026-10/`; las salidas optimizadas se
guardan en `svgomg-optimized/`. Las referencias activas de la interfaz se
actualizaron para usar los SVG y conservar los dos WebP.

## Método

Se inspeccionó `ideas-and-designs/revision-vectorial/revisados/grumphya_boxeo_vectorizado_v2.svg` como referencia visual. No se encontró el script ni un registro verificable de los pasos exactos de aquella conversión, así que estas propuestas usan un procedimiento equivalente: cuantización adaptativa de hasta 64 colores, contornos por regiones, curvas Bézier con vértices angulares conservados, suavizado espacial leve y transparencia exterior. Los SVG contienen trazados vectoriales; no incrustan los PNG/WebP.

El telón y el público se trazaron desde los WebP actualmente referenciados por la app; las vectorizaciones de pruebas antiguas se dejaron fuera.

## Archivos

Los SVG mantienen el nombre base de cada asset fuente:
- `admin-dashboard-audit.png` → [`svg/admin-dashboard-audit.svg`](svg/admin-dashboard-audit.svg)
- `contact-form-vanishing.png` → [`svg/contact-form-vanishing.svg`](svg/contact-form-vanishing.svg)
- `contact-hero-phone.png` → [`svg/contact-hero-phone.svg`](svg/contact-hero-phone.svg)
- `contact-message-tube.png` → [`svg/contact-message-tube.svg`](svg/contact-message-tube.svg)
- `create-account-hero.png` → [`svg/create-account-hero.svg`](svg/create-account-hero.svg)
- `create-account-plan.png` → [`svg/create-account-plan.svg`](svg/create-account-plan.svg)
- `descargate-boxing-bag.png` → [`svg/descargate-boxing-bag.svg`](svg/descargate-boxing-bag.svg)
- `error-scene-404.png` → [`svg/error-scene-404.svg`](svg/error-scene-404.svg)
- `error-scene-429.png` → [`svg/error-scene-429.svg`](svg/error-scene-429.svg)
- `error-scene-500.png` → [`svg/error-scene-500.svg`](svg/error-scene-500.svg)
- `evaluation-error-spilled-coffee.png` → [`svg/evaluation-error-spilled-coffee.svg`](svg/evaluation-error-spilled-coffee.svg)
- `good-practices-checklist.png` → [`svg/good-practices-checklist.svg`](svg/good-practices-checklist.svg)
- `good-practices-companion-pink.png` → [`svg/good-practices-companion-pink.svg`](svg/good-practices-companion-pink.svg)
- `good-practices-companion-yellow.png` → [`svg/good-practices-companion-yellow.svg`](svg/good-practices-companion-yellow.svg)
- `good-practices-validate-idea.png` → [`svg/good-practices-validate-idea.svg`](svg/good-practices-validate-idea.svg)
- `idea-tone-hard-boxing-v2.png` → [`svg/idea-tone-hard-boxing-v2.svg`](svg/idea-tone-hard-boxing-v2.svg)
- `idea-tone-soft-bandage-v2.png` → [`svg/idea-tone-soft-bandage-v2.svg`](svg/idea-tone-soft-bandage-v2.svg)
- `login-credentials.png` → [`svg/login-credentials.svg`](svg/login-credentials.svg)
- `login-privacy.png` → [`svg/login-privacy.svg`](svg/login-privacy.svg)
- `mascot-isotype.png` → [`svg/mascot-isotype.svg`](svg/mascot-isotype.svg)
- `notable-humans-callout.png` → [`svg/notable-humans-callout.svg`](svg/notable-humans-callout.svg)
- `notable-humans-hero.png` → [`svg/notable-humans-hero.svg`](svg/notable-humans-hero.svg)
- `plans-coffee.png` → [`svg/plans-coffee.svg`](svg/plans-coffee.svg)
- `profile-account-shield.png` → [`svg/profile-account-shield.svg`](svg/profile-account-shield.svg)
- `roast-plan-callout.png` → [`svg/roast-plan-callout.svg`](svg/roast-plan-callout.svg)
- `special-idea-coffee-slippers.png` → [`svg/special-idea-coffee-slippers.svg`](svg/special-idea-coffee-slippers.svg)
- `ultrachachi-reality-check.png` → [`svg/ultrachachi-reality-check.svg`](svg/ultrachachi-reality-check.svg)
- `stage-curtain-v2.webp` → [`svg/stage-curtain-v2.svg`](svg/stage-curtain-v2.svg)
- `audience-rounded.webp` → [`svg/audience-rounded.svg`](svg/audience-rounded.svg)

## Comparativas

Las hojas PNG de `comparativas/` muestran el recurso fuente y su SVG renderizado sobre el mismo fondo de cuadrícula.
