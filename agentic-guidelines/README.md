# Guía de lectura para agentes

Esta carpeta reúne contexto de producto y criterios de implementación para agentes que trabajen en Grumphya. No es la guía principal para usuarios, operadores ni colaboradores humanos: para instrucciones de uso, desarrollo y operación, empieza por [`../doc/README.md`](../doc/README.md) y sigue los enlaces de esa guía.

## Orden de autoridad

Aplica estas fuentes en este orden y resuelve cualquier discrepancia antes de cambiar el comportamiento:

1. Instrucciones explícitas más recientes de la persona responsable y reglas del repositorio en `AGENTS.md`.
2. Código, configuración, migraciones y pruebas actuales para describir qué hace el sistema hoy. Si contradicen un requisito aprobado, informa de la diferencia; no conviertas el comportamiento existente en una decisión de producto.
3. Especificación dedicada de la funcionalidad o contrato. Una especificación enlazada desde otra guía prevalece sobre su resumen cuando ambas describen el mismo tema.
4. Guías generales de producto, UX, arquitectura y calidad de esta carpeta.
5. Roadmaps, planes de fase y notas de trabajo, que solo autorizan alcance cuando una instrucción actual encarga esa fase.

`wanna-bes.md` es un registro de propuestas y contexto, no una lista de tareas aprobadas. Sus entradas con estado «implementado» describen decisiones o trabajo ya realizado; las pendientes requieren priorización. Los apartados identificados como históricos describen la fecha que indican, no el estado actual.

## Lectura rápida por tipo de tarea

| Si vas a…                                            | Lee primero                                                                  | Consulta también                                                                                           |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Entender producto, alcance y criterios de aceptación | [`sections.md`](sections.md)                                                 | [`features.md`](features.md), [`copy-style.md`](copy-style.md)                                             |
| Implementar o modificar una funcionalidad            | [`features.md`](features.md)                                                 | El contrato de [`Dtos.md`](Dtos.md), [`persistence.md`](persistence.md) y la guía de componente pertinente |
| Cambiar evaluación, puntuación o seguridad de IA     | [`scoring-viability-software.md`](scoring-viability-software.md)             | [`ai-evaluation.md`](ai-evaluation.md), [`features.md`](features.md), [`Dtos.md`](Dtos.md)                 |
| Diseñar interfaz o microcopy                         | [`UI-aestethics.md`](UI-aestethics.md)                                       | [`copy-style.md`](copy-style.md), [`sections.md`](sections.md), [`components.md`](components.md)           |
| Cambiar persistencia o contratos de API              | [`persistence.md`](persistence.md) o [`Dtos.md`](Dtos.md), según corresponda | [`features.md`](features.md) y el esquema/código actual                                                    |
| Explorar una mejora todavía no priorizada            | [`wanna-bes.md`](wanna-bes.md)                                               | No la implementes sin encargo o aprobación de alcance                                                      |
| Trabajar en Desarrollo Seguro                        | [`roadmap-desarrollo-seguro/README.md`](roadmap-desarrollo-seguro/README.md) | Sigue su orden de lectura y sus límites de fase                                                            |

## Alcance de los documentos

- [`sections.md`](sections.md) describe pantallas, recorridos y criterios generales de producto. Es el mapa amplio de la experiencia, no el contrato exhaustivo de cada endpoint.
- [`features.md`](features.md) agrupa capacidades y reglas funcionales. Para temas que delega explícitamente a otra especificación, usa esa especificación como detalle vigente.
- [`scoring-viability-software.md`](scoring-viability-software.md) es la especificación dedicada de evaluación y scoring; [`ai-evaluation.md`](ai-evaluation.md) cubre evaluación comparativa y límites de seguridad de IA.
- [`Dtos.md`](Dtos.md) define contratos y comportamientos observables de API. [`persistence.md`](persistence.md) define decisiones y relaciones de almacenamiento.
- [`components.md`](components.md), [`UI-aestethics.md`](UI-aestethics.md) y [`copy-style.md`](copy-style.md) orientan estructura de componentes, presentación visual y voz de interfaz, respectivamente.
- [`roadmap-desarrollo-seguro/`](roadmap-desarrollo-seguro/README.md) es un plan acotado para una iniciativa/fase independiente. No amplía por sí solo el alcance normal de Grumphya ni ordena ejecutar escaneos, despliegues o cambios.
- La documentación de [`../doc/`](../doc/README.md) está dirigida a personas. Cuando sea necesario, actualiza ambas capas de documentación: aquí las reglas de trabajo para agentes y en `/doc` la explicación, procedimientos y límites para humanos. No dupliques una guía operativa humana completa en esta carpeta.

## Antes de implementar

1. Lee `AGENTS.md` y la guía de `/doc` pertinente al cambio.
2. Usa la tabla anterior para cargar solo las especificaciones relacionadas con la tarea.
3. Comprueba que los detalles temporales —estado de despliegue, configuración, proveedor, versiones y roadmap— siguen vigentes en código y documentación operativa.
4. Si dos requisitos aprobados parecen incompatibles, conserva ambos como discrepancia explícita y pide resolución; no elijas silenciosamente uno.
