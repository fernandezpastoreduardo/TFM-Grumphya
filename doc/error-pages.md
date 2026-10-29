# Páginas de error

Las páginas de error usan el marco visual ya existente: navegación, telón,
público, selector de tema y pie de página. El contenido de error no repite esas
capas. Cada estado usa una ilustración SVG transparente optimizada que integra mascota,
accesorios, escala, posición y solapes de la lámina aprobada:
`apps/web/public/assets/grumphya/error-scene-{404,429,500}.svg`. El escenario
se presenta como una sola capa decorativa para mantener la composición unida;
el copy y las acciones siguen siendo HTML accesible. En escritorio, el centro
visual de la escena queda alineado con el centro de la columna de información;
en móvil, la escena pasa debajo del contenido y mantiene su escala completa.

## Casos conectados

- **404:** `SectionPage` muestra la pantalla cuando la ruta no existe. El copy
  explica que la sección no está disponible y ofrece volver al inicio o atrás.
- **500:** `ErrorPagesBoundary` captura excepciones de renderizado de React,
  muestra un mensaje seguro y registra únicamente `UI_RENDER_FAILURE`. «Volver
  al inicio» navega a Home y «Reintentar» recarga la página.
- **429:** el límite temporal `ANONYMOUS_PROFILE_RATE_LIMITED` que responde
  `POST /api/anonymous-usage` muestra la página con el tiempo `Retry-After`
  calculado por el cliente. Las respuestas 429 de formularios y otros
  endpoints se mantienen junto a su interacción para conservar contexto y
  permitir reintentar.

Un error HTTP 500 de la API en una operación no activa por sí solo el límite de
errores de React; cada formulario conserva su mensaje recuperable y sus datos.
El límite actual captura fallos de renderizado del frontend.

## Revisión visual local

Con Vite en desarrollo, abre estas rutas para mostrar los tres estados sin
generar fallos ni consumir cuotas:

```text
/__preview/errors/404
/__preview/errors/429
/__preview/errors/500
```

Las rutas de previsualización solo se habilitan con `import.meta.env.DEV`; no se
incluyen como rutas de diagnóstico en el build de producción. La suite E2E
comprueba las previsualizaciones y el enrutado real de una URL desconocida.

En producción, el servidor que sirve la SPA debe devolver `index.html` para las
rutas frontend desconocidas para que React pueda presentar el 404. Si el
servidor responde con su propia página antes de cargar la aplicación, esa
respuesta debe adoptar la misma identidad por separado.
