# Enlace a desarrolloseguro.org

[desarrolloseguro.org](https://desarrolloseguro.org/) es un proyecto independiente de Grumphya. Su código, portal, API, datos, despliegue y documentación viven en [su repositorio](https://github.com/fernandezpastoreduardo/desarrolloseguro). Grumphya no sirve una copia del portal ni sus recursos bajo su propio origen.

## Integración en Grumphya

El sello del footer enlaza a `https://desarrolloseguro.org/`. Su icono neutro es un SVG local de Grumphya en `/assets/desarrolloseguro.org/icon.svg`; el nombre del sitio se muestra como texto accesible. Cargar la página no hace peticiones a otro dominio. Al abrir el enlace, el navegador sale de Grumphya y entra en el sitio independiente.

Las direcciones antiguas de Grumphya bajo `/desarrollo-seguro/`, incluida la ruta sin barra final, devuelven `308` hacia `https://desarrolloseguro.org/`. Ya no se copia ni se sirve la landing estática desde este repositorio. El enlace nuevo del footer apunta a la portada pública sin añadir `#sello`. En una URL antigua que ya incluya ese fragmento, el navegador puede conservarlo al seguir la redirección: los fragmentos no llegan al servidor y Grumphya no puede retirarlos mediante el `308`.

La ficha local `/acreditaciones/DS-GRUMPHYA-2026-001` y `GET /api/accreditations/DS-GRUMPHYA-2026-001` siguen siendo un registro **demostrativo** de Grumphya. El campo `issuer` identifica a «Grumphya · revisión interna»; ni la ficha ni sus datos proceden del proyecto independiente. No constituyen un informe operativo ni una certificación. El icono no contiene afirmaciones de certificación y solo aparece cuando el dominio de Grumphya coincide con el dominio autorizado del registro local y este conserva su estado demostrativo.

## Comprobación

Verifica que el enlace del footer abre `https://desarrolloseguro.org/`, que las rutas antiguas responden con `308` a ese dominio y que la ficha local mantiene el estado «Prototipo académico». Las pruebas de componente y navegador de Grumphya cubren el enlace y la ficha. El smoke de las imágenes de producción comprueba la redirección antigua sin depender de la disponibilidad del sitio externo.
