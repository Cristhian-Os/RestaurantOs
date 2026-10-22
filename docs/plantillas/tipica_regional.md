# Plantilla `tipica_regional` - Comidas típicas regionales colombianas

Borrador de investigación (Anexo B 3.1). Fecha de consulta: 2026-10-16.

## Alcance de la investigación (leer primero)

- Sí hubo acceso a internet, pero limitado. WebFetch bloqueó varios dominios (siigo.com, lightspeedhq.com, doordash.com, yelp.com, tripadvisor) y varios sitios de restaurantes colombianos no publican carta con opciones en HTML.
- Negocios consultados: **4 colombianos** (Mondongo's, Don Jediondo, Hato Viejo, La Puerta Falsa; solo los dos primeros con datos de carta, los otros por reseñas) más una guía con 10 negocios de Medellín (datos secundarios, no son cartas) y **3 internacionales** (La Fonda Antioqueña de Los Ángeles con carta parcial; El Mayoral y Fonda Sabaneta de Miami solo por reseñas). Ninguno dio la carta completa con todas las opciones; por eso hay muchas Suposiciones.
- Competidores: Toast (documentación oficial leída), Square (solo un hilo de la comunidad, 2023), Fudo (solo una publicación de redes). **Loggro, Siigo POS y Lightspeed: no pude leer su documentación**; solo hay datos de la página comercial de Siigo vía resumen de búsqueda. Nada de eso es una plantilla por tipo de negocio confirmada.
- No copié textos ni fotos; solo nombres de opciones y categorías.

## Hallazgos clave

1. **El plato fuerte típico se vende como "plato armado" con acompañantes fijos** (bandeja paisa: arroz, frijoles, carne molida, chicharrón, huevo, chorizo/morcilla, arepa, plátano maduro, hogao, aguacate). El cliente rara vez elige los acompañantes del plato principal; elige **quitar** o **agregar** items. Por eso el grupo central es "adiciones / proteínas extra", no "elige tu acompañante".
2. **Las sopas llevan acompañantes propios** (ajiaco: crema de leche, alcaparras, aguacate, arroz, arepa; mondongo: aguacate, plátano, arroz, limón, cilantro, ají, a veces torta de elote). Mondongo's cobra un tamaño menor de la misma sopa (porción pequeña) y tiene unas 15 adiciones entre 300 y 9.000 COP (nombres no publicados).
3. **Porciones**: aparecen "completa / pequeña", plato infantil y la opción de compartir una bandeja entre dos. Hay "sopitas pequeñas" y acompañantes vendidos por tamaño (frijoles pequeño/grande) en La Fonda Antioqueña (LA).
4. **Se vende por unidad**: tamales, empanadas, arepas rellenas, fritanga (por pieza).
5. **Bebidas típicas**: jugos "en agua" y "en leche" (Seguro, Mondongo's), gaseosa, chocolate, agua de panela, mazamorra, cerveza. Chocolate santafereño con tamal es un maridaje típico en Bogotá.
6. **Categorías observadas** (Don Jediondo): Entraditas, Sopitas, Típicos, Frijoles, Parrilla, Picadas, Hamburguesas, Desayunos, Niños, Bebidas. (Mondongo's): Platos típicos, Parrilla, Postres, Bebidas. (La Fonda Antioqueña): Típico, Res y cerdo, Pollo, Pescado, Desayunos, Entradas, Sopas, Bebidas, Postres.
7. **Menú ejecutivo / corrientazo**: sopa del día + plato + arroz + ensalada + frijoles + jugo + a veces postre (guía Medellín, El Rancherito). Es un modelo distinto a la carta; probablemente necesita un producto "Almuerzo del día" con grupo de proteína a escoger.
8. **Competidores**: todos usan el esquema "grupo de modificadores" con opciones, obligatorio/opcional y selección única/múltiple. Toast documenta: grupo obligatorio (al menos 1), selección múltiple con máximo, y premodificadores (NO, EXTRA, SUB). No encontré plantillas de menú precargadas por tipo de restaurante en ninguno; las "plantillas" que salen en buscadores son de diseño de carta impresa. Es decir, una plantilla por tipo de negocio sería un diferenciador, no un estándar (Suposición, no verificado en Loggro/Siigo/Fudo).

## Borrador JSON

```json
{
  "key": "tipica_regional",
  "nombre": "Comidas típicas regionales colombianas",
  "descripcion": "Restaurante de cocina colombiana tradicional: bandeja paisa, ajiaco, sancocho, mondongo, tamales y platos del día, con sopas, parrilla, desayunos y bebidas típicas.",
  "categorias": [
    {"value": "platos_tipicos", "label": "Platos típicos", "emoji": "🥘"},
    {"value": "sopas", "label": "Sopas y cazuelas", "emoji": "🍲"},
    {"value": "tamales_envueltos", "label": "Tamales y envueltos", "emoji": "🫔"},
    {"value": "parrilla", "label": "Parrilla y carnes", "emoji": "🥩"},
    {"value": "entradas", "label": "Entradas y fritanga", "emoji": "🥟"},
    {"value": "almuerzos", "label": "Almuerzo del día", "emoji": "🍽️"},
    {"value": "desayunos", "label": "Desayunos", "emoji": "🍳"},
    {"value": "para_compartir", "label": "Para compartir", "emoji": "🧺"},
    {"value": "ninos", "label": "Niños", "emoji": "🧒"},
    {"value": "postres", "label": "Postres", "emoji": "🍮"},
    {"value": "bebidas_calientes", "label": "Bebidas calientes", "emoji": "☕"},
    {"value": "jugos", "label": "Jugos naturales", "emoji": "🥤"},
    {"value": "bebidas", "label": "Bebidas", "emoji": "🥛"}
  ],
  "listas": [
    {"key": "porciones", "nombre": "Porción", "items": [
      {"label": "Completa", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Pequeña / media", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Para compartir (2 personas)", "precio_extra": 0, "certeza": "Suposición"}
    ]},
    {"key": "proteinas_extra", "nombre": "Proteínas extra", "items": [
      {"label": "Chicharrón", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Carne molida", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Chorizo", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Morcilla", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Huevo frito", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Pechuga de pollo", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Costilla de cerdo", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Carne de res (lomo/churrasco)", "precio_extra": 0, "certeza": "Probable"}
    ]},
    {"key": "acompanantes", "nombre": "Acompañantes", "items": [
      {"label": "Arroz", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Frijoles", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Arepa", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Aguacate", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Plátano maduro", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Patacón", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Papa criolla", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Papa al vapor", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Yuca", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Ensalada", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Hogao", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Torta de elote", "precio_extra": 0, "certeza": "Suposición"}
    ]},
    {"key": "adiciones_sopa", "nombre": "Acompañantes de la sopa", "items": [
      {"label": "Aguacate", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Arroz", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Crema de leche", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Alcaparras", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Arepa", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Plátano", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Ají / salsa picante", "precio_extra": 0, "certeza": "Probable"}
    ]},
    {"key": "tipo_tamal", "nombre": "Tipo de tamal", "items": [
      {"label": "Pollo", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Cerdo", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Mixto (pollo y cerdo)", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Res", "precio_extra": 0, "certeza": "Probable"}
    ]},
    {"key": "base_jugo", "nombre": "Jugo en", "items": [
      {"label": "En agua", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "En leche", "precio_extra": 0, "certeza": "Seguro"}
    ]},
    {"key": "bebidas_tipicas", "nombre": "Bebidas típicas", "items": [
      {"label": "Chocolate", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Agua de panela", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Gaseosa", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Vaso de leche", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Mazamorra", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Cerveza", "precio_extra": 0, "certeza": "Probable"}
    ]},
    {"key": "sopa_del_dia", "nombre": "Sopa del día", "items": [
      {"label": "Sopa del día (la define el dueño)", "precio_extra": 0, "certeza": "Suposición"}
    ]}
  ],
  "grupos_tipicos": [
    {"id": "g_porcion", "nombre": "Porción", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "porciones"}},
    {"id": "g_proteina_extra", "nombre": "Proteínas extra", "modo": "multi", "min": 0, "max": 4, "requerido": false, "fuente": {"lista": "proteinas_extra"}},
    {"id": "g_acompanantes_extra", "nombre": "Acompañantes adicionales", "modo": "multi", "min": 0, "max": 5, "requerido": false, "fuente": {"lista": "acompanantes"}},
    {"id": "g_acomp_sopa", "nombre": "Con la sopa", "modo": "multi", "min": 0, "max": 6, "requerido": false, "fuente": {"lista": "adiciones_sopa"}},
    {"id": "g_tipo_tamal", "nombre": "Tipo de tamal", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "tipo_tamal"}},
    {"id": "g_base_jugo", "nombre": "Jugo en", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "base_jugo"}},
    {"id": "g_quitar", "nombre": "Quitar del plato", "modo": "multi", "min": 0, "max": 5, "requerido": false, "fuente": {"items": [
      {"label": "Sin chicharrón", "precio_extra": 0},
      {"label": "Sin huevo", "precio_extra": 0},
      {"label": "Sin aguacate", "precio_extra": 0},
      {"label": "Sin cilantro", "precio_extra": 0},
      {"label": "Sin picante", "precio_extra": 0}
    ]}},
    {"id": "g_sopa_dia", "nombre": "Sopa del día", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "sopa_del_dia"}}
  ],
  "platos_ejemplo": [
    {"nombre": "Bandeja paisa", "categoria": "platos_tipicos", "precio": 0, "grupos": ["g_porcion", "g_proteina_extra", "g_acompanantes_extra", "g_quitar"]},
    {"nombre": "Ajiaco santafereño", "categoria": "sopas", "precio": 0, "grupos": ["g_porcion", "g_acomp_sopa"]},
    {"nombre": "Sancocho de gallina", "categoria": "sopas", "precio": 0, "grupos": ["g_porcion", "g_acomp_sopa"]},
    {"nombre": "Mondongo", "categoria": "sopas", "precio": 0, "grupos": ["g_porcion", "g_acomp_sopa"]},
    {"nombre": "Tamal", "categoria": "tamales_envueltos", "precio": 0, "grupos": ["g_tipo_tamal"]},
    {"nombre": "Almuerzo del día", "categoria": "almuerzos", "precio": 0, "grupos": ["g_sopa_dia", "g_proteina_extra"]},
    {"nombre": "Picada para compartir", "categoria": "para_compartir", "precio": 0, "grupos": ["g_acompanantes_extra"]},
    {"nombre": "Jugo natural", "categoria": "jugos", "precio": 0, "grupos": ["g_base_jugo"]}
  ]
}
```

Notas del JSON: todos los `precio_extra` están en 0 porque no encontré ninguna regla de recargo casi universal. Los grupos `g_sopa_dia` y `g_quitar` son ideas propias (no vi ninguno en cartas reales); `g_quitar` se apoya en la práctica de "premodificadores NO/EXTRA" documentada por Toast.

## Fuentes

| Elemento | Enlace | Certeza |
|---|---|---|
| Bandeja paisa: arroz, frijoles, carne molida, chicharrón, huevo, arepa, plátano maduro, hogao, aguacate (+ chorizo/morcilla) | https://colombiamove.com/blog/top-10-restaurantes-comida-tipica-medellin/ , https://medellinguru.com/mondongos/ , https://www.portafolio.co/tendencias/sociales/solo-los-amantes-de-la-comida-colombiana-saben-que-plato-lleva-10-acompanamientos-641171 | Seguro |
| Extras de bandeja (tocino, costilla, jamón/pollo, queso, ají) | https://www.portafolio.co/tendencias/sociales/solo-los-amantes-de-la-comida-colombiana-saben-que-plato-lleva-10-acompanamientos-641171 | Probable (una sola fuente) |
| Ajiaco con aguacate, alcaparras, crema de leche, arroz | https://mondongos.com.co | Seguro (varias fuentes: Mondongo's y reseñas LA/Miami) |
| Mondongo con aguacate, plátano, limón, cilantro, salsa, arroz, torta de elote | https://mondongos.com.co | Probable |
| Sopa en tamaño pequeño (mondongo) | https://medellinguru.com/mondongos/ | Probable |
| ~15 adiciones de 300 a 9.000 COP en Mondongo's (nombres no publicados) | https://medellinguru.com/mondongos/ | Probable (fecha 2019) |
| Jugos en agua / en leche, gaseosa, vaso de leche, mazamorra | https://mondongos.com.co | Seguro |
| Categorías Entraditas, Sopitas, Típicos, Frijoles, Parrilla, Picadas, Desayunos, Niños, Bebidas | https://donjediondo.com/ | Probable |
| Categorías Típico, Res y cerdo, Pollo, Pescado, Entradas, Desayunos, Sopas, Bebidas, Postres; acompañantes por separado (frijoles pequeño/grande, arroz, maduro, yuca, papa criolla) | https://postmates.com/store/la-fonda-antioquena/G8Qele-lRIWKfLqdcQejqQ | Probable |
| Tamal y ajiaco como productos estrella; chocolate santafereño | https://atlasobscura.com/places/la-puerta-falsa , https://colombiamove.com/blog/top-10-restaurantes-comida-tipica-medellin/ | Probable |
| Tamal por unidad, relleno pollo/cerdo/res | Resultados de búsqueda (guía A Coruña/Miami, sin enlace estable) | Probable |
| Fritanga y arepas se cobran por pieza | https://colombiamove.com/blog/top-10-restaurantes-comida-tipica-medellin/ | Probable |
| Menú ejecutivo: sopa + plato + arroz + ensalada + frijoles + jugo (+ postre) | https://colombiamove.com/blog/top-10-restaurantes-comida-tipica-medellin/ | Probable |
| Cortesía de entrada (chicharrones, patacones, guacamole) en Hato Viejo | https://medellinguru.com/hato-viejo/ | Suposición (una reseña) |
| Bandeja infantil o compartir entre dos | https://medellinguru.com/mondongos/ (la nota original decía que se puede compartir; el plato infantil no se confirmó) | Suposición |
| Tipos de carta y mezcla de tradicional con parrilla/hamburguesas | https://donjediondo.com/ | Probable |
| Toast: grupos de modificadores obligatorio/opcional, selección múltiple con máximo, sin mínimo configurable | https://support.toasttab.com/es-US/article/Creating-Modifier-Groups-and-Modifiers-1492803987509 | Seguro |
| Toast: premodificadores NO/EXTRA/SUB | https://pos.toasttab.com/es-us/blog/on-the-line/restaurant-menu-templates (resumen de búsqueda) | Probable |
| Square: requerido y máximo por artículo, no por grupo global | https://community.squareup.com/t5/Square-for-Restaurants/Modifiers-on-menu-items-In-Square-for-Restaurants/m-p/685182 | Probable (foro 2023) |
| Fudo: "Grupos modificadores" que cambian el precio final | https://www.infogastronomica.com.ar/repost-socialfudo-19/ | Probable |
| Siigo POS: recetas y combos para restaurantes | https://www.siigo.com/sistema-pos/restaurantes (no pude abrirla; solo resumen de búsqueda) | Suposición |
| Loggro, Lightspeed: sin documentación leída | n/a | Suposición |
| Precios de referencia (NO usados): bandeja paisa 33.500 COP (2019, Mondongo's) | https://medellinguru.com/mondongos/ | informativo |
| Opción "Mixto" de tamal, grupo "sopa del día", grupo "quitar", porción "para compartir" | Criterio propio | Suposición |

## Dudas para un dueño real

1. **¿Los acompañantes del plato principal son fijos o el cliente puede cambiarlos?** (por ejemplo cambiar arroz por papa, o pedir sin frijoles). Define si el grupo es "elige" o "quita/agrega".
2. **¿Cobra las adiciones y proteínas extra? ¿A qué precio, y es el mismo para todos los platos?** Aquí dejé todo en 0 porque no hay regla universal.
3. **¿Vende media porción / porción pequeña?** ¿Cómo la maneja (otro producto, o variante de tamaño)? ¿Y plato infantil o bandeja para compartir?
4. **¿Trabaja con menú del día / corrientazo?** ¿La sopa y la proteína cambian cada día? ¿Quiere que el sistema rote el "plato del día" o lo carga a mano?
5. **¿Los tamales y envueltos se venden por unidad, por pedido anticipado o solo ciertos días (fin de semana)?** ¿Hay límite de existencias por día?
6. **¿Se agotan platos durante el día (sancocho, mondongo)?** ¿Necesita marcar "agotado" rápido y que el menú del cliente lo oculte?
7. **¿Las bebidas típicas (jugos en agua/leche, chocolate, agua de panela) tienen tamaño o precio distinto según la base?**
8. **¿Qué se cobra aparte: aguacate, arepa, aliños, ají, empaque para llevar?** ¿Hay cargo por domicilio o por llevar?
9. **¿El restaurante tiene parrilla/asados además de lo típico?** Si sí, ¿pregunta término de la carne? (no lo incluí; es Suposición).
10. **¿Maneja propina sugerida o servicio?** (práctica común en restaurantes de mesa, no verificada en las cartas consultadas).
