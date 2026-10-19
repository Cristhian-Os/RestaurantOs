# Plantilla: Comida rápida (`comida_rapida`)

> **Nota de método (leer primero).** Hubo acceso a búsqueda web, pero la lectura directa de páginas falló (carta.menu devolvió 403/"socket hang up", Scribd bloqueado). Todo lo de abajo viene de **resúmenes de resultados de búsqueda**, no de las cartas completas. Por eso solo se marcó "Seguro" lo que aparece en 3 o más fuentes independientes. Los precios de las cartas NO se usan (precio 0 en todo). No se copiaron textos ni fotos, solo nombres de opciones y categorías.

## Borrador JSON

```json
{
  "key": "comida_rapida",
  "nombre": "Comida rápida",
  "descripcion": "Hamburguesas, perros calientes, salchipapas, combos, acompañamientos y bebidas. Pedido rápido con adiciones, salsas y combos.",
  "categorias": [
    {"value": "hamburguesas", "label": "Hamburguesas", "emoji": "🍔"},
    {"value": "perros_calientes", "label": "Perros calientes", "emoji": "🌭"},
    {"value": "salchipapas", "label": "Salchipapas", "emoji": "🍟"},
    {"value": "combos", "label": "Combos", "emoji": "🍱"},
    {"value": "sandwiches", "label": "Sándwiches", "emoji": "🥪"},
    {"value": "pollo_alitas", "label": "Pollo y alitas", "emoji": "🍗"},
    {"value": "acompanamientos", "label": "Acompañamientos", "emoji": "🧅"},
    {"value": "adicionales", "label": "Adicionales", "emoji": "➕"},
    {"value": "bebidas", "label": "Bebidas", "emoji": "🥤"},
    {"value": "malteadas_postres", "label": "Malteadas y postres", "emoji": "🍦"},
    {"value": "infantil", "label": "Menú infantil", "emoji": "🧒"}
  ],
  "listas": [
    {
      "key": "salsas",
      "nombre": "Salsas",
      "items": [
        {"label": "Rosada", "precio_extra": 0, "certeza": "Seguro"},
        {"label": "Tomate", "precio_extra": 0, "certeza": "Seguro"},
        {"label": "Mayonesa", "precio_extra": 0, "certeza": "Seguro"},
        {"label": "Mostaza", "precio_extra": 0, "certeza": "Seguro"},
        {"label": "BBQ", "precio_extra": 0, "certeza": "Seguro"},
        {"label": "Piña", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Ajo", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Tártara", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Picante / ají", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Salsa de la casa", "precio_extra": 0, "certeza": "Probable"}
      ]
    },
    {
      "key": "adiciones",
      "nombre": "Adiciones",
      "items": [
        {"label": "Queso", "precio_extra": 0, "certeza": "Seguro"},
        {"label": "Tocineta", "precio_extra": 0, "certeza": "Seguro"},
        {"label": "Huevo", "precio_extra": 0, "certeza": "Seguro"},
        {"label": "Pollo", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Carne desmechada", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Piña", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Jalapeño", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Cebolla grillé", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Salchicha extra", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Doble carne", "precio_extra": 0, "certeza": "Seguro"},
        {"label": "Porción de papas", "precio_extra": 0, "certeza": "Seguro"},
        {"label": "Huevo de codorniz", "precio_extra": 0, "certeza": "Probable"}
      ]
    },
    {
      "key": "ingredientes_quitar",
      "nombre": "Ingredientes que se pueden quitar",
      "items": [
        {"label": "Sin cebolla", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Sin tomate", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Sin lechuga", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Sin pepinillos", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Sin salsas", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Sin queso", "precio_extra": 0, "certeza": "Suposición"}
      ]
    },
    {
      "key": "toppings_perro",
      "nombre": "Toppings del perro caliente",
      "items": [
        {"label": "Queso rallado", "precio_extra": 0, "certeza": "Seguro"},
        {"label": "Papa ripio (papitas trituradas)", "precio_extra": 0, "certeza": "Seguro"},
        {"label": "Tocineta", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Huevo de codorniz", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Cebolla", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Repollo", "precio_extra": 0, "certeza": "Probable"}
      ]
    },
    {
      "key": "terminos_carne",
      "nombre": "Término de la carne",
      "items": [
        {"label": "Medio", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Tres cuartos", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Bien cocida", "precio_extra": 0, "certeza": "Suposición"}
      ]
    },
    {
      "key": "tamanos_papas",
      "nombre": "Tamaño de las papas",
      "items": [
        {"label": "Pequeña", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Mediana", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Grande", "precio_extra": 0, "certeza": "Probable"}
      ]
    },
    {
      "key": "tipos_papas",
      "nombre": "Tipo de papas del combo",
      "items": [
        {"label": "Papa a la francesa", "precio_extra": 0, "certeza": "Seguro"},
        {"label": "Papa criolla", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Papa rústica", "precio_extra": 0, "certeza": "Probable"}
      ]
    },
    {
      "key": "bebidas_combo",
      "nombre": "Bebida del combo",
      "items": [
        {"label": "Gaseosa", "precio_extra": 0, "certeza": "Seguro"},
        {"label": "Jugo natural", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Agua", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Malteada", "precio_extra": 0, "certeza": "Probable"}
      ]
    },
    {
      "key": "tipo_pan",
      "nombre": "Tipo de pan",
      "items": [
        {"label": "Pan normal", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Pan artesanal", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Sin pan (en plato)", "precio_extra": 0, "certeza": "Suposición"}
      ]
    },
    {
      "key": "proteina",
      "nombre": "Proteína",
      "items": [
        {"label": "Res", "precio_extra": 0, "certeza": "Seguro"},
        {"label": "Pollo", "precio_extra": 0, "certeza": "Seguro"},
        {"label": "Cerdo", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Vegetariana", "precio_extra": 0, "certeza": "Probable"}
      ]
    }
  ],
  "grupos_tipicos": [
    {"id": "g_termino_carne", "nombre": "Término de la carne", "modo": "single", "min": 1, "max": 1, "requerido": false, "fuente": {"lista": "terminos_carne"}},
    {"id": "g_salsas", "nombre": "Salsas", "modo": "multi", "min": 0, "max": 4, "requerido": false, "fuente": {"lista": "salsas"}},
    {"id": "g_adiciones", "nombre": "Adiciones", "modo": "multi", "min": 0, "max": 6, "requerido": false, "fuente": {"lista": "adiciones"}},
    {"id": "g_quitar", "nombre": "Quitar ingredientes", "modo": "multi", "min": 0, "max": 6, "requerido": false, "fuente": {"lista": "ingredientes_quitar"}},
    {"id": "g_toppings_perro", "nombre": "Toppings del perro", "modo": "multi", "min": 0, "max": 6, "requerido": false, "fuente": {"lista": "toppings_perro"}},
    {"id": "g_tamano_papas", "nombre": "Tamaño de papas", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "tamanos_papas"}},
    {"id": "g_tipo_papas", "nombre": "Tipo de papas", "modo": "single", "min": 1, "max": 1, "requerido": false, "fuente": {"lista": "tipos_papas"}},
    {"id": "g_bebida_combo", "nombre": "Bebida del combo", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "bebidas_combo"}},
    {"id": "g_pan", "nombre": "Tipo de pan", "modo": "single", "min": 1, "max": 1, "requerido": false, "fuente": {"lista": "tipo_pan"}},
    {"id": "g_proteina", "nombre": "Proteína", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "proteina"}},
    {"id": "g_combo_si_no", "nombre": "¿Lo quieres en combo?", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"items": [{"label": "Solo", "precio_extra": 0}, {"label": "En combo (papas + bebida)", "precio_extra": 0}]}},
    {"id": "g_para_llevar", "nombre": "Para llevar o aquí", "modo": "single", "min": 1, "max": 1, "requerido": false, "fuente": {"items": [{"label": "Aquí", "precio_extra": 0}, {"label": "Para llevar", "precio_extra": 0}]}}
  ],
  "platos_ejemplo": [
    {"nombre": "Hamburguesa sencilla", "categoria": "hamburguesas", "precio": 0, "grupos": ["g_termino_carne", "g_adiciones", "g_quitar", "g_salsas", "g_combo_si_no"]},
    {"nombre": "Hamburguesa doble con tocineta", "categoria": "hamburguesas", "precio": 0, "grupos": ["g_termino_carne", "g_adiciones", "g_quitar", "g_salsas", "g_combo_si_no"]},
    {"nombre": "Perro caliente especial", "categoria": "perros_calientes", "precio": 0, "grupos": ["g_toppings_perro", "g_salsas", "g_adiciones", "g_quitar"]},
    {"nombre": "Salchipapa sencilla", "categoria": "salchipapas", "precio": 0, "grupos": ["g_adiciones", "g_salsas"]},
    {"nombre": "Salchipapa especial", "categoria": "salchipapas", "precio": 0, "grupos": ["g_adiciones", "g_salsas"]},
    {"nombre": "Combo hamburguesa", "categoria": "combos", "precio": 0, "grupos": ["g_termino_carne", "g_tamano_papas", "g_bebida_combo", "g_salsas", "g_quitar"]},
    {"nombre": "Combo perro", "categoria": "combos", "precio": 0, "grupos": ["g_toppings_perro", "g_tamano_papas", "g_bebida_combo", "g_salsas"]},
    {"nombre": "Papas a la francesa", "categoria": "acompanamientos", "precio": 0, "grupos": ["g_tamano_papas", "g_salsas"]},
    {"nombre": "Gaseosa", "categoria": "bebidas", "precio": 0, "grupos": []},
    {"nombre": "Malteada", "categoria": "malteadas_postres", "precio": 0, "grupos": []}
  ]
}
```

## FUENTES

Nota: las URL fueron resultados reales de búsqueda; el contenido se leyó solo vía resumen del buscador (las páginas completas no se pudieron abrir).

| Elemento | Enlace | Nivel de certeza |
|---|---|---|
| Categorías: hamburguesas, perros, salchipapas, sándwiches, arepas, patacones, combos | https://es.scribd.com/document/1010357159/Menu (Salchi Antojos / Las Delicias de Reina / Pinchos y Arepas vía resumen) | Seguro (varios negocios) |
| Salchipapa en versiones sencilla / especial / "super especial" (con huevo, queso, tocineta) | https://es.scribd.com/document/1010357159/Menu | Probable |
| Hamburguesa sencilla / con tocineta / doble carne y tocineta; combo con papa | https://es.scribd.com/document/974171303/Menu ; https://es.scribd.com/document/1014036352/Asa | Seguro |
| Adicionales con precio individual (queso, tocineta, pollo, carne desmechada, piña, jalapeño, papas) | https://es.scribd.com/document/976966385/menu-5 | Probable (un solo negocio, coherente con adiciones de Presto/El Corral) |
| Combo = producto + papas + bebida (+ juguete en infantil); salsa de la casa | https://carta.menu/restaurants/suba/presto-34/menu ; https://carta.menu/restaurants/suba/hot-delivery/menu | Seguro |
| El Corral: hamburguesas con tocineta, BBQ, queso americano, cebolla grillé; combo smash; perros gourmet | https://www.las2orillas.co/?p=934687 ; https://www.pulzo.com/vivir-bien/las-mejores-hamburguesas-el-corral-segun-inteligencia-artificial-PP3114877A ; https://www.eltiempo.com/cultura/gastronomia/guia-de-perros-calientes-gourmet-para-probar-706489 | Probable |
| Presto: hamburguesa + papas pequeñas + bebida + juguete, salchipapa, nuggets, malteadas | https://www.larepublica.co/empresas/en-su-aniversario-numero-40-presto-estimo-ventas-de-ocho-millones-de-combos-al-ano-3236561 ; https://carta.menu/restaurants/suba/presto-34/menu | Probable |
| Artesanal: pan de papa, queso, tocineta, cebolla caramelizada, papas rústicas | https://www.eltiempo.com/carrusel/las-10-mejores-hamburguesas-de-bogota-307148 ; https://parquejaimeduque.com/wp-content/uploads/2024/10/Menu-Bocatipicos-web.pdf | Probable |
| Perro colombiano: salsas rosada, piña, ajo, tártara; queso rallado, papa ripio, tocineta, huevo de codorniz, repollo | https://www.eltiempo.com/cultura/gastronomia/hot-dogs-el-maravilloso-encanto-de-los-perros-calientes-colombianos-706278 ; https://www.diariodelsur.com.co/?p=443553 ; https://www.directoalpaladar.com/recetas-de-sandwiches-y-bocadillos/perrito-caliente-al-estilo-colombiano-mucho-que-simple-hot-dog ; https://www.portafolio.co/tendencias/sociales/el-perro-caliente-colombiano-entre-los-mejores-de-america-latina-que-lo-hace-especial-487095 | Seguro |
| Perros gourmet con ternera/res/cerdo/vegetariano (proteína) | https://www.eltiempo.com/cultura/gastronomia/guia-de-perros-calientes-gourmet-para-probar-706489 | Probable |
| Términos de la carne (medio, tres cuartos, bien cocida) | https://www.contextoganadero.com/reportaje/carne-cual-es-el-mejor-punto-de-coccion | Suposición (no se confirmó que la comida rápida colombiana los pregunte; en hamburguesas de res molida lo habitual es bien cocida) |
| Referencia internacional Five Guys: toppings gratis, salsas (ketchup, mostaza, BBQ, picante), tamaños Little/Regular, papas en 3 tamaños, perros, mix-ins de malteada | https://www.chowhound.com/2113764/five-guys-perk-redeem-overpriced-burgers-free-toppings ; https://www.timeout.com/sydney/restaurants/five-guys-sydney-cbd | Probable |
| Referencia internacional Shake Shack: categorías burgers, chicken, dogs, fries, shakes, bebidas; salsas para papas | Resultados de baja calidad (sin URL confiable) | Suposición |
| Toast: grupo "Meat Temperature" como modifier group requerido, un solo valor, reutilizable a nivel de menú/subgrupo/ítem | https://support.toasttab.com/en/article/Creating-Modifier-Groups-and-Modifiers-1492803987509?lang=en_US ; https://support.toasttab.com/en/article/Required-Optional-Modifiers?lang=en_US | Seguro (documentación oficial) |
| Square: modifier sets con "una sola selección", requerido/máximo, nombre de cocina, precio; combos no nativos | https://squareup.com/help/us/en/article/6426-modifiers-and-categories-with-square-for-restaurants ; https://community.squareup.com/t5/Orders-Menu-Items-Catalog/Square-online-for-restaurants-combos/m-p/222618 | Seguro |
| Lightspeed: grupos de modificadores con mín/máx y "selección requerida"; combos con grupos de ítems (papas/aros/ensalada) | https://k-series-support.lightspeedhq.com/hc/en-us/articles/4407625615387-Modifying-combos ; https://help.deliverect.com/en/articles/7979201-lightspeed-restaurant-l-series-set-up-products-with-extra-options-and-upsells | Seguro |
| Fudo / Siigo POS / Loggro: no se halló documentación pública de plantillas por tipo de negocio. Siigo menciona recetas y combos; Fudo sincroniza menús con secciones y modificadores | https://www.siigo.com/sistema-pos/restaurantes ; https://sinqro.com/en-ar/store/fudo | Suposición (no se confirmó que ofrezcan plantillas; Loggro sin resultados) |

**Conclusión sobre competidores:** ninguno de los consultados mostró "plantillas por tipo de negocio" en documentación pública. Todos usan el mismo patrón: grupo de modificadores (single/multi, mín/máx, requerido) reutilizable y asignable a categoría o ítem, más combos como grupos de elección. Esa estructura coincide con `grupos_tipicos` de este borrador.

## Dudas para un dueño real

1. **Combos:** ¿el combo es un precio fijo con papas y bebida elegibles, o "producto + papas + bebida" con precio de cada parte? ¿Se cambia la bebida o las papas por otra cosa con recargo? (Define si el combo es un grupo requerido o un producto aparte.)
2. **Término de la carne:** ¿realmente preguntan el término al cliente o siempre sale bien cocida? Si no se pregunta, eliminar `g_termino_carne`.
3. **Adiciones con precio:** ¿qué adiciones cobran siempre (queso, tocineta, huevo, doble carne, porción de papas) y cuáles son gratis? ¿Cobran distinto en hamburguesa que en perro o salchipapa?
4. **Salsas:** ¿las salsas son gratis e ilimitadas, hay un máximo, o algunas (ají, ajo, piña) se cobran?
5. **Quitar ingredientes:** ¿"sin cebolla/tomate" solo se avisa a cocina o también afecta inventario/receta?
6. **Tamaños:** ¿las papas y bebidas tienen tamaños con precio distinto, o una sola presentación?
7. **Salchipapa:** ¿las versiones (sencilla, especial, super especial) son productos separados o una sola salchipapa con adiciones?
8. **Perros:** ¿el perro lleva toppings fijos por receta, o el cliente elige cuáles?
9. **Menú infantil / juguete:** ¿se maneja como combo aparte con regalo? ¿Descuenta inventario del juguete?
10. **Domicilios:** ¿el precio en apps de domicilio es distinto al del local? ¿Cobran empaque o domicilio por separado?
11. **Para llevar vs. aquí:** ¿hay recargo de empaque o impuesto al consumo distinto?
12. **Dos copias de producto:** ¿vende por mitades o "mixto" (res + pollo) en alguna preparación?
