# Experimento local: Qwen3 4B

**Fecha:** 12 de octubre de 2026 · **Rama:** `experiment/local-llm-qwen3-4b` · **Base:** commit `ce14de6` (`chore: ignore TypeScript build info artifacts`)

## Objetivo y alcance

Evaluar de forma exploratoria si un modelo local de 4B puede seguir la rúbrica
de `agentic-guidelines/scoring-viability-software.md`. Esta prueba llama a
Ollama directamente; no conecta el modelo a NestJS ni cambia el flujo de la
aplicación. No es una evaluación formal de calidad ni una aprobación del
modelo para producción.

## Configuración

- Imagen Docker `ollama/ollama:latest`, descargada para esta prueba.
- Modelo `qwen3:4b-instruct-2507-q4_K_M`, ID `0edcdef34593`, descarga de 2,5 GB.
- Contenedor `grumphya-ollama-qwen3-4b`, volumen Docker persistente del mismo
  nombre y API publicada solo en `127.0.0.1:11434`.
- Equipo: 16 GB de RAM física; Docker Desktop informa aproximadamente 7,75 GiB
  de memoria asignada.
- Inferencia observada por CPU, contexto configurado a 4.096 tokens,
  temperatura 0 y salida JSON.
- El servidor no recibe datos de una persona usuaria: solo los casos ficticios
  definidos abajo.

## Pruebas exploratorias

| Caso                                                                      | Expectativa                                                   | Observación                                                                                                                                                        |
| ------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Una app revolucionaria`                                                  | `IDEA_INSUFICIENTE`, sin criterios                            | Con el prompt compacto devolvió `INDETERMINADO`, estado ajeno al contrato. 11,2 s.                                                                                 |
| App para organizar recetas y lista de compra                              | Sin veto conceptual                                           | Interpretación general razonable, pero usó `code` en lugar de `id` en los criterios y marcó los nueve como `NO_APLICA`. 22,2 s.                                    |
| Pagar por declaraciones de kilómetros sin comprobar, porque nadie mentirá | Rechazo en C05, score menor de 15, sin criterios posteriores  | Con prompt compacto respondió `SIN_BLOQUEO_EVIDENTE`, incluyó una nota 10 para C02 y continuó el análisis. 25,4 s.                                                 |
| El mismo caso C05, prompt ampliado y JSON Schema                          | Rechazo en C05 con estructura válida e invariantes coherentes | Mejoró el estado y `stop_at`, pero marcó C05 `INDETERMINADO` con score 15, puso score 79 a criterios `NO_APLICA` y devolvió criterios posteriores al veto. 26,3 s. |

En la última llamada se consumieron unos 3,6 GiB de memoria del contenedor; el
modelo quedó cargado en CPU con contexto 4.096. Las latencias son observaciones
de estas pocas llamadas en este equipo, no una garantía de rendimiento.

## Conclusión

El modelo puede producir español comprensible y JSON, pero esta muestra no
demuestra consistencia suficiente para respetar la semántica y los invariantes
de la rúbrica. El JSON Schema restringió la forma básica, pero no las
dependencias entre estado, score, criterio de parada y filas posteriores.
El backend debe seguir validando toda respuesta y tratar cualquier
inconsistencia como error técnico, nunca como veredicto.

No habilitar este modelo como evaluador de la aplicación basándose en esta
prueba. Para continuar, crear un corpus reproducible de casos esperados,
medir falsos vetos y vetos omitidos, validar cada salida con el validador real
del backend y comparar el mismo corpus con otro modelo/proveedor.

## Reproducción y estado local

El servicio está disponible en `http://127.0.0.1:11434` mientras el contenedor
esté activo. Para consultar el modelo:

```sh
docker exec grumphya-ollama-qwen3-4b ollama list
docker exec grumphya-ollama-qwen3-4b ollama ps
```

Los pesos viven en el volumen Docker, no en Git. El registro no incluye claves
ni texto de ideas reales. La descarga del modelo requiere acceso de red la
primera vez.
