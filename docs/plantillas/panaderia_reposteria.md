# Plantilla: panadería y repostería (key: panaderia_reposteria)

Fecha de investigación: 2026-10-16. Hubo acceso a internet (WebSearch y WebFetch). Cobertura real:

- **Colombia: 6 negocios** con páginas leídas (todos de Bogotá, tiendas en línea de tortas). Ningún negocio colombiano de pan pudo leerse: solo salieron notas de prensa sobre panes típicos.
- **Internacional: 2 negocios** (Magnolia Bakery y Milk Bar, EE. UU.), con poca información de opciones. Ambos tienen la estructura de tienda en línea oculta tras scripts.
- **Competidores:** Toast (guía oficial leída completa), Lightspeed (página de marketing), Square (hilos de comunidad de vendedores). Loggro, Siigo POS y Fudo: no se encontró documentación de configuración para panadería; no se afirma nada sobre ellos.

Limitación importante: el lado "panadería de pan" (pan de bono, almojábana, croissant, pan por unidad o por libra) NO está respaldado por cartas leídas. Todo ese bloque es Suposición basada en conocimiento general. El lado "tortas" sí tiene evidencia sólida.

Hallazgo de diseño más importante: casi todos los negocios de tortas venden la torta como UN producto con tamaño por porciones (6, 8, 10, 15, 16, 20, 24, 25, 30, 40, 50) y luego masa + relleno + cobertura + decoración + mensaje + fecha de entrega. Toast recomienda un producto por tamaño (mejor para reportes) o precio por tamaño; para pedidos anticipados recomienda un menú/grupo aparte con aviso de anticipación.

## Borrador JSON

```json
{
  "key": "panaderia_reposteria",
  "nombre": "Panadería y repostería",
  "descripcion": "Pan del día, pasteles y tortas (por porción o enteras), postres y tortas por encargo con sabor, relleno, cobertura y fecha de entrega.",
  "categorias": [
    { "value": "pan_dulce", "label": "Pan dulce y de sal", "emoji": "🥐" },
    { "value": "pan_tradicional", "label": "Pan tradicional (bono, almojábana, yuca)", "emoji": "🥖" },
    { "value": "pasteleria_individual", "label": "Pastelería individual", "emoji": "🧁" },
    { "value": "tortas_porcion", "label": "Tortas por porción", "emoji": "🍰" },
    { "value": "tortas_enteras", "label": "Tortas enteras", "emoji": "🎂" },
    { "value": "tortas_encargo", "label": "Tortas por encargo", "emoji": "🎉" },
    { "value": "postres", "label": "Postres", "emoji": "🍮" },
    { "value": "galletas_brownies", "label": "Galletas y brownies", "emoji": "🍪" },
    { "value": "bebidas", "label": "Bebidas", "emoji": "☕" },
    { "value": "adicionales", "label": "Velas, toppers y adicionales", "emoji": "🕯️" }
  ],
  "listas": [
    {
      "key": "tamanos_torta",
      "nombre": "Tamaño de torta (por porciones)",
      "items": [
        { "label": "Personal (6 porciones)", "precio_extra": 0, "certeza": "Probable" },
        { "label": "8 porciones", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "10 porciones", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "15 porciones", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "20 porciones", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "25 porciones", "precio_extra": 0, "certeza": "Probable" },
        { "label": "30 porciones", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "40 porciones", "precio_extra": 0, "certeza": "Probable" },
        { "label": "50 porciones", "precio_extra": 0, "certeza": "Probable" }
      ]
    },
    {
      "key": "formato_venta",
      "nombre": "Formato de venta",
      "items": [
        { "label": "Porción", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Torta entera", "precio_extra": 0, "certeza": "Suposición" }
      ]
    },
    {
      "key": "masas",
      "nombre": "Sabor de masa",
      "items": [
        { "label": "Vainilla", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Chocolate", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Chocovainilla (marmolada)", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Red velvet", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Amapola y naranja", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Zanahoria", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Limón", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Coco", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Tres leches", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Torta negra / envinada", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Café", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Sin gluten", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Vegana", "precio_extra": 0, "certeza": "Probable" }
      ]
    },
    {
      "key": "rellenos",
      "nombre": "Relleno",
      "items": [
        { "label": "Arequipe", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Mora", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Frutos rojos", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Crema de vainilla", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Crema de chocolate / ganache", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Crema de queso", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Oreo (cookies and cream)", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Maracuyá", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Fresa", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Nutella", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Sin relleno", "precio_extra": 0, "certeza": "Suposición" }
      ]
    },
    {
      "key": "coberturas",
      "nombre": "Cobertura",
      "items": [
        { "label": "Crema (chantilly)", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Buttercream (crema de mantequilla)", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Crema de queso", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Fondant / pastillaje", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Ganache / drip de chocolate", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Acabado desnudo (naked)", "precio_extra": 0, "certeza": "Probable" }
      ]
    },
    {
      "key": "decoraciones",
      "nombre": "Decoración",
      "items": [
        { "label": "Imagen comestible / papel de azúcar", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Topper (nombre, edad o figura)", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Flores (naturales o comestibles)", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Figuras en fondant 3D", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Frutas", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Sprinkles / virutas", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Globos", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Velas", "precio_extra": 0, "certeza": "Suposición" }
      ]
    },
    {
      "key": "adicionales_pedido",
      "nombre": "Adicionales del pedido",
      "items": [
        { "label": "Mensaje en la torta", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Tarjeta / dedicatoria", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Vela", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Caja o empaque especial", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Entrega a domicilio", "precio_extra": 0, "certeza": "Seguro" }
      ]
    },
    {
      "key": "tamanos_pan",
      "nombre": "Presentación del pan",
      "items": [
        { "label": "Unidad", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Media docena", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Docena", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Bolsa / paquete", "precio_extra": 0, "certeza": "Suposición" }
      ]
    },
    {
      "key": "sabores_individual",
      "nombre": "Sabor (cupcake, postre individual)",
      "items": [
        { "label": "Vainilla", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Chocolate", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Red velvet", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Arequipe", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Frutos rojos", "precio_extra": 0, "certeza": "Suposición" }
      ]
    }
  ],
  "grupos_tipicos": [
    { "id": "g_tamano_torta", "nombre": "Tamaño (porciones)", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": { "lista": "tamanos_torta" } },
    { "id": "g_masa", "nombre": "Sabor de masa", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": { "lista": "masas" } },
    { "id": "g_relleno", "nombre": "Relleno", "modo": "multi", "min": 0, "max": 2, "requerido": false, "fuente": { "lista": "rellenos" } },
    { "id": "g_cobertura", "nombre": "Cobertura", "modo": "single", "min": 0, "max": 1, "requerido": false, "fuente": { "lista": "coberturas" } },
    { "id": "g_decoracion", "nombre": "Decoración", "modo": "multi", "min": 0, "max": 4, "requerido": false, "fuente": { "lista": "decoraciones" } },
    { "id": "g_adicionales", "nombre": "Adicionales", "modo": "multi", "min": 0, "max": 5, "requerido": false, "fuente": { "lista": "adicionales_pedido" } },
    { "id": "g_presentacion_pan", "nombre": "Presentación", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": { "lista": "tamanos_pan" } },
    { "id": "g_sabor_individual", "nombre": "Sabor", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": { "lista": "sabores_individual" } },
    { "id": "g_tipo_entrega", "nombre": "Entrega", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": { "items": [
      { "label": "Recoger en tienda", "precio_extra": 0 },
      { "label": "Domicilio", "precio_extra": 0 }
    ] } },
    { "id": "g_con_sin_mensaje", "nombre": "Mensaje en la torta", "modo": "single", "min": 1, "max": 1, "requerido": false, "fuente": { "items": [
      { "label": "Sin mensaje", "precio_extra": 0 },
      { "label": "Con mensaje (se anota en notas)", "precio_extra": 0 }
    ] } }
  ],
  "platos_ejemplo": [
    { "nombre": "Pan de bono", "categoria": "pan_tradicional", "precio": 0, "grupos": ["g_presentacion_pan"] },
    { "nombre": "Croissant", "categoria": "pan_dulce", "precio": 0, "grupos": [] },
    { "nombre": "Cupcake", "categoria": "pasteleria_individual", "precio": 0, "grupos": ["g_sabor_individual"] },
    { "nombre": "Porción de torta de chocolate", "categoria": "tortas_porcion", "precio": 0, "grupos": [] },
    { "nombre": "Torta entera de vainilla", "categoria": "tortas_enteras", "precio": 0, "grupos": ["g_tamano_torta", "g_relleno", "g_cobertura", "g_adicionales"] },
    { "nombre": "Torta personalizada por encargo", "categoria": "tortas_encargo", "precio": 0, "grupos": ["g_tamano_torta", "g_masa", "g_relleno", "g_cobertura", "g_decoracion", "g_adicionales", "g_tipo_entrega"] },
    { "nombre": "Cheesecake", "categoria": "postres", "precio": 0, "grupos": [] },
    { "nombre": "Brownie", "categoria": "galletas_brownies", "precio": 0, "grupos": [] },
    { "nombre": "Tres leches", "categoria": "postres", "precio": 0, "grupos": [] },
    { "nombre": "Café americano", "categoria": "bebidas", "precio": 0, "grupos": [] }
  ]
}
```

Notas de diseño para quien implemente:

- Los precios por tamaño son lo que realmente cambia en una torta, pero NO se pusieron precios ni `precio_extra`. En el borrador el tamaño es un grupo requerido con precio_extra 0; si el motor soporta "precio base por variante" (lo que Toast llama Size Price), conviene usar eso para el tamaño en lugar de precio_extra.
- Campos de pedido que aparecieron en casi todos los negocios de encargo y que quizá no caben en grupos de opciones: fecha y hora de entrega, anticipación mínima, anticipo/abono, mensaje, foto de referencia, tema/colores. Se resolvió solo el mensaje como opción; el resto requiere campos propios de "pedido por encargo" (ver Dudas).
- `g_con_sin_mensaje` es débil: el texto del mensaje debería ser un campo libre, no una opción. Ver Dudas.

## Fuentes

Certeza: Seguro = aparece en varios negocios; Probable = en uno o dos negocios o en guías de competidores; Suposición = conocimiento general, no confirmado en una fuente leída.

| Elemento | Enlace consultado | Certeza |
|---|---|---|
| Tamaños por porciones: 6, 8, 10, 15, 20, 25, 30, 40, 50 (Mr. Cupcake) | https://mr-cupcake.com/producto/tortas/ y https://mr-cupcake.com/producto/fondant-personalizada/ | Seguro (varias fuentes en 8/10/15/20/30), Probable en 6/25/40/50 (solo Mr. Cupcake) |
| Tamaños 8, 16, 24, 30 porciones (Berdey's y Banbury: S, M, L, XL) | https://berdeys.com/products/todas y https://www.banburypasteleria.com/products/torta-de-vainilla-con-arequipe | Seguro (el tamaño por porciones, aunque los números varían por negocio) |
| Tamaños 10-12, 15, 20-30 porciones (Cake by Made); 5, 10, 15, 20, 30+ (Casa Momenti) | https://cakebymade.com/tortas-personalizadas-en-bogota/ y https://casamomenti.com/tortas-personalizadas-bogota/ | Seguro |
| Tamaños por diámetro en cm con porciones aproximadas (Chocolatto) | https://chocolatto.co/product/torta-de-chocolate-y-arequipe/ | Probable (un solo negocio; alternativa de modelar el tamaño) |
| Masas: vainilla, chocolate, chocovainilla, red velvet, amapola/naranja | https://berdeys.com/products/todas, https://cakebymade.com/tortas-personalizadas-en-bogota/, https://mr-cupcake.com/producto/fondant-personalizada/ | Seguro |
| Masas: zanahoria, limón, coco, tres leches, torta negra/envinada, café, sin gluten, vegana, almendra | https://mr-cupcake.com/producto/fondant-personalizada/, https://berdeys.com/products/todas, https://casamomenti.com/tortas-personalizadas-bogota/ | Probable |
| Rellenos: arequipe, mora, frutos rojos, crema de vainilla, crema de chocolate/ganache, crema de queso, Oreo | https://berdeys.com/products/todas, https://cakebymade.com/tortas-personalizadas-en-bogota/, https://mr-cupcake.com/producto/fondant-personalizada/, https://www.banburypasteleria.com/products/torta-de-vainilla-con-arequipe | Seguro |
| Rellenos: maracuyá, fresa, Nutella | https://mr-cupcake.com/producto/fondant-personalizada/ y https://berdeys.com/products/todas | Probable |
| Coberturas: crema, buttercream, fondant, ganache/drip, crema de queso, naked | https://berdeys.com/products/todas, https://cakebymade.com/tortas-personalizadas-en-bogota/, https://casamomenti.com/tortas-personalizadas-bogota/, https://www.banburypasteleria.com/products/torta-de-vainilla-con-arequipe | Seguro (crema, buttercream, fondant, ganache); Probable (crema de queso, naked) |
| Decoración: imagen comestible, topper, flores, figuras 3D, globos | https://berdeys.com/products/todas, https://cakebymade.com/tortas-personalizadas-en-bogota/, https://casamomenti.com/tortas-personalizadas-bogota/, https://mr-cupcake.com/producto/tortas/ | Seguro (imagen comestible, topper); Probable (el resto) |
| Campos de pedido por encargo: mensaje/tarjeta, fecha del evento, foto de referencia, tema y colores, recoger o envío, número de porciones | https://mr-cupcake.com/producto/fondant-personalizada/, https://cakebymade.com/tortas-personalizadas-en-bogota/ | Seguro |
| Anticipación de encargo: mínimo 5 días (Casa Momenti); 5 a 15 días y hasta 30 en bodas (Cake by Made, con plazos inconsistentes en su misma página); entrega express 24 h (Mr. Cupcake) | https://casamomenti.com/tortas-personalizadas-bogota/, https://cakebymade.com/tortas-personalizadas-en-bogota/ | Probable (varía por negocio y temporada) |
| Categorías de un negocio de tortas: Tortas y postres, Fresas y cajas de regalo, Sin azúcar, Otras delicias, Panadería (Chocolatto) | https://chocolatto.co/product/torta-de-chocolate-y-arequipe/ | Probable |
| Internacional: categorías Cakes, Cookies, Pies, Cake Truffles, Gluten-Free, Bundles, Birthday; tamaños 6" y 10" (Milk Bar) | https://www.milkbarstore.com/ | Probable |
| Internacional: inscripción personalizada con color, pedido anticipado y recoger vs. envío (Magnolia Bakery) | https://www.magnoliabakery.com/collections/cakes | Probable |
| Toast: un producto por tamaño o "Size Price"; modificadores obligatorios vs. opcionales; selección múltiple con mínimo y máximo (docena de panadero); menú aparte para pedidos anticipados con aviso de anticipación | https://support.toasttab.com/en/article/Menu-Best-Practices-for-Bakeries-Coffee-Shops | Seguro (documentación oficial leída) |
| Lightspeed: cambios de menú y modificadores sobre la marcha, costeo de recetas (página de marketing; no menciona variantes ni pedidos anticipados) | https://www.lightspeedhq.com/au/pos/restaurant/bakery-pos-system | Probable |
| Square: pedidos anticipados desde el POS con botón Schedule, anticipo del 50 % llevado fuera del sistema, sin reporte de producción; modificadores de tema y texto difíciles de configurar (relatos de vendedores) | https://community.squareup.com/t5/Square-for-Retail/Do-any-bakery-owners-use-Square-to-keep-track-of-preorders-and/m-p/781730 y https://community.squareup.com/t5/Food-Beverage/Using-Square-in-lieu-of-a-custom-cake-bakery-management-system/m-p/644044 | Probable (foros, no documentación oficial) |
| Square y Lightspeed: cantidad por modificador (mezcla de sabores en una caja) | https://help.bopple.com/modifier-quantities y https://sellercommunity.com/t5/Square-Point-of-Sale/Can-you-have-a-quantity-associated-with-modifiers/m-p/345126 | Probable |
| Loggro (Restobar) y Siigo POS: solo fichas generales (POS en la nube, inventario, facturación electrónica DIAN); sin guía para panadería | https://apps.apple.com/ca/app/loggro-restobar/id6480476721 y https://www.comparasoftware.com/siigo-pos | Suposición (no se conoce su configuración por tipo de negocio) |
| Fudo: no se encontró información | (sin fuente) | Suposición |
| Pan tradicional colombiano (pan de bono, almojábana, pan de yuca, pan de queso) como producto base | https://www.portafolio.co/tendencias/sociales/pan-de-bono-escogido-como-uno-de-los-mejores-productos-de-panaderia-del-mundo-588981 y https://www.bluradio.com/sociedad/los-3-panes-colombianos-que-estan-entre-los-50-mejores-del-mundo-segun-tasteatlas-rs15 | Probable (confirma que existen, no cómo se venden: por unidad, docena o libra) |
| Categorías de pan, pastelería individual, postres, bebidas, formato porción y presentaciones de pan (unidad, docena) | Conocimiento general; ninguna carta leída lo confirma | Suposición |

## Dudas para un dueño real

1. **Pan: ¿cómo lo vende?** Por unidad, por docena, por libra o por peso. Si es por peso, el POS necesita cantidad decimal y balanza; las cartas leídas no cubren esto.
2. **Porción vs. torta entera:** ¿es el mismo producto con dos formatos (misma torta, precio de porción y precio de entera) o dos productos separados? ¿La porción baja el inventario de la torta entera (una torta = 8 o 10 porciones)? Toast prefiere productos separados; los negocios de tortas leídos solo venden entera.
3. **Precio por tamaño:** ¿el precio sube proporcional a las porciones o hay tabla propia? ¿Rellenos, coberturas y decoración se cobran aparte (y cuánto) o van incluidos? Sin esto no se puede definir un precio_extra universal.
4. **Encargos:** ¿con cuántos días de anticipación? ¿Piden abono (el 50 % aparece en el relato de Square) y cómo lo registran? ¿Hay un tope diario de tortas por capacidad de horno o decorador?
5. **Fecha y hora de entrega, mensaje, foto de referencia, tema y colores:** ¿qué datos anota realmente al tomar el pedido? Deberían ser campos de texto libre y fecha en el pedido, no opciones de lista.
6. **Producción diaria:** ¿hace una lista de producción para el día siguiente a partir de los encargos? (Es un reclamo en los hilos de Square: falta reporte de producción.)
7. **Costeo y merma:** ¿lleva recetas con costo? ¿Qué hace con el pan o las porciones que sobran al cierre (descuento, donación, desecho)?
8. **Alérgenos y dietas:** ¿ofrece sin gluten, sin azúcar, vegana? ¿Es una masa/relleno aparte con otro precio o un producto distinto? ¿Con qué cuidado frente a contaminación cruzada?
9. **Exhibición y cafetería:** ¿tiene mesas y café (venta en sitio) o es solo mostrador y domicilio? Define si las bebidas y la mesa son parte de la plantilla.
10. **Domicilios:** ¿cobra envío por zona? ¿Hay tortas que no se despachan por fragilidad (fondant, varios pisos)?
