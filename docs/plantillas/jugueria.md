# Plantilla: Juguería y fruver (key: `jugueria`)

> **AVISO DE ALCANCE (leer primero).** La búsqueda web tuvo resultados muy limitados: no pude abrir ninguna carta completa de una juguería colombiana, y las herramientas de lectura de páginas (WebFetch) estaban bloqueadas para jamba.com, smoothieking.com, toasttab.com, gust.com y colombia.com. Solo obtuve resúmenes del buscador. Por eso:
> - **0 cartas completas de negocios colombianos revisadas.** Solo 2 referencias parciales (Lemon Fresh, Cosechas/Bawana, sin carta) y 1 menú anónimo de Scribd (sin nombre ni fecha).
> - **1 referencia internacional con datos útiles** (Smoothie King, vía sitios de terceros) y 1 histórica (Jamba, 1999-2013).
> - Competidores (Loggro, Siigo POS, Fudo, Toast, Square, Lightspeed): **no encontré ninguna plantilla específica de juguería** en ninguno. Lo único útil fue la documentación de Square sobre modificadores.
> - Casi todo el contenido es conocimiento propio. Marqué la certeza con honestidad: **no hay ningún "Seguro"** porque nada se confirmó en varios negocios reales. Hay que validar con un dueño real (ver al final).
> - Precios: todo en 0, como se pidió.

## Borrador JSON

```json
{
  "key": "jugueria",
  "nombre": "Juguería y fruver",
  "descripcion": "Jugos naturales en agua o en leche, batidos, smoothies, ensaladas de frutas y bowls, con tamaño, endulzante y adiciones.",
  "categorias": [
    { "value": "jugos-agua", "label": "Jugos naturales", "emoji": "🍊" },
    { "value": "batidos", "label": "Batidos y smoothies", "emoji": "🥤" },
    { "value": "ensaladas-fruta", "label": "Ensaladas de frutas", "emoji": "🍓" },
    { "value": "bowls", "label": "Bowls y energéticos", "emoji": "🥣" },
    { "value": "limonadas", "label": "Limonadas y refrescos", "emoji": "🍋" },
    { "value": "fruta-porcion", "label": "Fruta por porción o peso (fruver)", "emoji": "🍉" },
    { "value": "adiciones", "label": "Adiciones sueltas", "emoji": "➕" }
  ],
  "listas": [
    {
      "key": "frutas",
      "nombre": "Frutas",
      "items": [
        { "label": "Mango", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Mora", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Lulo", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Maracuyá", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Guanábana", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Fresa", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Piña", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Banano", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Papaya", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Naranja", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Mandarina", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Aguacate", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Borojó", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Tomate de árbol", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Níspero", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Sandía", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Melón", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Zanahoria", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Remolacha", "precio_extra": 0, "certeza": "Suposición" }
      ]
    },
    {
      "key": "base",
      "nombre": "Base del jugo",
      "items": [
        { "label": "En agua", "precio_extra": 0, "certeza": "Probable" },
        { "label": "En leche", "precio_extra": 0, "certeza": "Probable" },
        { "label": "En leche de avena", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "En leche de almendras", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "En leche deslactosada", "precio_extra": 0, "certeza": "Suposición" }
      ]
    },
    {
      "key": "tamano",
      "nombre": "Tamaño",
      "items": [
        { "label": "Vaso", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Vaso grande", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Jarra", "precio_extra": 0, "certeza": "Probable" }
      ]
    },
    {
      "key": "endulzante",
      "nombre": "Endulzante",
      "items": [
        { "label": "Con azúcar", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Sin azúcar", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Con panela", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Con miel", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Con stevia", "precio_extra": 0, "certeza": "Suposición" }
      ]
    },
    {
      "key": "adiciones",
      "nombre": "Adiciones para batidos y jugos",
      "items": [
        { "label": "Avena", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Proteína", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Chía", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Linaza", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Yogur", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Helado", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Granola", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Miel", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Jengibre", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Espinaca", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Hielo extra", "precio_extra": 0, "certeza": "Suposición" }
      ]
    },
    {
      "key": "toppings_ensalada",
      "nombre": "Toppings de ensalada de frutas",
      "items": [
        { "label": "Helado", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Granola", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Queso rallado", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Crema de leche", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Coco rallado", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Miel", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Yogur", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Salsa de mora", "precio_extra": 0, "certeza": "Suposición" }
      ]
    },
    {
      "key": "tamano_ensalada",
      "nombre": "Tamaño de ensalada",
      "items": [
        { "label": "Pequeña", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Grande", "precio_extra": 0, "certeza": "Probable" }
      ]
    },
    {
      "key": "sabores_limonada",
      "nombre": "Sabores de limonada",
      "items": [
        { "label": "Natural", "precio_extra": 0, "certeza": "Probable" },
        { "label": "De coco", "precio_extra": 0, "certeza": "Probable" },
        { "label": "De hierbabuena", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Cerezada", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "De mango biche", "precio_extra": 0, "certeza": "Suposición" }
      ]
    }
  ],
  "grupos_tipicos": [
    { "id": "g_base", "nombre": "Base", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": { "lista": "base" } },
    { "id": "g_tamano", "nombre": "Tamaño", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": { "lista": "tamano" } },
    { "id": "g_fruta", "nombre": "Fruta", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": { "lista": "frutas" } },
    { "id": "g_frutas_mezcla", "nombre": "Frutas de la mezcla", "modo": "multi", "min": 1, "max": 3, "requerido": true, "fuente": { "lista": "frutas" } },
    { "id": "g_endulzante", "nombre": "Endulzante", "modo": "single", "min": 0, "max": 1, "requerido": false, "fuente": { "lista": "endulzante" } },
    { "id": "g_adiciones", "nombre": "Adiciones", "modo": "multi", "min": 0, "max": 4, "requerido": false, "fuente": { "lista": "adiciones" } },
    { "id": "g_tamano_ensalada", "nombre": "Tamaño de ensalada", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": { "lista": "tamano_ensalada" } },
    { "id": "g_toppings", "nombre": "Toppings", "modo": "multi", "min": 0, "max": 4, "requerido": false, "fuente": { "lista": "toppings_ensalada" } },
    { "id": "g_sabor_limonada", "nombre": "Sabor de limonada", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": { "lista": "sabores_limonada" } },
    { "id": "g_hielo", "nombre": "Hielo", "modo": "single", "min": 0, "max": 1, "requerido": false, "fuente": { "items": [
      { "label": "Normal", "precio_extra": 0 },
      { "label": "Poco hielo", "precio_extra": 0 },
      { "label": "Sin hielo", "precio_extra": 0 }
    ] } }
  ],
  "platos_ejemplo": [
    { "nombre": "Jugo natural de una fruta", "categoria": "jugos-agua", "precio": 0, "grupos": ["g_fruta", "g_base", "g_tamano", "g_endulzante", "g_hielo"] },
    { "nombre": "Jugo mixto (2 o 3 frutas)", "categoria": "jugos-agua", "precio": 0, "grupos": ["g_frutas_mezcla", "g_base", "g_tamano", "g_endulzante", "g_hielo"] },
    { "nombre": "Batido de fruta en leche", "categoria": "batidos", "precio": 0, "grupos": ["g_fruta", "g_tamano", "g_endulzante", "g_adiciones"] },
    { "nombre": "Smoothie de la casa", "categoria": "batidos", "precio": 0, "grupos": ["g_frutas_mezcla", "g_tamano", "g_adiciones"] },
    { "nombre": "Ensalada de frutas", "categoria": "ensaladas-fruta", "precio": 0, "grupos": ["g_tamano_ensalada", "g_toppings"] },
    { "nombre": "Bowl de frutas con granola", "categoria": "bowls", "precio": 0, "grupos": ["g_tamano_ensalada", "g_toppings"] },
    { "nombre": "Limonada", "categoria": "limonadas", "precio": 0, "grupos": ["g_sabor_limonada", "g_tamano", "g_hielo"] },
    { "nombre": "Vaso de fruta picada", "categoria": "fruta-porcion", "precio": 0, "grupos": [] },
    { "nombre": "Adición suelta (avena, proteína, chía)", "categoria": "adiciones", "precio": 0, "grupos": [] }
  ]
}
```

Notas de diseño para quien lo implemente:
- `g_fruta` (una sola) y `g_frutas_mezcla` (varias) comparten la lista `frutas`. Es una decisión mía, no confirmada con un dueño.
- Las "bases" de leche vegetal van todas con extra 0 porque no hay regla universal confirmada.
- Square documenta que sus modificadores no cambian de precio según el tamaño. Si RestaurantOS necesita "adición cuesta más en tamaño grande", conviene soportarlo, o el dueño tendrá que duplicar productos.

## FUENTES

Los enlaces son resultados que devolvió el buscador. En la mayoría **no pude abrir la página completa** (solo vi el resumen), y se indica cuando es así.

| Elemento | Enlace consultado | Certeza |
|---|---|---|
| Jugos en agua o en leche como opción habitual en Colombia | https://www.mycolombianrecipes.com/colombian-banana-drink-jugo-de-banano-en-leche (solo resumen del buscador) | Probable |
| Jugos en leche típicos: aguacate, borojó; naranja en leche | https://www.colombia.com/gastronomia/noticias/5-jugos-con-leche-que-sorprenden-a-quienes-visitan-colombia-598165 (solo resumen) | Probable |
| Vaso vs jarra, agua vs leche, limonada (menú anónimo de almuerzos; sin nombre ni fecha, no verificable) | https://es.scribd.com/document/1024548403/Resto (solo resumen) | Suposición |
| Banano, mango, aguacate, piña como combinaciones locales; níspero y limonada de coco en Cartagena | https://aneia.uniandes.edu.co/los-jugos-curativos-en-presentacion-de-cubos-de-colores-toda-una-innovacion (solo resumen) | Probable |
| Negocio colombiano: batidos de fruta, ensaladas de fruta y bowls de energía (Lemon Fresh, Bogotá; descripción corporativa, sin carta) | https://gust.com/companies/lemon-fresh-est-2016 (solo resumen) | Probable |
| Cosechas (más de 500 tiendas) y Bawana como cadenas de jugos/batidos; sin carta | https://www.portafolio.co/negocios/asi-crece-el-negocio-de-jugos-naturales-en-colombia-505649 (solo resumen) | Suposición |
| Referencia internacional: tamaños S/M/L y proteína/boosts adicionables (Smoothie King, vía sitios de terceros) | https://menupedia.us/smoothie-king-menu/ | Probable |
| Referencia internacional histórica: boosts de avena, yogur griego y chía (Jamba, 2013) | https://www.franchising.com/news/20130806_jamba_juice_expands_boost_offerings_with_new_whole.html (solo resumen) | Probable |
| Ensalada de frutas con granola, coco rallado, miel, queso cottage; chica y grande (México, no Colombia) | https://www.rappi.com.mx/restaurantes/1923279495-jugazo (solo resumen) | Suposición |
| Square: tamaño como variación, adiciones como modificadores, sin precio de modificador por tamaño | https://squareup.com/help/article/5119 y https://community.squareup.com/t5/Food-Beverage/Dynamic-Modifiers/m-p/821874 | Probable |
| Siigo POS: orientado a restaurantes, bares y cafeterías; sin plantilla de juguería encontrada | https://www.siigo.com/sistema-pos/restaurantes | Suposición |
| Fudo: restaurantes, cafés, dark kitchens; sin plantilla de juguería encontrada | https://www.softwareadvice.com.au/software/500642/FUDO | Suposición |
| Loggro: POS y gestión de restaurantes (adquirió PirPos); sin plantilla de juguería encontrada | https://en.wikipedia.org/wiki/Loggro | Suposición |
| Toast: guía de plan de negocio de juice bar (no pude abrirla) | https://pos.toasttab.com/es-us/blog/on-the-line/juice-bar-business-plan | Suposición |
| Lightspeed | No encontré nada | Suposición |
| Endulzantes (azúcar, panela, miel, stevia), hielo, linaza, espinaca, jengibre | Sin fuente: conocimiento propio | Suposición |
| Categoría "fruta por porción o peso" (fruver) | Sin fuente: conocimiento propio | Suposición |

## Dudas para un dueño real

1. **El "fruver" ¿se vende por peso o por unidad?** Si el negocio vende fruta al detal (kilo, libra, canasta), RestaurantOS necesitaría venta por peso. La plantilla solo cubre porciones.
2. **¿El precio cambia según la fruta?** En muchas juguerías el mango, la mora o el aguacate cuestan más que la naranja. ¿Se cobra por fruta (precio_extra por fruta) o hay un precio único por jugo? Eso decide si `frutas` lleva extras.
3. **¿Cuántos tamaños usan y con qué nombre?** ¿Vaso de 12 oz y 16 oz, jarra, litro? ¿Son los mismos para jugos y batidos?
4. **¿"En leche" cuesta más que "en agua"?** ¿Cuánto, y varía por tamaño? ¿Venden leche vegetal, y a qué recargo?
5. **¿Cómo cobran las adiciones (avena, proteína, chía)?** ¿Precio fijo, o más caras en tamaño grande? (Square no lo soporta, y puede ser una carencia que RestaurantOS cubra.)
6. **¿Qué endulzante usan por defecto?** ¿Preguntan siempre "con o sin azúcar", o ya sale endulzado por defecto?
7. **¿Venden jarras para llevar o por litro?** ¿Con qué envases, y se descuentan del inventario?
8. **¿Descuentan inventario por receta?** (cuántos gramos de fruta por vaso) ¿O solo cuentan cajas y kilos de fruta?
9. **Mermas y fruta madura:** ¿registran la fruta que se daña? Es una pérdida grande en este tipo de negocio.
10. **¿Combos?** (jugo + sándwich, jugo + ensalada) y ¿qué más venden además de bebidas: sándwiches, empanadas, helados, cafés?
11. **¿Ofrecen "mezclas de la casa" con nombre?** (por ejemplo "Defensas", "Detox") ¿O todo es armar la mezcla?
12. **¿Qué ven los clientes en el menú digital?** ¿Les sirve armar su propio jugo desde el celular, o prefieren una lista cerrada de jugos?
