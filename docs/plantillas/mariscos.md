# Plantilla: Mariscos y pescado (key: mariscos)

**Estado:** borrador de investigación (Anexo B 3.1). Todos los precios en 0.

**Aviso de método (leer primero):** Hubo acceso a búsqueda web, pero NO a las cartas oficiales completas: los sitios de cartas (Scribd, PDF de La Mar) bloquearon la lectura y la mayoría de datos salen de artículos de prensa, guías de viaje y reseñas que describen las cartas. Por eso solo se marcó "Seguro" lo que aparece en 3 o más negocios/fuentes distintas. De los competidores (Loggro, Siigo POS, Fudo) NO se encontró ninguna plantilla de mariscos ni documentación de modificadores; solo se confirmó el concepto general de grupos de modificadores. No se copió texto ni fotos; solo nombres de opciones.

```json
{
  "key": "mariscos",
  "nombre": "Mariscos y pescado",
  "descripcion": "Restaurante de pescado entero, cazuelas, arroces y ceviches al estilo caribeño y pacífico colombiano.",
  "categorias": [
    {"value": "entradas_fritos", "label": "Entradas y fritos", "emoji": "🍤"},
    {"value": "ceviches_cocteles", "label": "Ceviches y cócteles", "emoji": "🥗"},
    {"value": "pescados", "label": "Pescados", "emoji": "🐟"},
    {"value": "mariscos_platos", "label": "Camarones y mariscos", "emoji": "🦐"},
    {"value": "cazuelas_sopas", "label": "Cazuelas y sopas", "emoji": "🍲"},
    {"value": "arroces", "label": "Arroces", "emoji": "🍚"},
    {"value": "langosta_parrilla", "label": "Langosta y parrilladas", "emoji": "🦞"},
    {"value": "acompanantes", "label": "Acompañantes", "emoji": "🍌"},
    {"value": "bebidas", "label": "Bebidas", "emoji": "🥤"},
    {"value": "postres", "label": "Postres", "emoji": "🍮"}
  ],
  "listas": [
    {"key": "preparacion_pescado", "nombre": "Preparación del pescado", "items": [
      {"label": "Frito entero", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "A la plancha / parrilla", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Sudado", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Encocado", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Al ajillo", "precio_extra": 0, "certeza": "Probable"},
      {"label": "A la marinera (en salsa de mariscos)", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Apanado", "precio_extra": 0, "certeza": "Suposición"}
    ]},
    {"key": "tipo_pescado", "nombre": "Tipo de pescado", "items": [
      {"label": "Mojarra", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Pargo rojo", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Róbalo", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Sierra", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Bagre / otro del día", "precio_extra": 0, "certeza": "Suposición"}
    ]},
    {"key": "acompanantes", "nombre": "Acompañantes", "items": [
      {"label": "Arroz de coco", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Patacón", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Ensalada", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Papas a la francesa", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Yuca", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Arroz blanco", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Tajadas de plátano maduro", "precio_extra": 0, "certeza": "Suposición"}
    ]},
    {"key": "salsas", "nombre": "Salsas", "items": [
      {"label": "Salsa de ajo (ajillo)", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Suero costeño", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Salsa de camarones", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Salsa tártara", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Ají picante", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Limón", "precio_extra": 0, "certeza": "Suposición"}
    ]},
    {"key": "marisco_base", "nombre": "Marisco / proteína", "items": [
      {"label": "Camarón", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Calamar", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Pulpo", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Almejas / mejillones", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Pescado", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Mixto", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Langosta", "precio_extra": 0, "certeza": "Probable"}
    ]},
    {"key": "porcion", "nombre": "Porción", "items": [
      {"label": "Individual", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Media (media cazuela)", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Para dos", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Para compartir", "precio_extra": 0, "certeza": "Suposición"}
    ]},
    {"key": "extras_ceviche", "nombre": "Extras del ceviche", "items": [
      {"label": "Chips de plátano", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Galletas saladas", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Sin cebolla", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Con picante", "precio_extra": 0, "certeza": "Suposición"}
    ]}
  ],
  "grupos_tipicos": [
    {"id": "g_preparacion", "nombre": "Preparación", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "preparacion_pescado"}},
    {"id": "g_tipo_pescado", "nombre": "Pescado", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "tipo_pescado"}},
    {"id": "g_acompanantes", "nombre": "Acompañantes", "modo": "multi", "min": 0, "max": 3, "requerido": false, "fuente": {"lista": "acompanantes"}},
    {"id": "g_salsa", "nombre": "Salsa", "modo": "multi", "min": 0, "max": 2, "requerido": false, "fuente": {"lista": "salsas"}},
    {"id": "g_marisco", "nombre": "Marisco", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "marisco_base"}},
    {"id": "g_porcion", "nombre": "Porción", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "porcion"}},
    {"id": "g_extras_ceviche", "nombre": "Extras", "modo": "multi", "min": 0, "max": 3, "requerido": false, "fuente": {"lista": "extras_ceviche"}},
    {"id": "g_picante", "nombre": "Picante", "modo": "single", "min": 0, "max": 1, "requerido": false, "fuente": {"items": [
      {"label": "Sin picante", "precio_extra": 0},
      {"label": "Suave", "precio_extra": 0},
      {"label": "Picante", "precio_extra": 0}
    ]}}
  ],
  "platos_ejemplo": [
    {"nombre": "Pescado entero", "categoria": "pescados", "precio": 0, "grupos": ["g_tipo_pescado", "g_preparacion", "g_acompanantes", "g_salsa"]},
    {"nombre": "Cazuela de mariscos", "categoria": "cazuelas_sopas", "precio": 0, "grupos": ["g_porcion", "g_acompanantes"]},
    {"nombre": "Ceviche", "categoria": "ceviches_cocteles", "precio": 0, "grupos": ["g_marisco", "g_porcion", "g_extras_ceviche", "g_picante"]},
    {"nombre": "Camarones al ajillo", "categoria": "mariscos_platos", "precio": 0, "grupos": ["g_porcion", "g_acompanantes"]},
    {"nombre": "Arroz de mariscos", "categoria": "arroces", "precio": 0, "grupos": ["g_porcion", "g_picante"]},
    {"nombre": "Sancocho de pescado", "categoria": "cazuelas_sopas", "precio": 0, "grupos": ["g_porcion"]},
    {"nombre": "Langosta", "categoria": "langosta_parrilla", "precio": 0, "grupos": ["g_preparacion", "g_acompanantes"]},
    {"nombre": "Parrillada de mariscos", "categoria": "langosta_parrilla", "precio": 0, "grupos": ["g_porcion", "g_acompanantes", "g_salsa"]},
    {"nombre": "Fritos de la casa (carimañolas, arepa de huevo)", "categoria": "entradas_fritos", "precio": 0, "grupos": ["g_porcion"]}
  ]
}
```

Notas de diseño: "Pescado entero" combina tipo + preparación porque casi todas las cartas lo venden así (mojarra/pargo/róbalo/sierra con arroz de coco y patacón). El precio de las especies suele variar por pescado, por eso `precio_extra` va en 0 y el dueño debe ponerlo (ver dudas).

## Fuentes

Negocios/fuentes consultados: 18 negocios colombianos (vía prensa/reseñas, no cartas oficiales) y 2 de referencia internacional. Competidores: sin plantilla de mariscos hallada.

| Elemento | Enlace | Certeza |
|---|---|---|
| Pescado entero frito (mojarra, pargo, róbalo, sierra) con arroz de coco y patacón | https://www.cartagenaexplorer.com/local-traditional-foods-to-try-cartagena-colombia ; https://www.willflyforfood.net/cartagena-restaurants/ ; https://medellinguru.com/?p=14832 (El Barco, Delimar) ; https://www.publimetro.co/opinion/2026/07/24/5-restaurantes-de-comida-de-mar-para-visitar-en-santa-marta/ (Mañe Cayón) | Seguro |
| Cazuela de mariscos (base de coco; camarón, calamar, pulpo, almejas, pescado) | publimetro (Cinto, Donde Chucho, Mañe Cayón, Siete Mares) ; cartagenaexplorer ; medellinguru (Donde Bupos, El Barco) ; https://carta.menu/restaurants/cali/pedro-junior | Seguro |
| Arroz de coco y patacón como acompañantes base; ensalada | publimetro ; cartagenaexplorer ; eltiempo.com (El Esturión: "todos los platos con arroz de coco y patacón") https://www.eltiempo.com/cultura/gastronomia/restaurantes-de-comida-de-mar-en-bogota-lugares-precios-y-platos-697700 | Seguro |
| Ceviche (camarón, de pescado; con chips de plátano y/o suero) | cartagenaexplorer ; publimetro (Donde Chucho, Pescao) ; https://www.larepublica.co/ocio/siete-lugares-para-comer-ceviche-de-alta-calidad-en-bogota-2595809 ; https://wanderlog.com/place/details/2109767 (Central Cevichería, 12 tipos) | Seguro |
| Camarones al ajillo / langosta al ajillo o gratinada | cartagenaexplorer ; publimetro (Donde Chucho) ; https://wanderlog.com/place/details/35374/la-mulata | Seguro |
| Preparaciones: sudado, guisado, filete a la marinera, al ajillo, a la parrilla, apanado | cartagenaexplorer (sudado, marinera) ; https://www.frommers.com/destinations/cartagena/restaurants/club-de-pesca ; eltiempo.com (camarones apanados) ; https://www.semana.com/restaurantes/articulo/restaurante-el-kilo/32887/ (parrilla de mar) | Probable |
| Encocado de pescado, tapao, arroz clavado (Pacífico) | https://foodwise.org/recipes/encocado-de-pescado-del-pacifico-coconut-fish-from-the-colombian-pacific/ ; https://www.elespectador.com/opinion/los-sabores-que-transforman-el-pacifico-columna-793173 ; https://carta.menu/restaurants/tumaco/guapi | Probable |
| Sancocho de pescado; arroz de mariscos / arroz caldoso | cartagenaexplorer ; publimetro (Pescao, Mañe Cayón, Siete Mares) | Probable |
| Porciones: media cazuela, parrillada para dos | wanderlog Magangué Centro https://wanderlog.com/place/details/3485124/restaurante-magangue-centro ; eltiempo.com (parrillada para dos) | Probable |
| Fritos / entradas (carimañolas, arepa de huevo, empanadas de pescado, picadas) | publimetro (Cinto, Pescao, Siete Mares) | Probable |
| Suero costeño como salsa/acompañante | eltiempo.com ; cartagenaexplorer | Probable |
| Referencia internacional: pescado grillado/blackened/frito/broiled, 2 acompañantes a elegir, salsas (tártara, cóctel) | https://www.redlobster.com/menu/classics ; https://www.redlobster.com/menu/shrimp | Probable |
| Referencia internacional: ceviche peruano (Mistura, Kuelap en Medellín) | https://medellinguru.com/?p=16145 | Suposición |
| Grupo de modificadores (obligatorio, mínimo/máximo, extras con costo) como patrón estándar | https://support.wix.com/es/article/wix-restaurants-understanding-modifiers ; https://support.toasttab.com/es-US/article/Advanced-Modifier-Configuration ; https://www.infogastronomica.com.ar/repost-socialfudo-19/ (Fudo) | Seguro |
| Precio variable / por peso para pescado del día | https://support.toasttab.com/en/article/Menu-Best-Practices-for-Delis-Markets ; https://o-series-support.lightspeedhq.com/hc/en-us/articles/31329504284187-Build-the-Best-Restaurant-Food-Menu | Probable |
| Loggro Restobar: recetas por producto, comandas a cocina (sin detalle de modificadores) | https://apps.apple.com/ca/app/loggro-restobar/id6480476721 | Probable |
| Siigo POS, Square: no se halló documentación específica | n/a | Suposición |
| Opciones de picante, sin cebolla, galletas, yuca, papas, arroz blanco, plátano maduro, tártara, bagre | Sin fuente directa (conocimiento general) | Suposición |

## Dudas para un dueño real

1. **Precio por especie y por peso:** ¿el pescado entero se vende a precio fijo por plato, por especie (mojarra vs. pargo vs. róbalo), o por libra/peso y "precio del día"? Define si `precio_extra` por especie o precio variable en el POS.
2. **Acompañantes incluidos o cobrados:** ¿arroz de coco, patacón y ensalada vienen incluidos siempre? ¿Qué acompañante cambiado o adicional se cobra y cuánto?
3. **Preparación cambia el precio:** ¿frito, a la plancha, al ajillo o encocado cuestan lo mismo o los camarones/langosta al ajillo suben?
4. **Disponibilidad diaria:** ¿cómo manejan el pescado/marisco "agotado" del día (se apaga la opción, se cambia el menú)?
5. **Porciones:** ¿qué tamaños usan de verdad (individual, media, para dos, para 4)? ¿Una "media cazuela" tiene precio proporcional?
6. **Inventario:** ¿descuentan por libra de pescado, por unidad o no llevan inventario? ¿Hay merma por limpiar el pescado?
7. **Combos y promociones:** ¿venden combos (cazuela + bebida, parrillada) o almuerzo ejecutivo con sopa y jugo? ¿Los fines de semana tienen platos especiales (sancocho de 7 cabezas)?
8. **Cocina:** ¿cuántas estaciones tiene (freidora, plancha, cocina fría de ceviches) y se necesita enviar cada plato a una estación distinta?
9. **Servicio:** ¿hay propina sugerida (10%) y cobro por persona en parrilladas para compartir? ¿Mesas con cuentas divididas?
10. **Alérgenos:** ¿marcan mariscos/pescado/gluten en la carta para clientes?
