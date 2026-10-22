# Plantilla: comida árabe (key: comida_arabe)

> Nota de método (leer primero): hubo búsqueda web y WebFetch, pero WebFetch devuelve resúmenes generados por un modelo, no la carta cruda. En ningún caso se leyó una carta completa con precios de un negocio colombiano; la información de Colombia sale de resúmenes de búsqueda, fichas de Wanderlog/HappyCow/Spinach y notas de prensa (La República, El Tiempo). Por eso la certeza es conservadora: "Seguro" solo se usó cuando el elemento aparece en 2 o más negocios colombianos distintos según esos resúmenes (no es lo mismo que haber visto 2 cartas completas). Loggro, Siigo POS, Fudo, Square y Lightspeed no mostraron documentación pública utilizable para este tipo de negocio; solo se pudo leer la ayuda de Toast (y menciones de Odoo y Sapaad). Esa parte de competidores es Probable/Suposición. Solo se extrajo estructura (nombres de categorías y opciones), sin copiar textos ni fotos. Todos los precios están en 0.

Contexto: Barranquilla concentra la mayor cantidad de restaurantes árabes del país (El Tiempo), y hay presencia fuerte en Bogotá (Chapinero, Zona T, La Candelaria), Cartagena y Medellín.

---

## PARTE A — Estudio de carta por subtipo

### A1. Shawarma / kebab de mostrador y delivery

| Aspecto | Cómo funciona |
|---|---|
| Orden típico de la carta | Shawarmas (pollo, res, mixto, cordero) > Falafel y vegetarianos > Platos (shawarma en plato) > Combos/menús > Adicionales (pan, salsas, papas) > Bebidas |
| Qué elige el cliente | Formato (rollo en pan árabe, pita rellena o plato), proteína, tamaño (mini / regular / extra), salsas (ajo, tahini, picante), vegetales a poner o quitar (encurtidos, tomate, cebolla, lechuga), nivel de picante, acompañante (papas, tabule, falafel) |
| Combos | "Menú": shawarma + acompañante + bebida (en la referencia de Madrid el acompañante es falafel, tabule o papas). Descuento implícito frente a pedir por separado |
| Qué lo diferencia | Mucha personalización por producto, pocas categorías, alta rotación; el pan y la salsa extra se cobran como adicional; domicilio y empaque son clave |
| Evidencia | Nimis (Bogotá): pita, tahini aparte, salsa picante, el cliente escoge rellenos. El Khalifa (Bogotá): plato árabe vegetariano con falafel y hummus. Referencia: Madrid (mini shawarma, ajo/tahini extra, menú con bebida) y Alemania (plato / sándwich / menú / extra) |

### A2. Restaurante árabe-libanés de mesa (entradas para compartir y parrilladas)

| Aspecto | Cómo funciona |
|---|---|
| Orden típico de la carta | Entradas frías (hummus, baba ganoush, tabule, ensalada árabe, labneh) > Entradas calientes (kibbe, hojas de parra, falafel) > Platos fuertes (kafta, brochetas, cordero, arroz con almendras) > Parrilladas > Postres > Bebidas |
| Qué elige el cliente | Casi no hay modificadores: elige el plato y el acompañante (arroz con almendras, papas, ensalada, tabule), a veces proteína de la brocheta y picante. En parrillada: tamaño (para 2, 4 o más) y carnes |
| Combos / mezze | El mezze o trío de hummus se vende como tabla para compartir: el cliente arma 3 o 4 entradas de una lista. Los "platos mixtos" y "platos árabes" funcionan como paquetes de varios productos |
| Qué lo diferencia | Servicio de mesa, carta más larga (El Árabe en Chapinero hablaba de decenas de platos fuertes y entradas), ticket alto, bebidas y postres, pan árabe que acompaña siempre; se separa por cuenta y por mesa |
| Evidencia | El Libanés (Bogotá): mezze, shawarma mixto, cordero, brocheta con salsa picante. Árabe Gourmet y Sarab (Barranquilla): kibbe, tabule, crema de garbanzo con tahini, kafta al carbón, arroz con almendras, parrilladas. Zahle (Barranquilla): hojas de parra, hummus, falafel, kebabs, pan pita con pasta de ajo. El Cairo (Medellín): pinchos de pollo, arroz con almendras, baba ganoush. Az-Zahr (Cartagena): hummus, falafel, tabule |

### A3. Restaurante árabe con buffet o menú del día

| Aspecto | Cómo funciona |
|---|---|
| Orden típico | Menú del día (entrada + plato + bebida) o buffet por persona, con una lista corta de mezze, un plato fuerte de la casa y un postre. No se encontró evidencia de cartas colombianas de este formato; lo que sigue es Suposición |
| Qué elige el cliente | Una opción de plato fuerte entre 2 o 3 (pollo, res o cordero), acompañante del día, bebida |
| Combos | El menú entero es el combo: precio único por persona |
| Qué lo diferencia | Cambia por día, el inventario y la producción se planifican por tandas (arroz, kibbe, hummus), precio fijo; en RestaurantOS se parece más a la plantilla de almuerzos que a la carta |

### A4. Pastelería árabe

| Aspecto | Cómo funciona |
|---|---|
| Orden típico | Dulces por unidad o por caja (baklava, maamoul, basbousa, knafe) > Cajas surtidas / regalo > Café árabe y té > Salados pequeños (sfiha, fatayer) si los hay |
| Qué elige el cliente | Variedad de dulce, cantidad o tamaño de caja (por peso o por unidades), relleno (nueces, pistacho, dátil) |
| Combos | Cajas surtidas por tamaño y bandejas para eventos; temporada alta en fiestas |
| Qué lo diferencia | Venta por peso o caja, pedidos por encargo y fechas de entrega. En la búsqueda no apareció ninguna pastelería árabe colombiana con carta pública (solo una chilena), por eso todo este subtipo es Suposición |

### Qué cambia entre subtipos (resumen)

| Subtipo | Personalización | Ticket | Combo típico | Plantilla que cubre |
|---|---|---|---|---|
| Shawarma mostrador / delivery | Alta | Bajo | Shawarma + acompañante + bebida | Sí (platos 1 a 4, 12) |
| Mesa árabe-libanés | Baja | Alto | Mezze y parrillada | Sí (platos 5 a 11) |
| Buffet / menú del día | Muy baja | Medio | Menú completo | Parcial (usar plantilla almuerzos) |
| Pastelería árabe | Media (cajas) | Medio | Caja surtida | Parcial (plato 13; usar panadería/repostería) |

---

## PARTE B — Borrador de plantilla (JSON)

```json
{
  "key": "comida_arabe",
  "nombre": "Comida árabe",
  "descripcion": "Shawarma, falafel, kafta y brochetas, entradas para compartir (hummus, tabule, kibbe), parrilladas y postres árabes. Formato, proteína, salsas, tamaño y mezze a elegir.",
  "categorias": [
    {"value": "shawarmas", "label": "Shawarmas", "emoji": "🥙"},
    {"value": "falafel_vegetarianos", "label": "Falafel y vegetarianos", "emoji": "🧆"},
    {"value": "entradas_frias", "label": "Entradas frías", "emoji": "🥗"},
    {"value": "entradas_calientes", "label": "Entradas calientes", "emoji": "🍢"},
    {"value": "platos_fuertes", "label": "Platos fuertes", "emoji": "🍛"},
    {"value": "parrillada_arabe", "label": "Parrilladas árabes", "emoji": "🔥"},
    {"value": "mezze_y_combos", "label": "Mezze y combos", "emoji": "🍽️"},
    {"value": "postres_arabes", "label": "Postres árabes", "emoji": "🍯"},
    {"value": "bebidas", "label": "Bebidas", "emoji": "🥤"}
  ],
  "listas": [
    {"key": "formatos_arabe", "nombre": "Formato del plato", "items": [
      {"label": "Rollo en pan árabe", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Pita rellena", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Plato con ensalada y pan", "precio_extra": 0, "certeza": "Seguro"}
    ]},
    {"key": "proteinas_arabe", "nombre": "Proteínas", "items": [
      {"label": "Pollo", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Res", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Cordero", "precio_extra": 0, "certeza": "Seguro"}
    ]},
    {"key": "salsas_arabe", "nombre": "Salsas", "items": [
      {"label": "Salsa de ajo", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Tahini", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Salsa picante de la casa", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Hummus", "precio_extra": 0, "certeza": "Probable"}
    ]},
    {"key": "vegetales_arabe", "nombre": "Vegetales del relleno", "items": [
      {"label": "Encurtidos", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Tomate", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Cebolla", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Lechuga", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Tabule", "precio_extra": 0, "certeza": "Probable"}
    ]},
    {"key": "picante_arabe", "nombre": "Nivel de picante", "items": [
      {"label": "Sin picante", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Suave", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Picante", "precio_extra": 0, "certeza": "Probable"}
    ]},
    {"key": "tamanos_arabe", "nombre": "Tamaño del shawarma", "items": [
      {"label": "Mini", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Regular", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Extra", "precio_extra": 0, "certeza": "Probable"}
    ]},
    {"key": "acompanantes_arabe", "nombre": "Acompañantes", "items": [
      {"label": "Papas fritas", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Arroz con almendras", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Tabule", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Ensalada árabe", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Falafel (3 unidades)", "precio_extra": 0, "certeza": "Probable"}
    ]},
    {"key": "bebidas_arabe", "nombre": "Bebidas del combo", "items": [
      {"label": "Gaseosa", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Limonada con hierbabuena", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Jugo natural", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Agua", "precio_extra": 0, "certeza": "Suposición"}
    ]},
    {"key": "mezze_arabe", "nombre": "Entradas para el mezze", "items": [
      {"label": "Hummus", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Baba ganoush", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Tabule", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Kibbe frito", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Hojas de parra rellenas", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Falafel", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Labneh", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Ensalada árabe", "precio_extra": 0, "certeza": "Probable"}
    ]},
    {"key": "tamanos_parrillada_arabe", "nombre": "Tamaño de la parrillada", "items": [
      {"label": "Para 2 personas", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Para 4 personas", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Para 6 personas", "precio_extra": 0, "certeza": "Suposición"}
    ]},
    {"key": "dulces_arabe", "nombre": "Dulces árabes", "items": [
      {"label": "Baklava", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Maamoul", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Basbousa", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Knafe", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Helado casero", "precio_extra": 0, "certeza": "Probable"}
    ]}
  ],
  "grupos_tipicos": [
    {"id": "g_formato", "nombre": "Formato", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "formatos_arabe"}},
    {"id": "g_proteina", "nombre": "Proteína a elegir", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "proteinas_arabe"}},
    {"id": "g_tamano_shawarma", "nombre": "Tamaño", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "tamanos_arabe"}},
    {"id": "g_salsas", "nombre": "Salsas", "modo": "multi", "min": 0, "max": 2, "requerido": false, "fuente": {"lista": "salsas_arabe"}},
    {"id": "g_vegetales", "nombre": "Vegetales", "modo": "multi", "min": 0, "max": 5, "requerido": false, "fuente": {"lista": "vegetales_arabe"}},
    {"id": "g_picante", "nombre": "Picante", "modo": "single", "min": 0, "max": 1, "requerido": false, "fuente": {"lista": "picante_arabe"}},
    {"id": "g_acompanante", "nombre": "Acompañante", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "acompanantes_arabe"}},
    {"id": "g_bebida_combo", "nombre": "Bebida del combo", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "bebidas_arabe"}},
    {"id": "g_mezze", "nombre": "Arma tu mezze", "modo": "multi", "min": 3, "max": 4, "requerido": true, "fuente": {"lista": "mezze_arabe"}},
    {"id": "g_carnes_parrillada", "nombre": "Carnes de la parrillada", "modo": "multi", "min": 1, "max": 3, "requerido": true, "fuente": {"lista": "proteinas_arabe"}},
    {"id": "g_tamano_parrillada", "nombre": "Tamaño de la parrillada", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "tamanos_parrillada_arabe"}},
    {"id": "g_dulces", "nombre": "Dulces del surtido", "modo": "multi", "min": 2, "max": 4, "requerido": true, "fuente": {"lista": "dulces_arabe"}}
  ],
  "platos_ejemplo": [
    {"nombre": "Shawarma a elegir", "categoria": "shawarmas", "precio": 0, "grupos": ["g_formato", "g_proteina", "g_tamano_shawarma", "g_salsas", "g_vegetales", "g_picante"]},
    {"nombre": "Shawarma mixto", "categoria": "shawarmas", "precio": 0, "grupos": ["g_formato", "g_tamano_shawarma", "g_salsas", "g_vegetales", "g_picante"]},
    {"nombre": "Shawarma de falafel", "categoria": "falafel_vegetarianos", "precio": 0, "grupos": ["g_formato", "g_tamano_shawarma", "g_salsas", "g_vegetales", "g_picante"]},
    {"nombre": "Plato de falafel", "categoria": "falafel_vegetarianos", "precio": 0, "grupos": ["g_salsas", "g_acompanante"]},
    {"nombre": "Hummus con pan", "categoria": "entradas_frias", "precio": 0, "grupos": []},
    {"nombre": "Tabule", "categoria": "entradas_frias", "precio": 0, "grupos": []},
    {"nombre": "Kibbe frito", "categoria": "entradas_calientes", "precio": 0, "grupos": []},
    {"nombre": "Plato de kafta", "categoria": "platos_fuertes", "precio": 0, "grupos": ["g_acompanante", "g_salsas", "g_picante"]},
    {"nombre": "Brocheta a la parrilla", "categoria": "platos_fuertes", "precio": 0, "grupos": ["g_proteina", "g_acompanante", "g_salsas", "g_picante"]},
    {"nombre": "Parrillada árabe", "categoria": "parrillada_arabe", "precio": 0, "grupos": ["g_tamano_parrillada", "g_carnes_parrillada", "g_acompanante", "g_salsas"]},
    {"nombre": "Mezze para compartir", "categoria": "mezze_y_combos", "precio": 0, "grupos": ["g_mezze"]},
    {"nombre": "Combo shawarma", "categoria": "mezze_y_combos", "precio": 0, "grupos": ["g_formato", "g_proteina", "g_salsas", "g_acompanante", "g_bebida_combo"]},
    {"nombre": "Surtido de dulces árabes", "categoria": "postres_arabes", "precio": 0, "grupos": ["g_dulces"]},
    {"nombre": "Limonada con hierbabuena", "categoria": "bebidas", "precio": 0, "grupos": []}
  ]
}
```

Notas de diseño
- Los grupos requeridos tienen min>=1; los opcionales tienen min 0. Todos con min<=max. Ningún grupo requerido tiene una sola opción.
- `proteinas_arabe` alimenta dos grupos (proteína única para shawarma/brocheta, y carnes múltiples para la parrillada). El "mixto" no es una opción de la lista: es un plato propio (shawarma mixto), porque en multi no tendría sentido.
- Cerdo queda fuera a propósito: aunque una carta de Barranquilla reseña parrilladas con cerdo, la cocina árabe tradicional (y la oferta halal de Medellín) no lo usa. El dueño puede agregarlo.
- Falta a propósito: pastelería árabe por peso/caja y menú del día; encajan mejor en las plantillas de repostería y almuerzos.

---

## FUENTES

Certeza de la fila = qué tanto respalda ese elemento, con la definición única (Seguro = 2+ negocios colombianos distintos; Probable = 1 colombiano o varios de referencia internacional; Suposición = sin fuente). Todas las lecturas fueron resúmenes de búsqueda o de WebFetch, no cartas completas.

### Negocios colombianos

| Elemento | URL consultada | Certeza |
|---|---|---|
| Nimis (Bogotá): pita, falafel, tahini aparte, salsa picante, elegir rellenos, encurtidos, papas y ensaladas | https://www.happycow.net/reviews/nimis-bogota-216501 | Probable |
| El Khalifa Shawarma (La Candelaria, Bogotá): plato árabe vegetariano, falafel, hummus, papas, domicilio | https://spinach.guide/venues/el-khalifa-shawarma-la-candelaria-212079/ | Probable |
| El Libanés (Zona T, Bogotá): mezze (baba ganoush, hummus, labneh), shawarma mixto, cordero y pollo, brocheta con salsa picante, papas, pan a la parrilla | https://wanderlog.com/place/details/10137906/el-libanés | Probable |
| El Árabe / M Cocina Árabe (Chapinero, Bogotá, nota de 2016): shawarma de pollo o lomo con pan árabe, tabule y tahine, kafta, plato mixto, arroz de almendras, kibbeh, hojas de parra, número de platos | https://www.larepublica.co/ocio/la-gastronomia-arabe-tiene-un-lugar-asegurado-en-chapinero-2404471 | Probable |
| Sarab (Barranquilla): kibbe, tabule, crema de garbanzo con tahini, ensalada árabe, arroz con almendras, fatteh, helado casero | https://wanderlog.com/place/details/2828913/restaurantes-árabes-en-barranquilla-sarab | Probable |
| Árabe Gourmet (Barranquilla): hummus, baba ganoush, falafel, shawarma de res y cordero, kafta al carbón, kebab mixto, arroz con almendras, parrilladas | https://wanderlog.com/place/details/876626/arabe-gourmet | Probable |
| Zahle (Barranquilla): hojas de parra, hummus, falafel, kebabs, plato mixto, pollo a la parrilla, pan pita con pasta de ajo (solo en el resumen de búsqueda) | https://wanderlog.com/place/details/2828913 (resultado de búsqueda "restaurante árabe Barranquilla") | Suposición |
| Ariche (sin ciudad confirmada): sfiha, kibbe, tabule, hummus, pan pita (solo en el resumen de búsqueda) | resultado de búsqueda "restaurante árabe Barranquilla" | Suposición |
| Az-Zahr (Cartagena): hummus, falafel, tabule | https://cartagenacolombiarentals.com/2016/01/az-zahr-restaurant/ | Suposición |
| El Cairo Cocina Árabe (Medellín): pinchos de pollo, arroz con almendras, baba ganoush, oferta halal (solo en el resumen de búsqueda) | resultado de búsqueda "restaurante libanés Cartagena Bogotá Medellín" | Suposición |
| Tata Abisaad Janna (Medellín): mini shawarmas, trío de hummus, tabulé, kibbeh, salsa picante de la casa (solo en el resumen de búsqueda) | https://wanderlog.com/place/details/4057253/shawarma-tata-abisaad-janna | Suposición |
| Mr Shawarma Fast Food (Barranquilla): solo se confirmó que existe (directorio de empresas), sin carta | https://directorio-empresas.einforma.co/informacion-empresa/mr-shawarma-fast-food-sas | Suposición |
| Barranquilla como ciudad con más restaurantes árabes | https://www.eltiempo.com/cultura/gastronomia/top-5-de-nuestra-comida-sabores-arabes-que-se-volvieron-costenos-591742 (solo título y resumen de búsqueda) | Suposición |

### Referencia internacional

| Elemento | URL consultada | Certeza |
|---|---|---|
| El Libanés Shawarma (Madrid, Glovo): categorías (para compartir, shawarmas, platos, extras), mini shawarma, proteína pollo/ternera/mixto, pan árabe y salsas ajo/tahini como extra, menú con acompañante y bebida | https://glovoapp.com/hr/es/madrid/stores/el-libanes-shawarma-madrid | Probable |
| Sabores de Líbano (Ciudad de México, Rappi): categorías (botanas frías y calientes, platos fuertes, alambres), platos en versión grande o chica, venta por piezas | https://www.rappi.com.mx/restaurantes/1930195638-sabores-de-libano | Probable |
| Hekaya Shamyah (Oberhausen, Alemania): shawarma, menú, falafel, entradas, salsas; pan árabe o baguette, ajo/tahini, plato / sándwich / menú / extra, picante, papas o arroz | https://www.speisekarte.de/oberhausen-rheinland/restaurant/mtm_hkayt_shamyt_hekaya_shamyah_restaurant/speisekarte | Probable |
| Mezcla de cartas con precios sin país confirmado (Scribd; no se usó) | https://es.scribd.com/document/1026259391/Menu | Suposición |

### Competidores (cómo configuran modificadores)

| Elemento | URL consultada | Certeza |
|---|---|---|
| Toast: grupos de modificadores obligatorios u opcionales, selección única o múltiple con máximo, precio por grupo o por opción, reutilizables en varios platos | https://intercom.help/toast-central/en/articles/14725450-create-and-manage-modifier-groups-and-modifier-options | Probable |
| Odoo POS (módulo de modificadores reutilizables) | https://apps.odoo.com/apps/modules/17.0/eg_pos_product_modifiers | Suposición |
| Sapaad (ayuda sobre modificadores con precio adicional) | https://www-dr.sapaad.com/?p=44991 | Suposición |
| Loggro, Siigo POS, Fudo, Square, Lightspeed | No se encontró documentación pública utilizable | Suposición |

---

## Dudas para un dueño real

1. En su restaurante, ¿el shawarma se vende por tamaño (mini, regular, extra) o por formato (rollo, pita, plato)? ¿Y el precio cambia por proteína (cordero y res más caro que pollo)? Hoy la plantilla pone todo en precio_extra 0 y no sabemos si el cobro va en el producto o en cada opción.
2. ¿El mezze se vende como tabla de precio fijo con 3 o 4 entradas a elegir, o cada entrada se cobra por separado? Esto define si g_mezze (min 3, max 4) es correcto.
3. ¿Qué proteínas ofrece de verdad (pollo, res, cordero)? ¿El cordero es habitual o solo en platos especiales por costo? ¿Es halal estricto o también sirve cerdo?
4. ¿Qué salsas se cobran aparte y cuáles van incluidas? (En las referencias de Madrid y Alemania la salsa de ajo y el pan extra se cobran.)
5. ¿Maneja domicilio con empaque propio y cómo identifica pedidos de delivery vs mesa? ¿Vende dulces árabes por unidad, por peso o por caja?
6. ¿Quién sirve buffet o menú del día en comida árabe? No encontramos ejemplos en Colombia; ¿vale la pena un subtipo propio?
