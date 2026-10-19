# Plantilla `comida_mexicana` - Comida mexicana (taquería, mesa con cocteles, burrito/bowl, Tex-Mex)

Fecha: 2026-10-16. Borrador para revisión. Español de Colombia.

## Aviso de método y límites de la investigación (leer primero)

- La herramienta de lectura de páginas (WebFetch) funcionó a medias. Pude leer la home de **El Mexican** (con precios) y la de **Wajaca**, el menú web de **Tacombi** (EE. UU.) y varios artículos de prensa. Quedaron **bloqueadas o ilegibles**: medellinguru.com (no verificable), carta.menu (HTTP 403, D Toluca Cali), qdoba.com (403), taqueriapopular.com (dominio inexistente), Wahaca UK (PDF comprimido ilegible) y chipotle.com (sin los pasos de armado).
- Por eso **ninguna "carta completa" fue leída ítem por ítem**: lo de Zacatecas, Agua Fresca, Mi Pico E Gallo, D Toluca, Taquería Popular y Gringo Cantina viene de **resúmenes de búsqueda y artículos** (varios de 2019-2021). Los precios NO se usan (todo queda en 0) y no se copió ningún texto: solo estructura.
- **Definición única de certeza (aplicada con criterio conservador):**
  - **Seguro** = aparece en 2 o más cartas/descripciones de menú de negocios COLOMBIANOS distintos que leí.
  - **Probable** = un solo negocio colombiano, o varios de referencia internacional.
  - **Suposición** = conocimiento propio sin fuente.
- Nada sobre niveles de picante, elección de salsa por el cliente, ni armado "línea de ensamble" quedó confirmado en una carta colombiana. Eso es lo más débil de la plantilla y va como Suposición.
- Competidores: solo encontré documentación pública de **Toast, Square y Wix Restaurants** (grupos de modificadores obligatorios/opcionales, mínimo/máximo). De **Loggro, Siigo POS, Fudo y Lightspeed no hallé documentación pública utilizable**.

---

# PARTE A - Estudio de carta

Subtipos cubiertos: (1) taquería de mostrador / delivery, (2) restaurante mexicano de mesa con cocteles y mezcal, (3) "arma tu burrito/bowl" (línea de ensamble), (4) Tex-Mex, (5) variante festiva "todo lo que pueda comer".

## 1. Taquería de mostrador / delivery

| Aspecto | Qué se observa |
|---|---|
| Estructura y orden de la carta | Tacos (por especialidad: pastor, birria, asada, chicharrón, suadero) -> quesadillas / tortas -> acompañamientos (totopos, guacamole, frijoles, esquites) -> bebidas (aguas frescas, cerveza, michelada) -> a veces cantaritos y margaritas. Carta corta, de pocas especialidades. |
| Qué elige el cliente | Proteína (casi siempre fija por plato: "tacos de birria"), cantidad (unidad u orden de 3/5, bandeja), tortilla (maíz por defecto; algunas casas ofrecen "tortilla de lechuga" o queso), salsas de mesa o en porción, extras (costra de queso, guacamole), caldo/consomé aparte en la birria. Picante: se resuelve con salsas, no con un nivel. |
| Combos / compartir | Bandeja de 4 tacos con su caldo, promociones tipo 3x2 un día de la semana, "all you can eat" en algunas. Combos con gaseosa. |
| Qué lo diferencia | Se vende por **unidad y por orden**; el producto estrella manda (trompo al pastor, birria). Pocas modificaciones, mucho volumen, domicilio y empaque simple. |
| Fuentes | El Tizoncito Bogotá, Taquería Popular, El Pastor del Siete, Taquería Mercado México (artículos de prensa). |

## 2. Restaurante mexicano de mesa con cocteles y mezcal

| Aspecto | Qué se observa |
|---|---|
| Estructura y orden de la carta | Entradas / antojitos (guacamole, nachos, flautas, tostadas, ceviche) -> tacos -> platos fuertes (enchiladas, fajitas, chimichangas) -> sopas / ensaladas -> postres -> bebidas sin alcohol -> cocteles (margaritas, mezcal) -> tequilas y mezcales por copa/botella. |
| Qué elige el cliente | Relleno de enchiladas y salsa (roja/verde/mole), proteína de fajitas, tortilla de maíz o harina para acompañar, sabor de la margarita, tequila o mezcal, borde de la copa, tamaño de bebida. |
| Combos / compartir | Platos para compartir (fajitas para la mesa, nachos grandes), cócteles en formato grande o jarra, "fiesta" para varios. |
| Qué lo diferencia | Servicio de mesa, cuenta compartida/dividida, **bar con alto margen** (margaritas, mezcal, cantaritos), mayor tiquete y propinas. Los modificadores del bar (sabor, base, borde) pesan más que los de comida. |
| Fuentes | Zacatecas, Agua Fresca, Tulum Mexican Soul, D Toluca (Cali), Idilio, Punto Baja (resúmenes de búsqueda / listados). |

## 3. "Arma tu burrito / bowl" (línea de ensamble)

| Aspecto | Qué se observa |
|---|---|
| Estructura y orden de la carta | Pocas categorías: burritos, bowls / tazones, tacos, nachos o quesadillas, bebidas, a veces menú infantil. Los pasos de armado funcionan como una carta dentro del producto. |
| Qué elige el cliente | En pasos: formato (burrito, bowl, tacos) -> proteína -> base (arroz) -> frijoles -> ingredientes -> salsas -> extras con costo (guacamole, queso, crema). Se cobra la proteína y el extra, no el resto. |
| Combos / compartir | Combo con bebida y/o totopos; pedidos de grupo (bandejas). |
| Qué lo diferencia | **Grupos de opciones en cadena** y rapidez de cola; el POS debe tolerar muchos grupos por producto. En Colombia lo vi solo de forma parcial: Wajaca anuncia burritos "de la casa" y una opción de armado, y The Master/Mercado México se centran en taco. La referencia fuerte es internacional (Burrito Republic en Costa Rica, Tacombi en EE. UU.). |
| Fuentes | Wajaca (Probable), Burrito Republic CR y Tacombi (referencia internacional). No hay una carta colombiana de "línea de ensamble" leída directamente. |

## 4. Tex-Mex

| Aspecto | Qué se observa |
|---|---|
| Estructura y orden de la carta | Nachos / aperitivos -> tacos -> burritos y quesadillas -> fajitas -> enchiladas -> chimichangas -> postres -> bebidas y cocteles. Porciones grandes. |
| Qué elige el cliente | Proteína, tortilla de harina o maíz, extras (queso, crema agria, guacamole, jalapeños), salsa, a veces tamaño. |
| Combos / compartir | Nachos para compartir, fajitas de varias proteínas, platos con arroz y frijoles incluidos. |
| Qué lo diferencia | Más queso, harina de trigo, crema agria y arroz/frijoles como guarnición; menos "trompo y tortilla de maíz". |
| Fuentes | Gringo Cantina 140 (Bogotá, estilo californiano-mexicano / Tex-Mex), Mi Pico E Gallo y Wajaca (Medellín: fajitas, chimichangas, burritos grandes). |

## 5. Variante festiva "todo lo que pueda comer" (all you can eat)

| Aspecto | Qué se observa |
|---|---|
| Estructura y orden de la carta | Carta normal más una **promoción** de tacos o tacos+nachos ilimitados con límite de tiempo (2 horas) y reglas (no se comparte, no se lleva). |
| Qué elige el cliente | Tipo de taco o nachos; la bebida suele ir aparte. |
| Combos / compartir | La promoción misma es el combo. |
| Qué lo diferencia | Precio fijo por persona y por tiempo, más que por producto. Es una **regla comercial** que el POS puede o no soportar; no entra en la plantilla. |
| Fuentes | El Mexican (home y artículo de El Espectador), Taquería Mercado México (jueves y viernes). Seguro: dos negocios colombianos distintos. |

---

# PARTE B - Borrador de plantilla

Notas de diseño: los grupos de proteína están **separados por plato** (tacos/burritos/nachos, fajitas, quesadilla, enchiladas) para que ninguna opción pierda sentido (ej. no se ofrece "birria" como relleno de enchiladas ni tortilla de lechuga en fajitas). Los grupos con opciones "pequeñas" (cantidad, tamaño, base del licor, tortilla maíz/harina) usan `fuente.items` en línea y por eso sus ítems no llevan `certeza`; su certeza se comenta en la tabla de fuentes.

```json
{
  "key": "comida_mexicana",
  "nombre": "Comida mexicana",
  "descripcion": "Taquerías, restaurantes mexicanos de mesa con cocteles y mezcal, burritos y bowls y Tex-Mex: tacos, burritos, quesadillas, nachos, fajitas, enchiladas y antojitos.",
  "categorias": [
    {"value": "tacos", "label": "Tacos", "emoji": "🌮"},
    {"value": "burritos_bowls", "label": "Burritos y bowls", "emoji": "🌯"},
    {"value": "quesadillas", "label": "Quesadillas", "emoji": "🧀"},
    {"value": "nachos", "label": "Nachos", "emoji": "🧂"},
    {"value": "antojitos", "label": "Antojitos", "emoji": "🥑"},
    {"value": "fajitas_enchiladas", "label": "Fajitas y enchiladas", "emoji": "🍽️"},
    {"value": "para_compartir", "label": "Combos y para compartir", "emoji": "🎉"},
    {"value": "bebidas", "label": "Bebidas", "emoji": "🥤"},
    {"value": "cocteles", "label": "Cocteles y mezcal", "emoji": "🍹"},
    {"value": "postres", "label": "Postres", "emoji": "🍩"}
  ],
  "listas": [
    {
      "key": "proteinas_mexicana",
      "nombre": "Proteínas para tacos, burritos, bowls y nachos",
      "items": [
        {"label": "Res asada", "precio_extra": 0, "certeza": "Seguro"},
        {"label": "Pollo", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Al pastor", "precio_extra": 0, "certeza": "Seguro"},
        {"label": "Cerdo (carnitas o cochinita)", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Chorizo", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Birria de res", "precio_extra": 0, "certeza": "Seguro"},
        {"label": "Chicharrón", "precio_extra": 0, "certeza": "Seguro"},
        {"label": "Camarón", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Vegetariano (hongos y nopales)", "precio_extra": 0, "certeza": "Seguro"}
      ]
    },
    {
      "key": "proteinas_fajitas_mexicana",
      "nombre": "Proteínas de las fajitas",
      "items": [
        {"label": "Res", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Pollo", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Camarón", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Mixta (res y pollo)", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Vegetariana", "precio_extra": 0, "certeza": "Suposición"}
      ]
    },
    {
      "key": "rellenos_quesadilla_mexicana",
      "nombre": "Rellenos de la quesadilla",
      "items": [
        {"label": "Solo queso", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Pollo", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Res", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Al pastor", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Hongos", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Chorizo", "precio_extra": 0, "certeza": "Suposición"}
      ]
    },
    {
      "key": "rellenos_enchilada_mexicana",
      "nombre": "Rellenos de las enchiladas",
      "items": [
        {"label": "Pollo", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Res deshebrada", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Queso", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Hongos y espinaca", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Camarón", "precio_extra": 0, "certeza": "Suposición"}
      ]
    },
    {
      "key": "salsas_enchilada_mexicana",
      "nombre": "Salsas para bañar las enchiladas",
      "items": [
        {"label": "Roja", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Verde", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Mole", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Suiza (crema y queso)", "precio_extra": 0, "certeza": "Suposición"}
      ]
    },
    {
      "key": "salsas_mexicana",
      "nombre": "Salsas de mesa",
      "items": [
        {"label": "Pico de gallo", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Salsa verde", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Salsa roja", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Salsa chipotle", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Salsa negra", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Salsa de habanero", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Salsa de pimentón", "precio_extra": 0, "certeza": "Probable"}
      ]
    },
    {
      "key": "niveles_picante_mexicana",
      "nombre": "Nivel de picante",
      "items": [
        {"label": "Sin picante", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Suave", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Medio", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Picante", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Muy picante", "precio_extra": 0, "certeza": "Suposición"}
      ]
    },
    {
      "key": "tortillas_taco_mexicana",
      "nombre": "Tortilla del taco",
      "items": [
        {"label": "Maíz", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Harina de trigo", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Lechuga (sin tortilla)", "precio_extra": 0, "certeza": "Probable"}
      ]
    },
    {
      "key": "base_bowl_mexicana",
      "nombre": "Base del bowl",
      "items": [
        {"label": "Arroz blanco", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Arroz con cilantro y limón", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Lechuga", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Mitad arroz, mitad lechuga", "precio_extra": 0, "certeza": "Suposición"}
      ]
    },
    {
      "key": "frijoles_mexicana",
      "nombre": "Frijoles",
      "items": [
        {"label": "Frijoles charros", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Frijoles negros", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Frijoles pintos", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Sin frijoles", "precio_extra": 0, "certeza": "Suposición"}
      ]
    },
    {
      "key": "ingredientes_burrito_mexicana",
      "nombre": "Ingredientes del burrito o bowl",
      "items": [
        {"label": "Arroz", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Vegetales salteados", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Maíz dulce", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Cebolla salteada", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Lechuga", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Queso rallado", "precio_extra": 0, "certeza": "Suposición"}
      ]
    },
    {
      "key": "extras_taco_mexicana",
      "nombre": "Extras para tacos",
      "items": [
        {"label": "Costra de queso", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Guacamole", "precio_extra": 0, "certeza": "Seguro"},
        {"label": "Piña", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Cebolla y cilantro extra", "precio_extra": 0, "certeza": "Suposición"}
      ]
    },
    {
      "key": "extras_plato_mexicana",
      "nombre": "Extras para platos",
      "items": [
        {"label": "Guacamole", "precio_extra": 0, "certeza": "Seguro"},
        {"label": "Queso extra", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Crema agria", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Jalapeños", "precio_extra": 0, "certeza": "Probable"}
      ]
    },
    {
      "key": "bebida_combo_mexicana",
      "nombre": "Bebida del combo",
      "items": [
        {"label": "Agua de jamaica", "precio_extra": 0, "certeza": "Seguro"},
        {"label": "Agua de horchata", "precio_extra": 0, "certeza": "Seguro"},
        {"label": "Agua de tamarindo", "precio_extra": 0, "certeza": "Seguro"},
        {"label": "Gaseosa", "precio_extra": 0, "certeza": "Probable"}
      ]
    },
    {
      "key": "sabores_agua_fresca_mexicana",
      "nombre": "Sabores de agua fresca",
      "items": [
        {"label": "Horchata", "precio_extra": 0, "certeza": "Seguro"},
        {"label": "Jamaica", "precio_extra": 0, "certeza": "Seguro"},
        {"label": "Tamarindo", "precio_extra": 0, "certeza": "Seguro"},
        {"label": "Guayaba", "precio_extra": 0, "certeza": "Probable"}
      ]
    },
    {
      "key": "sabores_margarita_mexicana",
      "nombre": "Sabores de margarita",
      "items": [
        {"label": "Clásica", "precio_extra": 0, "certeza": "Seguro"},
        {"label": "Tamarindo", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Mango", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Maracuyá", "precio_extra": 0, "certeza": "Suposición"}
      ]
    },
    {
      "key": "borde_copa_mexicana",
      "nombre": "Borde de la copa",
      "items": [
        {"label": "Sal", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Chile con sal", "precio_extra": 0, "certeza": "Probable"},
        {"label": "Sin borde", "precio_extra": 0, "certeza": "Suposición"}
      ]
    },
    {
      "key": "salsa_churros_mexicana",
      "nombre": "Salsa para los churros",
      "items": [
        {"label": "Chocolate", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Arequipe", "precio_extra": 0, "certeza": "Suposición"},
        {"label": "Cajeta", "precio_extra": 0, "certeza": "Suposición"}
      ]
    }
  ],
  "grupos_tipicos": [
    {"id": "g_proteina", "nombre": "Proteína", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "proteinas_mexicana"}},
    {"id": "g_proteina_nachos", "nombre": "Proteína para los nachos (opcional)", "modo": "single", "min": 0, "max": 1, "requerido": false, "fuente": {"lista": "proteinas_mexicana"}},
    {"id": "g_proteina_fajitas", "nombre": "Proteína de las fajitas", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "proteinas_fajitas_mexicana"}},
    {"id": "g_relleno_quesadilla", "nombre": "Relleno de la quesadilla", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "rellenos_quesadilla_mexicana"}},
    {"id": "g_relleno_enchilada", "nombre": "Relleno de las enchiladas", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "rellenos_enchilada_mexicana"}},
    {"id": "g_salsa_enchilada", "nombre": "Salsa de las enchiladas", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "salsas_enchilada_mexicana"}},
    {"id": "g_salsas", "nombre": "Salsas", "modo": "multi", "min": 0, "max": 3, "requerido": false, "fuente": {"lista": "salsas_mexicana"}},
    {"id": "g_picante", "nombre": "Nivel de picante", "modo": "single", "min": 0, "max": 1, "requerido": false, "fuente": {"lista": "niveles_picante_mexicana"}},
    {"id": "g_tortilla_taco", "nombre": "Tortilla del taco", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "tortillas_taco_mexicana"}},
    {"id": "g_tortilla_harina_maiz", "nombre": "Tortilla (maíz o harina)", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"items": [{"label": "Maíz", "precio_extra": 0}, {"label": "Harina de trigo", "precio_extra": 0}]}},
    {"id": "g_cantidad_orden", "nombre": "Cantidad en la orden", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"items": [{"label": "3 unidades", "precio_extra": 0}, {"label": "5 unidades", "precio_extra": 0}, {"label": "8 unidades", "precio_extra": 0}]}},
    {"id": "g_base_bowl", "nombre": "Base del bowl", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "base_bowl_mexicana"}},
    {"id": "g_frijoles", "nombre": "Frijoles", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "frijoles_mexicana"}},
    {"id": "g_ingredientes_burrito", "nombre": "Ingredientes del burrito o bowl", "modo": "multi", "min": 0, "max": 4, "requerido": false, "fuente": {"lista": "ingredientes_burrito_mexicana"}},
    {"id": "g_extras_taco", "nombre": "Extras para tacos", "modo": "multi", "min": 0, "max": 3, "requerido": false, "fuente": {"lista": "extras_taco_mexicana"}},
    {"id": "g_extras_plato", "nombre": "Extras del plato", "modo": "multi", "min": 0, "max": 3, "requerido": false, "fuente": {"lista": "extras_plato_mexicana"}},
    {"id": "g_bebida_combo", "nombre": "Bebida del combo", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "bebida_combo_mexicana"}},
    {"id": "g_sabor_agua_fresca", "nombre": "Sabor del agua fresca", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "sabores_agua_fresca_mexicana"}},
    {"id": "g_tamano_bebida", "nombre": "Tamaño de la bebida", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"items": [{"label": "Pequeño", "precio_extra": 0}, {"label": "Mediano", "precio_extra": 0}, {"label": "Grande", "precio_extra": 0}]}},
    {"id": "g_base_destilado", "nombre": "Base del licor", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"items": [{"label": "Tequila", "precio_extra": 0}, {"label": "Mezcal", "precio_extra": 0}]}},
    {"id": "g_sabor_margarita", "nombre": "Sabor de la margarita", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "sabores_margarita_mexicana"}},
    {"id": "g_borde_copa", "nombre": "Borde de la copa", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "borde_copa_mexicana"}},
    {"id": "g_salsa_churros", "nombre": "Salsa para los churros", "modo": "single", "min": 0, "max": 1, "requerido": false, "fuente": {"lista": "salsa_churros_mexicana"}}
  ],
  "platos_ejemplo": [
    {"nombre": "Tacos de la casa", "categoria": "tacos", "precio": 0, "grupos": ["g_proteina", "g_tortilla_taco", "g_salsas", "g_picante", "g_extras_taco"]},
    {"nombre": "Orden de tacos de birria con consomé", "categoria": "tacos", "precio": 0, "grupos": ["g_cantidad_orden", "g_picante", "g_extras_taco"]},
    {"nombre": "Burrito", "categoria": "burritos_bowls", "precio": 0, "grupos": ["g_proteina", "g_frijoles", "g_ingredientes_burrito", "g_salsas", "g_picante", "g_extras_plato"]},
    {"nombre": "Bowl mexicano", "categoria": "burritos_bowls", "precio": 0, "grupos": ["g_proteina", "g_base_bowl", "g_frijoles", "g_ingredientes_burrito", "g_salsas", "g_picante", "g_extras_plato"]},
    {"nombre": "Quesadilla", "categoria": "quesadillas", "precio": 0, "grupos": ["g_relleno_quesadilla", "g_tortilla_harina_maiz", "g_salsas", "g_picante", "g_extras_plato"]},
    {"nombre": "Nachos con queso", "categoria": "nachos", "precio": 0, "grupos": ["g_proteina_nachos", "g_salsas", "g_picante", "g_extras_plato"]},
    {"nombre": "Flautas", "categoria": "antojitos", "precio": 0, "grupos": ["g_cantidad_orden", "g_salsas", "g_picante", "g_extras_plato"]},
    {"nombre": "Fajitas", "categoria": "fajitas_enchiladas", "precio": 0, "grupos": ["g_proteina_fajitas", "g_tortilla_harina_maiz", "g_picante", "g_extras_plato"]},
    {"nombre": "Enchiladas", "categoria": "fajitas_enchiladas", "precio": 0, "grupos": ["g_relleno_enchilada", "g_salsa_enchilada", "g_picante", "g_extras_plato"]},
    {"nombre": "Combo taquero", "categoria": "para_compartir", "precio": 0, "grupos": ["g_proteina", "g_tortilla_taco", "g_bebida_combo", "g_salsas", "g_picante"]},
    {"nombre": "Agua fresca", "categoria": "bebidas", "precio": 0, "grupos": ["g_sabor_agua_fresca", "g_tamano_bebida"]},
    {"nombre": "Margarita", "categoria": "cocteles", "precio": 0, "grupos": ["g_sabor_margarita", "g_base_destilado", "g_borde_copa"]},
    {"nombre": "Cantarito", "categoria": "cocteles", "precio": 0, "grupos": ["g_tamano_bebida"]},
    {"nombre": "Churros", "categoria": "postres", "precio": 0, "grupos": ["g_salsa_churros"]}
  ]
}
```

---

## FUENTES

Negocios colombianos (lo marcado "resumen" no se leyó completo; ver aviso de método).

| Elemento | URL consultada | Certeza |
|---|---|---|
| El Mexican (Bogotá): tacos, burritos, quesadillas, nachos, guacamole, todo lo que pueda comer; precios por categoría (no usados) | https://www.elmexican.co | Seguro (leída la home) |
| El Mexican: reglas del all you can eat (2 h, no se comparte ni se lleva) | https://www.elespectador.com/gastronomia-y-recetas/una-deliciosa-propuesta-de-comida-mexicana-conquista-en-el-centro-de-bogota/ | Seguro (artículo) |
| Wajaca (Medellín): categorías (burritos, fajitas y quesadillas, tacos al molcajete con carne de la casa, cochinita y birria), tortilla de trigo, guacamole, crema agria, combos con gaseosa y para compartir, tazón | https://wajaca.co | Seguro (página leída; la parte de personalización por tortilla/salsa/picante no aparece: Suposición) |
| Wajaca: 8 tipos de taco por orden de 3, fajitas, burritos de 10 tipos, chimichangas (reseña 2021, resumen) | https://medellinguru.com/wajaca-medellin/ | Probable (resumen de búsqueda, página bloqueada) |
| Taquería Mercado México (Bogotá): flautas, nachos con guacamole y jalapeños, tacos, aguas (horchata, tamarindo, jamaica), michelada, azulito; all you can eat jueves y viernes | https://www.las2orillas.co/?p=892244 | Seguro (artículo leído) |
| Taquería Popular (Bogotá): birria, pastor, asada, chicharrón, pollo, costra de queso, bandejas de tacos con caldo, cantaritos en S/M/L/XL, margaritas, aguas | https://www.las2orillas.co/?p=899923 | Seguro (artículo leído) |
| El Pastor del Siete (Bogotá): tacos de carne, vegetarianos, quesadillas, tortas, birria, suadero, esquites, tequila y mezcal | https://www.pulzo.com/nacion/bogota/restaurante-el-pastor-siete-bogota-donde-queda-precios-e-historia-PP3366207A | Probable (artículo leído, carta corta) |
| El Pastor del Siete: carta de tacos, quesadillas, tortas, tequila y mezcal | https://www.larepublica.co/comida-mexicana | Probable (página leída) |
| El Tizoncito (Bogotá): pastor, bistec, chorizo, nopales, hongos, tacos "con tortilla de lechuga", quesadillas, frijoles charros, totopos, guacamole, aguas de jamaica/horchata/guayaba, coctel con mezcal | https://www.larepublica.co/ocio/el-tizoncito-los-creadores-del-tradicional-taco-al-pastor-abrio-sus-puertas-en-bogota-4284283 | Seguro (artículo leído) |
| D Toluca (Cali): nachos, tacos estilo Toluca al pastor, minitaquitos, coctel mariachi, tequilas | https://carta.menu/restaurants/cali/d-toluca/menu | Probable (solo resumen de búsqueda; página 403) |
| Zacatecas (Medellín): fajitas, enchiladas en tres variedades | https://medellinguru.com/zacatecas/ | Probable (resumen de búsqueda; página bloqueada) |
| Agua Fresca (Medellín): enchiladas, flautas, tacos, tostadas, margaritas con mezcal, tequilas y mezcales | https://medellinguru.com/?p=19549 | Probable (resumen de búsqueda) |
| Mi Pico E Gallo (Medellín): tacos por orden de 5, quesadillas, burritos grandes, nachos, flautas | https://medellinguru.com/2021/01 | Probable (resumen de búsqueda de 2021; no verificado en carta) |
| Gringo Cantina 140 (Bogotá): estilo Tex-Mex, tacos, nachos, enchiladas, cocteles | https://wanderlog.com/place/details/4007168/gringo-cantina-140 | Probable (página leída, sin carta detallada) |
| The Master Taquería, Gallo Colorado, Idilio, Punto Baja, Rancho MX (listados de comida mexicana en Colombia) | https://www.larepublica.co/comida-mexicana | Suposición (solo nombres, sin carta) |
| Burrito Fest (Bogotá y Cali): burritos hasta con tres proteínas | https://www.portafolio.co/tendencias/sociales/burrito-fest-cuando-se-llevara-a-cabo-y-que-precios-tendra-613784 | Probable (artículo leído; solo evento, no carta) |

Referencia internacional.

| Elemento | URL consultada | Certeza |
|---|---|---|
| Tacombi (EE. UU.): categorías Entradas, Tacos, Quesadillas, Burritas, Platos con arroz y frijoles, Kids, Packages, bebidas; tortilla de maíz vs harina; salsas en porción; sin nivel de picante | https://tacombi.com/menu | Probable |
| Burrito Republic (Costa Rica): burritos, tacos, bowls y nachos con proteína a elección | https://observador.cr/burrito-republic-platos-de-la-cocina-tex-mex-que-puede-armar-a-su-gusto/ | Probable (resumen de búsqueda) |
| Wahaca (Reino Unido): menú completo en PDF | https://www.wahaca.co.uk/full-menu | Suposición (PDF ilegible, no aprovechado) |
| Chipotle / Qdoba (EE. UU.): flujo de armado por pasos | https://www.chipotle.com/order/build-your-own , https://www.qdoba.com/menu | Suposición (páginas sin contenido útil o 403; el flujo de armado es conocimiento propio) |

Competidores (configuración de modificadores).

| Elemento | URL consultada | Certeza |
|---|---|---|
| Toast: grupos obligatorios/opcionales; mínimo solo en obligatorios; máximo y selección múltiple | https://support.toasttab.com/en/article/Required-Optional-Modifiers | Probable (resumen de búsqueda) |
| Square: límites de modificadores por producto | https://squareup.com/help/us/es/article/5119-create-and-manage-item-modifiers | Probable (resumen de búsqueda) |
| Wix Restaurants: grupo reutilizable, min/max, cargo extra | https://support.wix.com/es/article/wix-restaurants-understanding-modifiers | Probable (resumen de búsqueda) |
| Loggro, Siigo POS, Fudo, Lightspeed | (sin documentación pública encontrada) | Suposición |

Certeza de los grupos con `fuente.items` en línea (sin campo `certeza`): tortilla maíz/harina = Probable (Wajaca trigo, Tacombi); cantidad 3 y 5 = Probable (Wajaca 3, Mi Pico 5); 8 unidades = Suposición; tamaño Pequeño/Mediano/Grande = Probable (Taquería Popular usa S/M/L/XL en cantaritos); tequila o mezcal = Probable (Tizoncito, Agua Fresca, Pastor del Siete).

---

## Dudas para un dueño real

1. **¿Qué se cobra aparte y qué va incluido?** Guacamole, queso extra, costra de queso, segunda proteína y consomé: todo está en `precio_extra: 0` porque no vi precios de adicionales en ninguna carta colombiana. Un dueño debe decir si cobra extras y cuáles, y si la proteína doble o la tortilla de harina suben el precio.
2. **¿El cliente elige las salsas y el picante, o ya vienen con el plato?** En las cartas colombianas que leí no aparece una elección de nivel de picante ni de salsa por taco; suele resolverse con salsas de mesa o con la receta fija. Si el dueño no lo ofrece, conviene quitar `g_salsas` y `g_picante` o dejarlos como nota libre.
3. **¿La proteína es fija por plato o se elige?** En taquería la carta dice "tacos de birria" o "tacos al pastor" (producto fijo); en burrito/bowl se elige. Esto cambia si el dueño crea un producto por especialidad o uno solo con el grupo Proteína.
4. **¿Cómo vende la orden?** Unidad (taco suelto) frente a orden de 3, 5 u 8 y bandeja. Las cartas mezclan ambas. El grupo "Cantidad en la orden" es una Suposición.
5. **¿Hay promociones por tiempo ("todo lo que pueda comer", 3x2 los martes) y el POS las debe manejar?** Dos negocios colombianos las usan, pero son reglas comerciales fuera de la plantilla.
6. **Bar:** ¿el dueño vende cocteles por copa, jarra o tamaño (S/M/L/XL), y mezcal/tequila por botella? El formato de bebida de bar no está resuelto.
7. **Cierres de lista:** ¿"Sin frijoles", "Sin picante" y "Sin borde" deben ser una opción visible o basta con no elegir? Cambia si el grupo es obligatorio.
