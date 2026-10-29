# SVGOMG: adjuntos de rondas recientes

Procesados en SVGOMG web (29 SVG). Las salidas optimizadas descargadas están en
esta carpeta. Las vectorizaciones SVG originales se conservan en
`../../svg-vectorizados-originales-adjuntos-2026-10/`. En la app se usan 27 de
estas versiones optimizadas; `audience-rounded` y `stage-curtain-v2` permanecen
en WebP porque sus SVG optimizados no mejoran el peso de los WebP activos.

El total de la tabla compara los 29 SVG fuente con sus salidas SVGOMG, no el
conjunto de formatos activo en producción. Para los 27 SVG que sí se activaron,
la suma pasa de 10.201.937 B a 1.836.417 B (estimación gzip: 3.896.824 B a
731.100 B); telón y público siguen siendo WebP (14.590 B y 49.772 B,
respectivamente). La estimación gzip es orientativa y no equivale a una
medición de transferencia real del servidor.

| Archivo | Original | Optimizado | Ahorro | Gzip original | Gzip optimizado |
|---|---:|---:|---:|---:|---:|
| `admin-dashboard-audit.svg` | 396,913 B | 73,585 B | +323,328 B (+81.5%) | 154,305 B | 30,283 B |
| `audience-rounded.svg` | 859,548 B | 141,627 B | +717,921 B (+83.5%) | 325,096 B | 55,207 B |
| `contact-form-vanishing.svg` | 323,555 B | 61,763 B | +261,792 B (+80.9%) | 124,076 B | 25,021 B |
| `contact-hero-phone.svg` | 302,232 B | 56,075 B | +246,157 B (+81.4%) | 115,470 B | 22,615 B |
| `contact-message-tube.svg` | 292,608 B | 54,317 B | +238,291 B (+81.4%) | 112,761 B | 22,232 B |
| `create-account-hero.svg` | 273,742 B | 50,900 B | +222,842 B (+81.4%) | 103,853 B | 20,631 B |
| `create-account-plan.svg` | 329,542 B | 59,670 B | +269,872 B (+81.9%) | 124,827 B | 24,163 B |
| `descargate-boxing-bag.svg` | 371,612 B | 67,914 B | +303,698 B (+81.7%) | 142,324 B | 27,425 B |
| `error-scene-404.svg` | 410,824 B | 74,555 B | +336,269 B (+81.9%) | 160,077 B | 30,635 B |
| `error-scene-429.svg` | 327,844 B | 60,328 B | +267,516 B (+81.6%) | 126,086 B | 24,672 B |
| `error-scene-500.svg` | 336,324 B | 59,873 B | +276,451 B (+82.2%) | 129,653 B | 24,389 B |
| `evaluation-error-spilled-coffee.svg` | 953,503 B | 165,436 B | +788,067 B (+82.6%) | 381,557 B | 67,172 B |
| `good-practices-checklist.svg` | 350,844 B | 64,244 B | +286,600 B (+81.7%) | 135,568 B | 26,125 B |
| `good-practices-companion-pink.svg` | 354,085 B | 64,796 B | +289,289 B (+81.7%) | 141,479 B | 27,044 B |
| `good-practices-companion-yellow.svg` | 289,221 B | 55,397 B | +233,824 B (+80.8%) | 114,647 B | 23,041 B |
| `good-practices-validate-idea.svg` | 306,691 B | 57,864 B | +248,827 B (+81.1%) | 117,912 B | 23,419 B |
| `idea-tone-hard-boxing-v2.svg` | 348,690 B | 64,631 B | +284,059 B (+81.5%) | 131,198 B | 25,244 B |
| `idea-tone-soft-bandage-v2.svg` | 404,726 B | 72,991 B | +331,735 B (+82.0%) | 151,861 B | 28,560 B |
| `login-credentials.svg` | 447,802 B | 77,286 B | +370,516 B (+82.7%) | 167,700 B | 30,050 B |
| `login-privacy.svg` | 380,607 B | 66,263 B | +314,344 B (+82.6%) | 141,979 B | 25,460 B |
| `mascot-isotype.svg` | 94,360 B | 19,013 B | +75,347 B (+79.9%) | 35,302 B | 6,900 B |
| `notable-humans-callout.svg` | 378,135 B | 66,074 B | +312,061 B (+82.5%) | 141,119 B | 25,642 B |
| `notable-humans-hero.svg` | 471,158 B | 82,068 B | +389,090 B (+82.6%) | 176,844 B | 31,954 B |
| `plans-coffee.svg` | 347,155 B | 61,334 B | +285,821 B (+82.3%) | 128,084 B | 23,562 B |
| `profile-account-shield.svg` | 450,787 B | 80,345 B | +370,442 B (+82.2%) | 170,400 B | 31,492 B |
| `roast-plan-callout.svg` | 432,237 B | 74,200 B | +358,037 B (+82.8%) | 160,457 B | 28,152 B |
| `special-idea-coffee-slippers.svg` | 554,292 B | 94,890 B | +459,402 B (+82.9%) | 207,108 B | 36,382 B |
| `stage-curtain-v2.svg` | 344,361 B | 62,301 B | +282,060 B (+81.9%) | 136,615 B | 24,401 B |
| `ultrachachi-reality-check.svg` | 272,448 B | 50,605 B | +221,843 B (+81.4%) | 100,177 B | 18,835 B |

**Total:** 11,405,846 B → 2,040,345 B (9,365,501 B menos; 82.1%).
**Estimación gzip agregada:** 4,358,535 B → 810,708 B (3,547,827 B menos; 81.4%).
