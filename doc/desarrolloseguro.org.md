# Enlace a desarrolloseguro.org

[desarrolloseguro.org](https://desarrolloseguro.org/) es un proyecto independiente de Grumphya. Su código, portal, API, datos, despliegue y documentación viven en [su repositorio](https://github.com/fernandezpastoreduardo/desarrolloseguro). Grumphya no sirve una copia del portal ni sus recursos bajo su propio origen.

## Integración en Grumphya

El sello del footer usa el widget verificado de desarrolloseguro.org. Grumphya incluye el ancla `data-ds-verified-badge` con el token, hostname `grumphya.com` e identificador del informe emitidos para el dominio, y carga `https://desarrolloseguro.org/desarrollo-seguro/badge-widget.js`. El componente toma el nonce de la página para cargar el script bajo `strict-dynamic`; si no encuentra nonce, no solicita el widget. Por tanto, la página pública hace peticiones al dominio independiente para mostrar y verificar el sello. La ficha local de acreditación sigue siendo un registro separado y demostrativo de Grumphya.

El token está en el DOM y es visible para cualquier visitante: debe ser público y no puede funcionar como secreto. El nonce CSP autoriza al JavaScript externo a ejecutarse con los permisos del origen de Grumphya. Al no usar Subresource Integrity (SRI), confiamos en el proveedor y en el script servido por ese dominio; un cambio malicioso podría actuar dentro de la página de Grumphya.

Las direcciones antiguas de Grumphya bajo `/desarrollo-seguro/`, incluida la ruta sin barra final, devuelven `308` hacia `https://desarrolloseguro.org/`. Ya no se copia ni se sirve la landing estática desde este repositorio. En una URL antigua que ya incluya el fragmento `#sello`, el navegador puede conservarlo al seguir la redirección: los fragmentos no llegan al servidor y Grumphya no puede retirarlos mediante el `308`.

La ficha local `/acreditaciones/DS-GRUMPHYA-2026-001` y `GET /api/accreditations/DS-GRUMPHYA-2026-001` siguen siendo un registro **demostrativo** de Grumphya. El campo `issuer` identifica a «Grumphya · revisión interna»; ni la ficha ni sus datos proceden del proyecto independiente. No constituyen un informe operativo ni una certificación. Esta ficha es independiente de las credenciales y del estado que muestra el widget externo.

## Comprobación

Verifica que el footer incluye los atributos y credenciales del sello y que el widget recibe el nonce CSP de la página; comprueba también que no se carga si falta ese nonce. Las pruebas de componente cubren el contrato del widget y los atributos del sello en los footers de Home y de sección. La ruta local `/acreditaciones/DS-GRUMPHYA-2026-001` mantiene su verificación independiente. El smoke de las imágenes de producción comprueba la redirección antigua sin depender de la disponibilidad del sitio externo.
