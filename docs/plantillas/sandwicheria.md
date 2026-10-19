# Plantilla: Sandwichería (key: sandwicheria)

Anexo B 3.1 del spec. Borrador de investigación, fecha 2026-10-16.

## Alcance y limitaciones de la investigación (leer primero)

- Hubo acceso a búsqueda web, pero **no a leer las cartas completas**: WebFetch fue bloqueado en casi todos los dominios (403 / dominio no verificable) y solo se pudo trabajar con resúmenes de resultados de búsqueda. Ninguna carta se leyó de punta a punta.
- **Negocios colombianos con algún dato estructural: 5** (Subway Colombia, Charles Café Suba, Brooklyn Deli Bogotá, Sándwich Qbano, Wayoyo [ubicación no confirmada]). Solo Subway Colombia y Charles Café dieron datos de opciones (pan, tamaño, salsas); los otros aportan categorías y nombres de sándwiches. No se llegó a los 5-10 con cartas reales completas.
- **Referencias internacionales: 4** (Subway EE. UU., Jersey Mike's, Potbelly, Pret a Manger), vía resúmenes de búsqueda, no cartas oficiales.
- **Competidores POS:** se obtuvo documentación de Toast, Square y Lightspeed. **Loggro, Siigo POS y Fudo: no se encontró documentación pública** sobre modificadores ni plantillas de sandwichería (queda como pendiente).
- Por eso la mayoría de los elementos están marcados `Probable` o `Suposición`. Todos los precios están en 0.

## Hallazgos clave

1. Estructura universal "arma tu sándwich": **pan -> tamaño -> proteína -> queso -> vegetales -> salsas -> (tostado) -> combo**. Aparece en Subway, Jersey Mike's, Potbelly y en Charles Café (baguette 21 cm / 14 cm, lechuga, tomate, queso, salsas, proteína).
2. Tamaño: dos o tres niveles (Subway 6"/footlong; Jersey Mike's mini/regular/giant; Potbelly Skinny/Original/BIG; Charles Café 14 cm/21 cm).
3. Subway Colombia localiza sabores: panes (blanco, avena y miel, mantequilla y ajo, orégano y parmesano), wraps (Pavo, Pollo Ranchero, Cerdo BBQ), Sub Criollo (salchicha ranchera, plátano maduro, maíz dulce, salsa de ajo). Salsas colombianas típicas: rosada, ajo, tomate, mayonesa, mostaza.
4. Qbano reporta que bowls, ensaladas, wraps y hamburguesas ya pesan 15% de ventas: la categoría "sándwiches" casi siempre convive con wraps, ensaladas y bebidas.
5. Wraps y bowls funcionan como "otro tipo de pan" (Jersey Mike's: cualquier sub como wrap o bowl; Subway: wrap como opción de pan). Decisión de diseño: `Wrap` va como ítem de la lista de panes y además hay categoría "wraps" para los wraps con receta fija.
6. Competidores: Toast = grupo de modificadores obligatorio de selección única (pan) + opcional (toppings), asignable a ítem, categoría o grupo de ítems, con pre-modificadores (SIN, EXTRA, AL LADO). Square = conjuntos de modificadores con límite de selecciones (ej. máx. 3 aderezos); mínimo/máximo se fija por ítem. Lightspeed = grupo de modificadores con "selección requerida" y mínimo/máximo entre 1 y 99. Ninguno publica una plantilla de sandwichería lista: el dueño la arma. Ventaja posible de RestaurantOS: traerla pre-armada.

## Borrador JSON

```json
{
  "key": "sandwicheria",
  "nombre": "Sandwichería",
  "descripcion": "Sándwiches, wraps, baguettes y ensaladas con opciones de pan, tamaño, proteína, quesos, vegetales y salsas, más combos.",
  "categorias": [
    {"value": "sandwiches", "label": "Sándwiches", "emoji": "🥪"},
    {"value": "baguettes", "label": "Baguettes", "emoji": "🥖"},
    {"value": "wraps", "label": "Wraps", "emoji": "🌯"},
    {"value": "ensaladas", "label": "Ensaladas", "emoji": "🥗"},
    {"value": "arma_el_tuyo", "label": "Arma el tuyo", "emoji": "🧑‍🍳"},
    {"value": "combos", "label": "Combos", "emoji": "🍱"},
    {"value": "acompanamientos", "label": "Acompañamientos", "emoji": "🍟"},
    {"value": "bebidas", "label": "Bebidas", "emoji": "🥤"},
    {"value": "postres", "label": "Postres", "emoji": "🍪"}
  ],
  "listas": [
    {"key": "panes", "nombre": "Panes", "items": [
      {"label": "Pan blanco", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Pan integral", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Baguette", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Ciabatta", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Croissant", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Pan de avena y miel", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Pan de mantequilla y ajo", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Pan de orégano y parmesano", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Wrap (tortilla)", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Sin pan (bowl)", "precio_extra": 0, "certeza": "Probable"}
    ]},
    {"key": "tamanos", "nombre": "Tamaños", "items": [
      {"label": "Pequeño (mini)", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Mediano (15 cm)", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Grande (30 cm)", "precio_extra": 0, "certeza": "Probable"}
    ]},
    {"key": "proteinas", "nombre": "Proteínas", "items": [
      {"label": "Pollo", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Pollo desmechado", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Jamón", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Pavo", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Carne desmechada (ropa vieja)", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Roast beef", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Cerdo (pernil / pulled pork)", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Costilla", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Tocineta", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Atún", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Huevo", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Vegetariano (sin proteína animal)", "precio_extra": 0, "certeza": "Probable"}
    ]},
    {"key": "quesos", "nombre": "Quesos", "items": [
      {"label": "Queso mozzarella", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Queso cheddar", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Queso doble crema", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Queso suizo", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Queso provolone", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Queso parmesano", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Sin queso", "precio_extra": 0, "certeza": "Seguro"}
    ]},
    {"key": "vegetales", "nombre": "Vegetales", "items": [
      {"label": "Lechuga", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Tomate", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Cebolla", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Pepino", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Pimentón", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Pepinillos", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Jalapeños", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Aceitunas", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Aguacate", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Espinaca", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Maíz dulce", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Plátano maduro", "precio_extra": 0, "certeza": "Probable"}
    ]},
    {"key": "salsas", "nombre": "Salsas", "items": [
      {"label": "Salsa rosada", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Salsa de ajo", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Mayonesa", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Mostaza", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Salsa de tomate", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Salsa BBQ", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Salsa ranch", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Salsa de piña", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Ají", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Aderezo César", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Aceite y vinagre", "precio_extra": 0, "certeza": "Probable"}
    ]},
    {"key": "extras", "nombre": "Adicionales", "items": [
      {"label": "Extra proteína", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Extra queso", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Extra tocineta", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Aguacate extra", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Huevo extra", "precio_extra": 0, "certeza": "Suposición"}
    ]},
    {"key": "tostado", "nombre": "Tostado", "items": [
      {"label": "Tostado", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Sin tostar", "precio_extra": 0, "certeza": "Probable"}
    ]},
    {"key": "acompanamientos", "nombre": "Acompañamientos", "items": [
      {"label": "Papas fritas", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Papas criollas", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Ensalada pequeña", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Galleta", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Sopa del día", "precio_extra": 0, "certeza": "Suposición"}
    ]},
    {"key": "bebidas", "nombre": "Bebidas del combo", "items": [
      {"label": "Gaseosa", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Jugo natural", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Limonada", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Agua", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Té helado", "precio_extra": 0, "certeza": "Suposición"}
    ]}
  ],
  "grupos_tipicos": [
    {"id": "g_pan", "nombre": "Pan", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "panes"}},
    {"id": "g_tamano", "nombre": "Tamaño", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "tamanos"}},
    {"id": "g_proteina", "nombre": "Proteína", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "proteinas"}},
    {"id": "g_proteina_doble", "nombre": "Proteínas (hasta 2)", "modo": "multi", "min": 1, "max": 2, "requerido": true, "fuente": {"lista": "proteinas"}},
    {"id": "g_queso", "nombre": "Queso", "modo": "single", "min": 0, "max": 1, "requerido": false, "fuente": {"lista": "quesos"}},
    {"id": "g_vegetales", "nombre": "Vegetales", "modo": "multi", "min": 0, "max": 12, "requerido": false, "fuente": {"lista": "vegetales"}},
    {"id": "g_salsas", "nombre": "Salsas", "modo": "multi", "min": 0, "max": 3, "requerido": false, "fuente": {"lista": "salsas"}},
    {"id": "g_tostado", "nombre": "Tostado", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "tostado"}},
    {"id": "g_extras", "nombre": "Adicionales", "modo": "multi", "min": 0, "max": 5, "requerido": false, "fuente": {"lista": "extras"}},
    {"id": "g_acomp", "nombre": "Acompañamiento del combo", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "acompanamientos"}},
    {"id": "g_bebida", "nombre": "Bebida del combo", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "bebidas"}},
    {"id": "g_aderezo_ensalada", "nombre": "Aderezo de la ensalada", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"items": [
      {"label": "Aderezo César", "precio_extra": 0},
      {"label": "Vinagreta", "precio_extra": 0},
      {"label": "Aceite y vinagre", "precio_extra": 0},
      {"label": "Salsa ranch", "precio_extra": 0}
    ]}},
    {"id": "g_combo", "nombre": "¿Hacerlo combo?", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"items": [
      {"label": "Solo el sándwich", "precio_extra": 0},
      {"label": "Combo (acompañamiento + bebida)", "precio_extra": 0}
    ]}}
  ],
  "platos_ejemplo": [
    {"nombre": "Sándwich de pollo", "categoria": "sandwiches", "precio": 0, "grupos": ["g_pan", "g_tamano", "g_queso", "g_vegetales", "g_salsas", "g_tostado", "g_extras", "g_combo"]},
    {"nombre": "Sándwich de jamón y queso", "categoria": "sandwiches", "precio": 0, "grupos": ["g_pan", "g_tamano", "g_queso", "g_vegetales", "g_salsas", "g_tostado", "g_extras", "g_combo"]},
    {"nombre": "Sándwich de ropa vieja", "categoria": "sandwiches", "precio": 0, "grupos": ["g_pan", "g_tamano", "g_queso", "g_vegetales", "g_salsas", "g_tostado", "g_extras", "g_combo"]},
    {"nombre": "Baguette de pavo", "categoria": "baguettes", "precio": 0, "grupos": ["g_tamano", "g_queso", "g_vegetales", "g_salsas", "g_tostado", "g_extras", "g_combo"]},
    {"nombre": "Wrap de pollo", "categoria": "wraps", "precio": 0, "grupos": ["g_queso", "g_vegetales", "g_salsas", "g_extras", "g_combo"]},
    {"nombre": "Wrap vegetariano", "categoria": "wraps", "precio": 0, "grupos": ["g_queso", "g_vegetales", "g_salsas", "g_extras", "g_combo"]},
    {"nombre": "Ensalada César con pollo", "categoria": "ensaladas", "precio": 0, "grupos": ["g_aderezo_ensalada", "g_extras"]},
    {"nombre": "Arma tu sándwich", "categoria": "arma_el_tuyo", "precio": 0, "grupos": ["g_pan", "g_tamano", "g_proteina", "g_queso", "g_vegetales", "g_salsas", "g_tostado", "g_extras", "g_combo"]},
    {"nombre": "Sándwich mixto doble proteína", "categoria": "arma_el_tuyo", "precio": 0, "grupos": ["g_pan", "g_tamano", "g_proteina_doble", "g_queso", "g_vegetales", "g_salsas", "g_tostado", "g_extras", "g_combo"]}
  ]
}
```

Notas de diseño:
- `g_combo` es una decisión simple (precio_extra 0 porque el valor del combo es del dueño). Cuando el dueño lo active, `g_acomp` y `g_bebida` deberían aparecer solo si eligió combo. Si el motor de grupos no soporta dependencias, alternativa: crear el combo como plato separado en la categoría "combos" con `g_acomp` y `g_bebida`.
- Los platos con receta fija (wraps, baguettes) no llevan `g_pan` ni `g_proteina` porque ya vienen definidos por el plato.
- `g_proteina` (única) y `g_proteina_doble` (multi, máx. 2) son alternativos: se usan en platos distintos.
- `precio_extra` en 0 en todo: ninguna regla es lo bastante universal. Los cobros típicos (tamaño grande, extra proteína, extra queso, aguacate) existen casi siempre, pero el monto es del dueño.

## FUENTES

| Elemento | Enlace consultado | Certeza |
|---|---|---|
| Estructura pan/tamaño/queso/vegetales/salsas | https://squareup.com/help/article/6426 (ejemplo de sándwich con conjunto de condimentos) y búsqueda de menú de Subway (resumen) | Seguro |
| Charles Café (baguette 21 cm y 14 cm, lechuga, tomate, queso, salsas rosada/tomate/mayonesa/mostaza, proteína a elegir) | https://carta.menu/restaurants/suba/charles-cafe/menu (solo vista en resultado de búsqueda; la página dio 403 al abrirla) | Probable |
| Subway Colombia: panes de avena y miel, mantequilla y ajo, orégano y parmesano; Subway Series; wraps; Sub Criollo | https://lac.newsroom.subway.com/Subway-R-presenta-Subway-Series-en-Colombia-con-seis-creaciones-gourmet-disenadas-por-chefs?asPDF=1 y https://lac.newsroom.subway.com/2023-04-19-Sandwiches-con-toque-colombiano,-la-nueva-apuesta-de-Subway-en-el-mercado?asPDF=1 (resumen de búsqueda) | Seguro |
| Subway EE. UU.: tamaños 6"/footlong, quesos, vegetales, salsas, tostado | https://menupedia.us/subway-menu/ y https://querysprout.com/what-are-the-toppings-at-subway/ (resumen de búsqueda; fuentes de terceros) | Probable |
| Jersey Mike's: mini/regular/giant, panes blanco/integral/rosemary parm/sin gluten, wrap o bowl | https://tastingtable.com/1954926/how-big-is-regular-jersey-mikes-sub (resumen de búsqueda) | Probable |
| Potbelly: tamaños Skinny/Original/BIG, hot peppers, salsas, extras pagos | https://www.franchising.com/news/20210831_potbelly_unveils_enhanced_menu_nationwide.html y https://restaurantbusinessonline.com/food/potbelly-expands-core-menu-without-overcomplicating-things | Probable |
| Pret a Manger: baguettes, wraps, ensaladas, bowls como categorías | https://www.doordash.com/en-AU/business/pret-a-manger-11570/menu/ y listados de https://deliveroo.co.uk (resumen de búsqueda) | Probable |
| Brooklyn Deli Bogotá: club sándwich, roast beef, pulled pork, sopas/cremas como acompañamiento | https://www.eltiempo.com/cultura/gastronomia/el-club-sandwich-y-otros-emparedados-de-brooklyn-deli-en-bogota-450412 y https://www.colombia.com/gastronomia/noticias/descubre-la-nueva-propuesta-de-sandwiches-con-sabor-americano-236648 (resumen de búsqueda) | Probable |
| Qbano: sándwich especial, ropa vieja, costilla; bowls/ensaladas/wraps/hamburguesas = 15% de ventas; salsa de ajo | https://lanotaeconomica.com.co/movidas-empresarial/la-marca-colombiana-qbano-cumple-45-anos-con-mas-de-500-millones-de-unidades-vendidas y https://www.eltiempo.com/economia/empresas/qbano-entra-al-negocio-de-las-salsas-y-espera-triplicar-las-ventas-de-esta-categoria-3576417 | Probable |
| Wayoyo: ciabatta ropa vieja (carne mechada, cheddar, lechuga, tomate), croissant jamón y queso, categoría ensaladas/wraps/rolls (ubicación no confirmada) | https://wayoyo.square.site/uploads/b/d7f8d300-19e7-11f0-949f-63d1687b9345/23f278f0-a926-11f0-ac9b-3babc2829723.pdf | Suposición |
| Combos / acompañamientos (papas, galleta, bebida) | Sin carta colombiana confirmada; práctica de cadenas internacionales y delivery | Suposición |
| Toast: grupo obligatorio de selección única, asignación por ítem/categoría, pre-modificadores | https://support.toasttab.com/en/article/Creating-Modifier-Groups-and-Modifiers-1492803987509 y https://support.toasttab.com/es-US/article/Pre-Modifiers-1493068611745 | Seguro |
| Square: conjuntos con límite de selecciones, "solo un modificador" | https://squareup.com/help/us/en/article/6426-modifiers-and-categories-with-square-for-restaurants y https://squareup.com/help/gb/en/article/5119-create-and-manage-item-modifiers | Seguro |
| Lightspeed: grupo con selección requerida, mín./máx. 1-99 | https://o-series-support.lightspeedhq.com/hc/en-us/articles/31329349913243 y https://resto-support.lightspeedhq.com/hc/articles/226405468 | Probable |
| Loggro, Siigo POS, Fudo | Búsquedas sin documentación pública relevante (Fudo: solo descripción general, p. ej. https://www.descubre.vc/fudo) | Suposición (sin dato) |
| Mercado: sándwiches y wraps = 42% del food service en Colombia; Subway + Qbano = 61,7% del segmento | https://www.portafolio.co/negocios/subway-y-sandwich-qbano-tienen-el-61-7-por-ciento-del-mercado-549368 (cifra de 42% vía resumen de búsqueda de GlobalData) | Probable |

## Dudas para un dueño real

1. **Tamaños:** ¿cuántos manejan y cuáles (15/30 cm, mini/grande, 14/21 cm)? ¿El precio del tamaño es por plato o un recargo fijo sobre el pequeño?
2. **¿Qué se cobra aparte y cuánto?** Extra proteína, extra queso, tocineta, aguacate, pan especial. ¿Hay ingredientes "gratis hasta N" (ej. salsas hasta 3, vegetales ilimitados)?
3. **Carta fija vs. arma tu sándwich:** ¿vende sobre todo recetas fijas o que el cliente arme todo? Cambia si se pide pan/proteína en cada plato.
4. **Combos:** ¿qué incluyen exactamente (papas, galleta, bebida)? ¿El combo es un recargo único o un plato aparte con precio propio? ¿Cambian según el sándwich?
5. **Wraps y ensaladas:** ¿el wrap lleva las mismas opciones que el sándwich o recetas fijas? ¿Las ensaladas se arman (base + proteína + aderezo) o son fijas?
6. **Tostado/calentado:** ¿se pregunta siempre (horno/plancha) o es por defecto? ¿Hay sándwiches fríos y calientes?
7. **Alérgenos y dieta:** ¿ofrece pan sin gluten, opciones veganas? ¿Se debe mostrar al cliente?
8. **Salsas:** ¿cuáles son las de la casa (ej. salsa de ajo, rosada propia)? ¿Se venden en frasco o porción aparte?
9. **Inventario:** ¿descuenta por ingrediente (gramos de proteína, unidades de pan) o por plato? Los panes suelen ser el insumo crítico.
10. **Domicilios:** ¿el mismo menú en Rappi/Didi o carta reducida? ¿Los precios de apps van distintos?
11. **Impuestos:** ¿aplica impuesto al consumo (8%) o IVA? Para el POS, ¿cómo se cobra el domicilio?
