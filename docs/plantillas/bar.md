# Plantilla: Bar / Licorería / Coctelería (`bar`)

Anexo B 3.1 del spec. Borrador para revisión, no para aplicar sin pasar por un dueño real.

## Alcance de la investigación (leer primero)

- Sí hubo acceso a internet (WebSearch y WebFetch), pero con límites:
  - Leídas directamente (estructura de secciones y formatos): Monkey House (Bogotá), La Cervecería (Bogotá/Cali), Cassette BTA (Bogotá).
  - Solo vistas a través de resúmenes del buscador (el PDF o la página no se pudo leer): La Comitiva (Cali), Cantina La 15, Urbano Restaurante, Beer Station, Bodega BBC, Leños y Carbón (solo reseñas, sin carta). Para esos negocios lo extraído es menos fiable.
  - Los PDF de Cantina La 15, Urbano y Black Soul estaban comprimidos y no se pudieron leer. Black Soul se descartó como fuente.
- Competidores: se pudo leer de verdad Toast (guía de menús para bares) y se encontraron hilos de Square Seller Community y ayuda de Lightspeed. No se encontró documentación pública de Loggro, Siigo POS ni Fudo sobre configuración de bar o licores (solo páginas de marketing), así que no se afirma nada de ellos.
- No se copiaron textos, fotos ni precios. Todos los precios y `precio_extra` van en 0.
- Negocios consultados: 9 colombianos (3 leídos de forma directa, 6 vía resumen) y 3 de referencia internacional (Death & Co NY/LA/Seattle, bares de Ciudad de México, Montré Bar/Milnovecientos como formato de carta), más 3 POS de referencia (Toast, Square, Lightspeed).

## Hallazgos de estructura (resumen)

1. El licor fuerte en Colombia se vende en 4 formatos: trago sencillo, trago doble, media botella y botella (Monkey House, Cassette, La Comitiva, Cantina La 15, Urbano). Se repite en casi todos.
2. Cerveza: varía mucho por tamaño. Aparecen botella, cañita 6 oz, pinta 16 oz, pinta imperial 20 oz, jarra, "cubetazo" x7 / x10, barril de 500 ml y de 1,6 L, y "botella personal".
3. Las botellas y medias botellas suelen venderse en combos con mezcladores, hielo, picada y a veces cerveza (Cassette: combos pareja, combos grupos, combo gin-tonic).
4. Cócteles: separados en "de autor / especialidad" y "clásicos"; además martinis y "vírgenes" (sin alcohol). La Comitiva y Beer Station manejan cóctel en formato trago, botella y personal.
5. Comida: "para picar" en porciones por unidades (empanadas x6, mini hamburguesas x3) y picadas para 2 o 4 personas.
6. Toast (referencia internacional de POS) recomienda: grupo por tipo de licor, un artículo por marca, subgrupo "Dobles" con precio manual; o un artículo con precios por tamaño; cócteles como artículos con grupos de modificadores para el licor base y los extras; y una "pantalla rápida" de barra.
7. Square y Lightspeed: patrón comparable. Un artículo por trago/cóctel, variantes para tamaño y modificadores para marca/licor base. No tienen plantilla de bar publicada.
8. Mezclador, hielo y garnish son ingredientes de bajo impacto: se registran como modificadores, no como productos (Toast).

## Borrador JSON

```json
{
  "key": "bar",
  "nombre": "Bar / Licorería / Coctelería",
  "descripcion": "Bar, estanco, licorería con consumo en sitio o coctelería. Vende licor por trago, media y botella, cerveza por tamaño, cócteles, combos con mezcladores y picadas.",
  "categorias": [
    { "value": "cocteles_autor", "label": "Cócteles de autor", "emoji": "🍹" },
    { "value": "cocteles_clasicos", "label": "Cócteles clásicos", "emoji": "🍸" },
    { "value": "licores", "label": "Licores (trago, media y botella)", "emoji": "🥃" },
    { "value": "cervezas", "label": "Cervezas", "emoji": "🍺" },
    { "value": "combos", "label": "Combos de botella", "emoji": "🍾" },
    { "value": "picadas", "label": "Para picar", "emoji": "🍟" },
    { "value": "sin_alcohol", "label": "Sin alcohol", "emoji": "🥤" },
    { "value": "vinos", "label": "Vinos y aperitivos", "emoji": "🍷" }
  ],
  "listas": [
    {
      "key": "presentaciones_licor",
      "nombre": "Presentación del licor",
      "items": [
        { "label": "Trago sencillo", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Trago doble", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Media botella", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Botella", "precio_extra": 0, "certeza": "Seguro" }
      ]
    },
    {
      "key": "mezcladores",
      "nombre": "Mezcladores",
      "items": [
        { "label": "Gaseosa", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Soda", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Agua tónica", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Jugo", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Energizante", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Agua", "precio_extra": 0, "certeza": "Probable" }
      ]
    },
    {
      "key": "hielo",
      "nombre": "Hielo",
      "items": [
        { "label": "Con hielo", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Sin hielo", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Balde de hielo aparte", "precio_extra": 0, "certeza": "Suposición" }
      ]
    },
    {
      "key": "tamanos_cerveza",
      "nombre": "Tamaño de la cerveza",
      "items": [
        { "label": "Botella", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Cañita (6 oz)", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Pinta (16 oz)", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Pinta imperial (20 oz)", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Jarra", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Cubetazo x7", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Cubetazo x10", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Barril 1,6 L", "precio_extra": 0, "certeza": "Suposición" }
      ]
    },
    {
      "key": "preparacion_cerveza",
      "nombre": "Cerveza preparada",
      "items": [
        { "label": "Con limón y sal", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Michelada", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Con salsas", "precio_extra": 0, "certeza": "Suposición" }
      ]
    },
    {
      "key": "licor_base",
      "nombre": "Licor base",
      "items": [
        { "label": "Aguardiente", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Ron", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Vodka", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Ginebra", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Tequila", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Whisky", "precio_extra": 0, "certeza": "Seguro" }
      ]
    },
    {
      "key": "acompanamiento_trago",
      "nombre": "Acompañamiento del trago",
      "items": [
        { "label": "Limón y sal", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Naranja y canela", "precio_extra": 0, "certeza": "Suposición" }
      ]
    },
    {
      "key": "porcion_picada",
      "nombre": "Porción de la picada",
      "items": [
        { "label": "Para 2 personas", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Para 4 personas", "precio_extra": 0, "certeza": "Probable" }
      ]
    }
  ],
  "grupos_tipicos": [
    { "id": "g_presentacion", "nombre": "Presentación", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": { "lista": "presentaciones_licor" } },
    { "id": "g_mezcladores", "nombre": "Mezcladores", "modo": "multi", "min": 0, "max": 4, "requerido": false, "fuente": { "lista": "mezcladores" } },
    { "id": "g_hielo", "nombre": "Hielo", "modo": "single", "min": 0, "max": 1, "requerido": false, "fuente": { "lista": "hielo" } },
    { "id": "g_tamano_cerveza", "nombre": "Tamaño", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": { "lista": "tamanos_cerveza" } },
    { "id": "g_preparacion_cerveza", "nombre": "Preparación", "modo": "single", "min": 0, "max": 1, "requerido": false, "fuente": { "lista": "preparacion_cerveza" } },
    { "id": "g_licor_base", "nombre": "Licor base", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": { "lista": "licor_base" } },
    { "id": "g_acompanamiento", "nombre": "Acompañamiento", "modo": "multi", "min": 0, "max": 2, "requerido": false, "fuente": { "lista": "acompanamiento_trago" } },
    { "id": "g_porcion_picada", "nombre": "Porción", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": { "lista": "porcion_picada" } },
    { "id": "g_sin_alcohol", "nombre": "Versión", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": { "items": [ { "label": "Con alcohol", "precio_extra": 0 }, { "label": "Sin alcohol (virgen)", "precio_extra": 0 } ] } }
  ],
  "platos_ejemplo": [
    { "nombre": "Aguardiente", "categoria": "licores", "precio": 0, "grupos": ["g_presentacion", "g_mezcladores", "g_hielo", "g_acompanamiento"] },
    { "nombre": "Ron", "categoria": "licores", "precio": 0, "grupos": ["g_presentacion", "g_mezcladores", "g_hielo"] },
    { "nombre": "Whisky", "categoria": "licores", "precio": 0, "grupos": ["g_presentacion", "g_mezcladores", "g_hielo"] },
    { "nombre": "Tequila", "categoria": "licores", "precio": 0, "grupos": ["g_presentacion", "g_acompanamiento"] },
    { "nombre": "Cerveza nacional", "categoria": "cervezas", "precio": 0, "grupos": ["g_tamano_cerveza", "g_preparacion_cerveza"] },
    { "nombre": "Cerveza artesanal", "categoria": "cervezas", "precio": 0, "grupos": ["g_tamano_cerveza"] },
    { "nombre": "Cóctel de la casa", "categoria": "cocteles_autor", "precio": 0, "grupos": ["g_licor_base", "g_sin_alcohol"] },
    { "nombre": "Mojito", "categoria": "cocteles_clasicos", "precio": 0, "grupos": ["g_licor_base", "g_sin_alcohol"] },
    { "nombre": "Combo botella con mezcladores", "categoria": "combos", "precio": 0, "grupos": ["g_mezcladores", "g_hielo"] },
    { "nombre": "Picada para compartir", "categoria": "picadas", "precio": 0, "grupos": ["g_porcion_picada"] }
  ]
}
```

## Fuentes

| Elemento | Enlace consultado | Certeza |
|---|---|---|
| Formatos trago sencillo / doble / media botella / botella | https://themonkeyhouse.co/tmh/cocteles-y-licores/ (leído) | Seguro |
| Media botella y botella por categoría de licor (whisky, vodka, ron, aguardiente); combos con mezcladores | https://cassettebta.com/carta-de-bebidas-y-comidas/ (leído) | Seguro |
| Trago / media botella / botella en coctelería de autor | https://idmenu.club/lacomitiva/index.html (solo vía resumen del buscador; el sitio no cargó) | Probable |
| Botella, media y trago de 60 ml | https://www.cantinala15.com/cartas/carta-licores.pdf (solo vía resumen; PDF ilegible) | Probable |
| Trago / media botella / botella en digestivos | https://www.urbanorestaurante.com/wp-content/uploads/2026/05/Carta-Urbano-2026.pdf (solo vía resumen) | Probable |
| Cerveza: cañita 6 oz, pinta 16 oz, pinta imperial 20 oz, jarra, botella artesanal/importada | https://www.lacerveceria.com.co/bebidas/ (leído) | Probable (un solo negocio leído) |
| Cerveza: cubetazo x7 / x10 | https://cassettebta.com/carta-de-bebidas-y-comidas/ (leído) | Probable |
| Cerveza de barril 500 ml / 1,6 L; cóctel en trago / botella / personal | https://beerstation.com.co/wp-content/uploads/2026/07/CARTA-HAPPY-HOUR-DIGITAL-junio-2026-_-1.pdf (solo vía resumen) | Suposición |
| Secciones Favoritos, Clásicos, Martinis, Vírgenes | https://themonkeyhouse.co/tmh/cocteles-y-licores/ (leído) | Probable |
| Cócteles de autor vs clásicos; "para picar" por unidades, picadas x2 / x4 | https://cassettebta.com/carta-de-bebidas-y-comidas/ (leído) | Probable |
| Cerveza con cóctel (cerveza preparada), cervecería | https://www.bbccerveceria.com/pubs-y-bodegas/menu-bodega-a-con-todo-snack (solo vía resumen) | Suposición |
| Leños y Carbón: licores por trago / botella / jarra | https://lenosycarbon.com.co/wp-content/uploads/CARTA-LICORES.pdf (no se pudo abrir; solo reseñas en https://wanderlog.com/place/details/4090726/leños--carbón-santafé) | Suposición |
| Mezcladores (gaseosa, soda, tónica, agua) | Cassette (mezcladores, aguas, tónicas) y La Cervecería (bebidas: gaseosas, energizantes) | Probable |
| Hielo como opción / balde aparte | Sin fuente directa en las cartas consultadas | Suposición |
| Preparación de cerveza (limón y sal, michelada) | https://en.wikipedia.org/wiki/Cerveza_preparada (solo aparece en resultados) y conocimiento general | Suposición |
| Acompañamiento (limón y sal, naranja y canela) | Ejemplo de tequila en https://help.mews.com/s/article/managing-product-modifiers-in-the-mews-pos | Suposición |
| Estructura de licores por grupo + "Dobles", cócteles como artículos con modificadores, mezcladores como modificadores, pantalla rápida | https://support.toasttab.com/en/article/Menu-Best-Practices-for-Bars (leído) | Seguro |
| Un artículo por trago con variantes y marca como modificador | https://sellercommunity.com/t5/Square-for-Restaurants/Bar-Menu-Setup-Tips-Request-Best-practice/m-p/48865 | Probable |
| Variantes para tamaño y modificadores con mín/máx | https://o-series-support.lightspeedhq.com/hc/en-us/articles/31329530566683-Building-your-drinks-menu (devolvió 403; contenido solo vía buscador) | Probable |
| Referencia internacional: cócteles agrupados por estilo, cerveza/vino/espíritus aparte, sección sin alcohol | https://www.nrn.com/independent-restaurants/death-co-opens-in-seattle-as-the-pioneering-new-york-city-bar-approaches-its-20th-anniversary (resumen del buscador) | Probable |
| Referencia internacional: formato botella y 1/2 trago en carta tipo bar | Montré Bar y Milnovecientos (resultado del buscador, sin URL propia consultada) | Suposición |
| Loggro, Siigo POS, Fudo: configuración de bar | No se encontró documentación pública sobre bar/licores. Solo https://www.siigo.com/sistema-pos/restaurantes (marketing) | Suposición |
| Impuestos 2026 a licores (afectan precio y rotulación del impuesto al consumo) | https://www.noticiasrcn.com/economia/cuanto-valdria-una-botella-de-whisky-con-el-nuevo-impuesto-976451 | Probable |

## Dudas para un dueño real

1. Trago doble: ¿se vende como producto aparte, se cobra el doble del sencillo o no existe? Toast no lo calcula solo y en las cartas colombianas no está claro.
2. Marcas: ¿cada marca de aguardiente/ron/whisky es un producto propio (con su propio precio de trago, media y botella) o se maneja "aguardiente" genérico con la marca como opción? Esto define cuántos productos hay que cargar.
3. Mezcladores: ¿vienen incluidos con la botella y la media (gratis, con límite) o se cobran aparte? ¿Cuántos incluye cada combo?
4. Hielo: ¿se cobra (balde de hielo), se regala con la botella, o no se maneja en el sistema?
5. Impuesto al consumo de licores: ¿el precio de carta ya lo incluye? Desde 2026 subió la carga. ¿Cuál es el tratamiento correcto para trago vs. botella, y para cerveza?
6. Descuento de inventario: ¿se descuenta por botella entera (y el trago por mililitros o por fracción) o solo por unidad? ¿Qué pasa cuando se abre una botella y sobra?
7. Cerveza: ¿qué tamaños realmente vende (botella, jarra, cubetazo, barril)? ¿El cubetazo es de 6, 7 o 10, y varía según la marca?
8. Cerveza preparada: ¿se cobra la michelada o la cerveza con limón y sal como extra o es otro producto?
9. Cóctel: ¿el licor base cambia el precio del cóctel (recargo por premium) o se vende a un solo precio?
10. Happy hour y 2x1: ¿cómo se aplican? Varios bares colombianos los usan y Toast no los combina con precio por tamaño.
11. Botella para llevar (licorería): ¿se maneja aparte del consumo en sitio, con otro precio?
12. Restricciones legales (menores de edad, horarios de venta, ley seca): ¿necesita que el sistema las muestre o bloquee?
13. Propina sugerida (10 %): ¿se aplica igual a licores y cócteles?
