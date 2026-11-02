# Roadmap ejecutable de Desarrollo Seguro

## Uso de esta carpeta

Esta carpeta define el siguiente incremento del prototipo académico dentro de TFM-Grumphya. Luna debe leerla antes de implementar y contrastar cada ruta propuesta con el código vigente de main. El documento plan-desarrollo-seguro.md conserva la visión completa; este README y los documentos enlazados fijan el **alcance autorizado para la fase inicial**. Si una frase del plan estratégico parece pedir escaneo remoto, dominio propio o certificación, prevalece el alcance de esta carpeta para este incremento.

Orden de lectura y trabajo:

1. [features.md](features.md): historias y resultados observables.
2. [controls-and-evidence.md](controls-and-evidence.md): qué evidencias se pueden afirmar.
3. [DTOs.md](DTOs.md): contratos públicos y validación.
4. [persistence.md](persistence.md): datos y migración.
5. [components.md](components.md): ubicación y dependencias.
6. [test-plan.md](test-plan.md): pruebas.
7. [execution.md](execution.md): secuencia para Luna y criterios de cierre.

## Alcance de la fase inicial

La fase inicial se desarrolla **dentro del repositorio y despliegue existentes de Grumphya**. Conserva el carácter ficticio y académico de Desarrollo Seguro. Añade una búsqueda de dominios, una ficha alimentada por datos persistidos y evidencias internas verificables del propio proyecto. Solo grumphya.com tendrá un caso de demostración; buscar cualquier otro dominio mostrará «Sin evaluación disponible». Una búsqueda no inicia tráfico hacia el dominio introducido.

Se puede preparar el modelo y las interfaces del futuro escáner, pero **no se activa escaneo de red, planificador horario, cola de trabajos remotos, navegación contra sitios ajenos ni afirmación de vigencia de una hora** en este incremento. Tampoco se emite una certificación ni se verifica internamente un sitio remoto. El resultado visible se identifica siempre como «Demostración académica» y explica cuándo se recogió cada evidencia y sus límites. El objetivo es una base comprobable y portable, no simular una comprobación que no ocurrió.

Esta delimitación traduce la indicación de abordar más adelante las garantías del escaneo interno/remoto. Si el alcance futuro se redefine, se actualizan primero estos contratos y el criterio público, y después se implementa el motor.

## Estado comprobado antes de comenzar

- El prototipo estático se sirve en /desarrollo-seguro/ desde prototype/index.html y prototype/styles.css, con CSP que prohíbe scripts y formularios.
- El sello del footer enlaza a /desarrollo-seguro/#sello. Su imagen y texto se sirven localmente; el componente consulta la API en el mismo origen.
- La ficha React /acreditaciones/DS-GRUMPHYA-2026-001 consulta GET /api/accreditations/:id. El registro de Grumphya está fijado en get-accreditation.service.ts con estado demonstration y fechas manuales.
- No hay buscador, base de datos de acreditaciones ni escáner. [Estado documentado](../../doc/desarrollo-seguro.md).

Luna debe volver a comprobar estos hechos al iniciar, porque main puede cambiar. No debe reescribir otras áreas de Grumphya para acomodar la demo.

## Reglas de producto

- Una ficha de prueba interna no se denomina «certificación», «conforme», «aprobada» ni «verificación externa vigente».
- Las fechas heredadas se conservan como fechas históricas de la ficha. No se sustituyen por la fecha de despliegue, consulta o carga.
- Ningún dato se inventa para un dominio sin caso registrado. No se crea un resultado por buscarlo.
- La UI nunca contacta un tercero, y el backend no contacta al dominio buscado en esta fase.
- El sello sigue siendo una imagen local y un enlace del mismo origen. Fallos de la API ocultan la imagen y dejan enlace textual.
- No se añade analítica, cookies nuevas, recursos externos ni scripts en Grumphya por esta función.
- Mantener el contrato existente GET /api/accreditations/:id mientras la ficha actual lo use; cualquier evolución debe ser compatible o migrar consumidor y pruebas en el mismo cambio.

## Entregables de la fase

Una búsqueda accesible en el prototipo, una ruta React de resultado, un endpoint de consulta sin red, un registro de Grumphya persistido con evidencias internas y límites, pruebas unitarias/de integración/E2E, documentación del estado real y una demostración de que la consulta de un dominio desconocido no produce escaneo ni acreditación.

El paso a escaneo externo/horario y el traslado a desarrolloseguro.com requieren otra decisión de alcance. Véase [plan-desarrollo-seguro.md](plan-desarrollo-seguro.md) para la visión posterior.
