# Plantilla: Cafetería (key: cafeteria)

> **Aviso de alcance de la investigación.** Hubo acceso a búsqueda web, pero la lectura directa de cartas fue limitada: los PDF de Café Berenguela no se pudieron abrir (uno dio error de red, el otro llegó como binario sin texto), Scribd no es verificable, y no apareció documentación pública de Loggro, Fudo, Siigo POS ni Lightspeed sobre plantillas de menú. Lo que sí se obtuvo fueron resúmenes de búsqueda sobre cartas/reseñas de 7 negocios colombianos y 3 referencias internacionales, más documentación de Toast y comentarios de Square. Por eso la mayoría de los elementos quedan en **Probable** o **Suposición**; solo se marca **Seguro** lo que aparece en 2 o más fuentes independientes. Nada de precios: todo en 0.

## Borrador JSON

```json
{
  "key": "cafeteria",
  "nombre": "Cafetería",
  "descripcion": "Café, bebidas calientes y frías, pastelería y comida ligera. Bebidas con tamaño, tipo de leche y adiciones.",
  "categorias": [
    {"value": "cafes_calientes", "label": "Cafés calientes", "emoji": "☕"},
    {"value": "cafes_frios", "label": "Cafés fríos", "emoji": "🧊"},
    {"value": "no_cafe", "label": "Té, chocolate y otras bebidas", "emoji": "🍵"},
    {"value": "jugos_batidos", "label": "Jugos, batidos y limonadas", "emoji": "🥤"},
    {"value": "panaderia", "label": "Panadería y pastelería", "emoji": "🥐"},
    {"value": "desayunos", "label": "Desayunos", "emoji": "🍳"},
    {"value": "sandwiches", "label": "Sándwiches y salados", "emoji": "🥪"},
    {"value": "postres", "label": "Postres", "emoji": "🍰"},
    {"value": "combos", "label": "Combos", "emoji": "🧾"},
    {"value": "granos", "label": "Café en grano / retail", "emoji": "🫘"}
  ],
  "listas": [
    {"key": "leches", "nombre": "Leches", "items": [
      {"label": "Entera", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Deslactosada", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Descremada", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Avena", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Almendra", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Soya", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Coco", "precio_extra": 0, "certeza": "Suposición"}
    ]},
    {"key": "sabores_jarabe", "nombre": "Sabores / jarabes", "items": [
      {"label": "Vainilla", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Caramelo", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Avellana", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Canela", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Chocolate", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Coco", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Sin azúcar (vainilla)", "precio_extra": 0, "certeza": "Probable"}
    ]},
    {"key": "temperatura", "nombre": "Temperatura", "items": [
      {"label": "Caliente", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Frío / con hielo", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Extra caliente", "precio_extra": 0, "certeza": "Probable"}
    ]},
    {"key": "extras_cafe", "nombre": "Extras de café", "items": [
      {"label": "Shot extra de espresso", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Descafeinado", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Crema chantilly", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Salsa de chocolate", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Salsa de caramelo", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Jarrita de leche aparte", "precio_extra": 0, "certeza": "Suposición"}
    ]},
    {"key": "endulzante", "nombre": "Endulzante", "items": [
      {"label": "Con azúcar", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Sin azúcar", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Panela", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Stevia / edulcorante", "precio_extra": 0, "certeza": "Suposición"}
    ]},
    {"key": "metodo_filtrado", "nombre": "Método de preparación", "items": [
      {"label": "V60", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Chemex", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Prensa francesa", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Aeropress", "precio_extra": 0, "certeza": "Suposición"}
    ]},
    {"key": "calentar_pan", "nombre": "Preparación del pan", "items": [
      {"label": "Calentado", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Al ambiente", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Tostado", "precio_extra": 0, "certeza": "Suposición"}
    ]},
    {"key": "acompanante_combo", "nombre": "Acompañante del combo", "items": [
      {"label": "Pan de queso", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Croissant", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Porción de torta", "precio_extra": 0, "certeza": "Suposición"}
    ]}
  ],
  "grupos_tipicos": [
    {"id": "g_tamano_cafe", "nombre": "Tamaño", "modo": "single", "min": 1, "max": 1, "requerido": true,
     "fuente": {"items": [{"label": "Pequeño", "precio_extra": 0}, {"label": "Mediano", "precio_extra": 0}, {"label": "Grande", "precio_extra": 0}]}},
    {"id": "g_tamano_corto_largo", "nombre": "Tamaño", "modo": "single", "min": 1, "max": 1, "requerido": true,
     "fuente": {"items": [{"label": "Corto", "precio_extra": 0}, {"label": "Largo", "precio_extra": 0}]}},
    {"id": "g_temperatura", "nombre": "Temperatura", "modo": "single", "min": 1, "max": 1, "requerido": true,
     "fuente": {"lista": "temperatura"}},
    {"id": "g_leche", "nombre": "Tipo de leche", "modo": "single", "min": 0, "max": 1, "requerido": false,
     "fuente": {"lista": "leches"}},
    {"id": "g_sabor", "nombre": "Sabor / jarabe", "modo": "multi", "min": 0, "max": 2, "requerido": false,
     "fuente": {"lista": "sabores_jarabe"}},
    {"id": "g_extras_cafe", "nombre": "Adiciones", "modo": "multi", "min": 0, "max": 4, "requerido": false,
     "fuente": {"lista": "extras_cafe"}},
    {"id": "g_endulzante", "nombre": "Endulzante", "modo": "single", "min": 0, "max": 1, "requerido": false,
     "fuente": {"lista": "endulzante"}},
    {"id": "g_metodo", "nombre": "Método", "modo": "single", "min": 1, "max": 1, "requerido": true,
     "fuente": {"lista": "metodo_filtrado"}},
    {"id": "g_pan", "nombre": "Cómo lo quieres", "modo": "single", "min": 0, "max": 1, "requerido": false,
     "fuente": {"lista": "calentar_pan"}},
    {"id": "g_combo_acomp", "nombre": "Acompañante", "modo": "single", "min": 1, "max": 1, "requerido": true,
     "fuente": {"lista": "acompanante_combo"}}
  ],
  "platos_ejemplo": [
    {"nombre": "Tinto", "categoria": "cafes_calientes", "precio": 0, "grupos": ["g_tamano_corto_largo", "g_endulzante"]},
    {"nombre": "Americano", "categoria": "cafes_calientes", "precio": 0, "grupos": ["g_tamano_cafe", "g_extras_cafe", "g_endulzante"]},
    {"nombre": "Capuchino", "categoria": "cafes_calientes", "precio": 0, "grupos": ["g_tamano_cafe", "g_leche", "g_sabor", "g_extras_cafe"]},
    {"nombre": "Latte", "categoria": "cafes_calientes", "precio": 0, "grupos": ["g_tamano_cafe", "g_temperatura", "g_leche", "g_sabor", "g_extras_cafe"]},
    {"nombre": "Café filtrado de especialidad", "categoria": "cafes_calientes", "precio": 0, "grupos": ["g_metodo"]},
    {"nombre": "Frappé de café", "categoria": "cafes_frios", "precio": 0, "grupos": ["g_tamano_cafe", "g_leche", "g_sabor", "g_extras_cafe"]},
    {"nombre": "Croissant", "categoria": "panaderia", "precio": 0, "grupos": ["g_pan"]},
    {"nombre": "Sándwich", "categoria": "sandwiches", "precio": 0, "grupos": ["g_pan"]},
    {"nombre": "Combo café + acompañante", "categoria": "combos", "precio": 0, "grupos": ["g_tamano_cafe", "g_leche", "g_combo_acomp"]}
  ]
}
```

## Fuentes

Nota: las URL son páginas que aparecieron en los resultados de búsqueda; en varios casos solo se leyó el resumen del buscador, no la página completa. No se copió texto ni imágenes de cartas.

| Elemento | Enlace | Certeza |
|---|---|---|
| Separación cafés calientes / fríos; tinto como categoría local; tamaños corto y largo; marca de bebidas con lácteos (Café Berenguela, Colombia) | https://www.otraparte.org/wp-content/uploads/Menu_Cafe_Berenguela_20250313.pdf (solo vía resumen de búsqueda; el PDF no abrió) | Probable |
| Tamaños en cadena colombiana: 3 a 4 tamaños en café caliente, de 7 a 16 oz (Juan Valdez) | https://www.eltiempo.com/archivo/documento/CMS-14357141 | Probable |
| Juan Valdez: 70+ preparaciones calientes y frías; cappuccino, latte, moca, tinto, tés, frapeados, malteadas, limonadas, sándwiches, pastelería | https://delfino.cr/2025/03/juan-valdez-cafe-abre-en-cartago-su-septima-tienda-en-costa-rica | Probable |
| Juan Valdez: línea fría (nevados, malteadas, granizados, frappés); panadería local (almojábana, arepa) | https://infonegocios.com.py/default/juan-valdez-habilita-otro-exclusivo-local-en-la-capital-pero-no-sera-el-ultimo-del-ano | Probable |
| Leche de almendra como opción en cafeterías de Medellín (Botswana Café Bar, reseñas) | https://wanderlog.com/place/details/9143236/botswana-café-bar-centro | Probable |
| Honesto Café: especialidad + pasabocas (palito de queso) como acompañante | https://wanderlog.com/place/details/5533235/honesto-café-mercado-del-rio | Suposición (solo reseña) |
| Al Alma: croissant de almendra, brunch, tostadas | https://wanderlog.com/place/details/1416034 | Suposición (solo reseña) |
| Azahar (Bogotá): métodos prensa francesa, Chemex, pour-over, espresso; desayunos y sándwiches | https://imagizer.com (Lonely Planet, vía búsqueda): https://www-lonelyplanet-com-6c06.imagizer.com/colombia/bogota/nightlife/azahar-cafe/a/poi-dri/1497254/363308 | Probable |
| Amor Perfecto: proveedor de cafeterías, café de especialidad | https://www.portafolio.co/negocios/empresas/la-marca-de-cafe-amor-perfecto-entra-al-negocio-de-las-franquicias-508177 | Suposición |
| Tamaños Starbucks (alto/grande/venti, referencia regional), leches vegetales como suplemento | https://www.eluniverso.com/noticias/economia/este-es-el-menu-y-precios-de-starbucks-en-ecuador-nota/ | Probable |
| Jarabes: vainilla, cinnamon dolce, vainilla sin azúcar, avellana (México); caramelo, almendra, frambuesa, coco (Uruguay) | https://www.rappi.com.mx/restaurantes/1923213473-starbucks ; https://www.montevideo.com.uy/Negocios-y-Tendencias/Personaliza-tu-bebida-en-Starbucks-de-la-forma-que-mas-te-guste-uc780584 | Seguro (sabores vainilla, caramelo, avellana) |
| Toast: grupos de modificadores Temperatura (requerido) y Leche (opcional), jarabes, shot extra; tamaño como item aparte o "size pricing" | https://support.toasttab.com/en/article/Menu-Best-Practices-for-Bakeries-Coffee-Shops | Seguro (estructura) |
| Toast: nombres de tamaño deben coincidir exacto entre item y modificador | https://doc.toasttab.com/doc/devguide/apiSpecifyingModifiersAndInstructions.html | Probable |
| Square: un item con variaciones de tamaño + sets de modificadores (leche, azúcar, sabores), selección única o múltiple | https://community.squareup.com/t5/Orders-Menu-Items-Catalog/Modifiers-for-restaurant/m-p/260582 | Probable |
| Square: no soporta precio de modificador según tamaño; alternativa: un item por tamaño | https://community.squareup.com/t5/Food-Beverage/Dynamic-Modifiers/m-p/821886 | Probable |
| Siigo POS: menú con recetas y combos, pedidos a barra/cocina | https://www.siigo.com/sistema-pos/restaurantes | Suposición (sin detalle de plantillas) |
| Loggro Restobar, Fudo, Lightspeed: sin documentación de plantillas encontrada | https://apps.apple.com/us/app/loggro-restobar/id6480476721?l=es-MX | Suposición |
| Combos como categoría; acompañantes de combo | sin fuente directa (conocimiento general) | Suposición |

Hallazgo de diseño relevante para RestaurantOS: tanto Toast como Square tienen el mismo problema, que el precio extra de la leche vegetal a veces depende del tamaño y no se puede expresar con un solo precio_extra. Por eso aquí todo `precio_extra` va en 0.

## Dudas para un dueño real

1. **Tamaños:** ¿cuántos tamaños vende y con qué nombres (Pequeño/Mediano/Grande, 8/12/16 oz, Corto/Largo)? ¿Todos los cafés tienen los mismos tamaños o solo algunos?
2. **Leche vegetal:** ¿cobra extra por avena/almendra/deslactosada, y ese extra cambia con el tamaño? ¿Cuáles leches ofrece de verdad (deslactosada, soya, coco)?
3. **Sabores y adiciones:** ¿cobra el jarabe, el shot extra, la crema? ¿Cuántos sabores puede llevar una bebida?
4. **Tinto:** ¿se vende por tamaño, por taza o en termo? ¿Lleva azúcar o panela por defecto?
5. **Temperatura:** ¿un mismo latte se vende caliente y frío con el mismo precio, o son productos distintos?
6. **Combos:** ¿vende combos fijos (café + pan) o deja armarlos? ¿Quién escoge el acompañante?
7. **Pan y pastelería:** ¿le preguntan al cliente si lo calienta? ¿El pan se vende por unidad o porción?
8. **Café de especialidad:** ¿ofrece varios orígenes y métodos (V60, Chemex)? ¿El método cambia el precio?
9. **Retail:** ¿vende café en grano o molido? ¿Con qué moliendas y presentaciones (250 g, 500 g)?
10. **Canal:** ¿qué porcentaje es para llevar vs. mesa? ¿Necesita nombre del cliente en el vaso?
11. **Alérgenos y etiquetas:** ¿marca lactosa, gluten o vegano en la carta?
