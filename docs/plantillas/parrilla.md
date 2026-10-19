# Plantilla: parrilla / asadero (key: parrilla)

> Nota de método: hubo acceso a búsqueda web, pero solo a resúmenes de búsqueda. WebFetch no pudo abrir el PDF de La Colina (dominio bloqueado) y no se abrieron cartas completas. Las cartas de Colombia vienen de fragmentos de búsqueda. Fudo, Loggro y Siigo POS no mostraron documentación pública sobre plantillas ni modificadores, así que esa parte es Suposición. Solo se extrajo estructura (nombres de opciones y categorías), sin copiar textos ni fotos. Todos los precios están en 0.

## Borrador JSON

```json
{
  "key": "parrilla",
  "nombre": "Parrilla / Asadero",
  "descripcion": "Carnes a la parrilla, pollo asado, chorizo y acompañantes. Término de la carne, acompañantes con máximo y salsas.",
  "categorias": [
    {"value": "carnes_parrilla", "label": "Carnes a la parrilla", "emoji": "🥩"},
    {"value": "pollo_asado", "label": "Pollo asado", "emoji": "🍗"},
    {"value": "cerdo_parrilla", "label": "Cerdo y costillas", "emoji": "🍖"},
    {"value": "chorizos_achuras", "label": "Chorizos y achuras", "emoji": "🌭"},
    {"value": "parrilladas_picadas", "label": "Parrilladas y picadas", "emoji": "🔥"},
    {"value": "combos", "label": "Combos", "emoji": "🍽️"},
    {"value": "acompanantes", "label": "Acompañantes", "emoji": "🥔"},
    {"value": "entradas", "label": "Entradas", "emoji": "🧀"},
    {"value": "bebidas", "label": "Bebidas", "emoji": "🥤"},
    {"value": "postres", "label": "Postres", "emoji": "🍮"}
  ],
  "listas": [
    {"key": "terminos_carne", "nombre": "Términos de la carne", "items": [
      {"label": "Jugoso (poco hecho)", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Término medio", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Tres cuartos", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Bien cocido", "precio_extra": 0, "certeza": "Seguro"}
    ]},
    {"key": "acompanantes", "nombre": "Acompañantes", "items": [
      {"label": "Papa criolla", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Papa salada", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Papas a la francesa", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Papa en casco", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Yuca", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Plátano maduro", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Patacón", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Arepa", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Arroz", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Ensalada de la casa", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Aguacate", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Vegetales asados", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Frijoles", "precio_extra": 0, "certeza": "Suposición"}
    ]},
    {"key": "salsas", "nombre": "Salsas", "items": [
      {"label": "Chimichurri", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Guacamole", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Ají", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Salsa rosada", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Limón", "precio_extra": 0, "certeza": "Probable"}
    ]},
    {"key": "porciones_pollo", "nombre": "Porción de pollo", "items": [
      {"label": "Cuarto de pollo", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Medio pollo", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Pollo entero", "precio_extra": 0, "certeza": "Seguro"}
    ]},
    {"key": "tipo_presa", "nombre": "Presa de pollo", "items": [
      {"label": "Pechuga", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Pierna pernil", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Ala", "precio_extra": 0, "certeza": "Suposición"}
    ]},
    {"key": "proteinas_parrillada", "nombre": "Proteínas de la parrillada", "items": [
      {"label": "Res", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Pollo", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Cerdo", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Chorizo", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Morcilla", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Chunchullo", "precio_extra": 0, "certeza": "Probable"}
    ]}
  ],
  "grupos_tipicos": [
    {"id": "g_termino", "nombre": "Término", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "terminos_carne"}},
    {"id": "g_acomp_2", "nombre": "Acompañantes (elige 2)", "modo": "multi", "min": 2, "max": 2, "requerido": true, "fuente": {"lista": "acompanantes"}},
    {"id": "g_acomp_extra", "nombre": "Acompañante adicional", "modo": "multi", "min": 0, "max": 3, "requerido": false, "fuente": {"lista": "acompanantes"}},
    {"id": "g_salsa", "nombre": "Salsa", "modo": "multi", "min": 0, "max": 2, "requerido": false, "fuente": {"lista": "salsas"}},
    {"id": "g_porcion_pollo", "nombre": "Porción", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "porciones_pollo"}},
    {"id": "g_presa", "nombre": "Presa", "modo": "single", "min": 0, "max": 1, "requerido": false, "fuente": {"lista": "tipo_presa"}},
    {"id": "g_proteinas", "nombre": "Proteínas incluidas", "modo": "multi", "min": 1, "max": 6, "requerido": true, "fuente": {"lista": "proteinas_parrillada"}},
    {"id": "g_papa_tipo", "nombre": "Tipo de papa", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"items": [
      {"label": "Criolla", "precio_extra": 0},
      {"label": "Salada", "precio_extra": 0},
      {"label": "A la francesa", "precio_extra": 0},
      {"label": "En casco", "precio_extra": 0}
    ]}},
    {"id": "g_bebida_combo", "nombre": "Bebida del combo", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"items": [
      {"label": "Gaseosa", "precio_extra": 0},
      {"label": "Jugo natural", "precio_extra": 0},
      {"label": "Limonada", "precio_extra": 0}
    ]}}
  ],
  "platos_ejemplo": [
    {"nombre": "Churrasco", "categoria": "carnes_parrilla", "precio": 0, "grupos": ["g_termino", "g_acomp_2", "g_salsa"]},
    {"nombre": "Punta de anca", "categoria": "carnes_parrilla", "precio": 0, "grupos": ["g_termino", "g_acomp_2", "g_salsa"]},
    {"nombre": "Pollo asado", "categoria": "pollo_asado", "precio": 0, "grupos": ["g_porcion_pollo", "g_presa", "g_acomp_2", "g_salsa"]},
    {"nombre": "Costillas de cerdo BBQ", "categoria": "cerdo_parrilla", "precio": 0, "grupos": ["g_acomp_2", "g_salsa"]},
    {"nombre": "Chorizo a la parrilla", "categoria": "chorizos_achuras", "precio": 0, "grupos": ["g_salsa"]},
    {"nombre": "Parrillada para dos", "categoria": "parrilladas_picadas", "precio": 0, "grupos": ["g_proteinas", "g_acomp_extra", "g_salsa"]},
    {"nombre": "Picada de chorizo y morcilla", "categoria": "parrilladas_picadas", "precio": 0, "grupos": ["g_papa_tipo", "g_salsa"]},
    {"nombre": "Combo medio pollo", "categoria": "combos", "precio": 0, "grupos": ["g_acomp_2", "g_bebida_combo"]},
    {"nombre": "Porción de papa criolla", "categoria": "acompanantes", "precio": 0, "grupos": []}
  ]
}
```

## FUENTES

| Elemento | Enlace consultado | Certeza |
|---|---|---|
| Término de la carne (medio es el más pedido; la carta indica "en término") | https://www.semana.com/como/articulo/como-hacer-un-asado-tipico-colombiano-y-no-fallar-en-el-intento/202427/ | Probable |
| Escala de término (Rare, Medium Rare, Medium, Well Done) | https://forms.texasroadhouse.com/NMotion/Menus/Menu%20(I_1801_MNU-UAE).pdf | Seguro (referencia internacional) |
| Puntos en parrilla argentina (jugoso, a punto, bien cocido) | https://www.mdzol.com/tendencias/ni-entrana-ni-vacio-el-corte-favorito-los-argentinos-hacer-la-parrilla-n1574614 | Probable |
| Cortes argentinos (bife de chorizo, entraña, vacío, asado de tira), provoleta, chimichurri | https://matadornetwork.com/es/parrillas-de-buenos-aires-que-nadie-debe-perderse/ | Probable |
| "Elige dos acompañantes" por carne, chimichurri y guacamole, gramaje en crudo (La Colina, Colsubsidio; solo vía resumen de búsqueda) | https://www.colsubsidio.com/hubfs/documentos/colsubsidio/ayb/menu-club-la-colina-parrilla.pdf | Probable |
| Parrillada para dos (res, pollo, cerdo, chunchullo, chorizo, ubre, yuca, papa criolla, arepa) en Vaquero Parrilla | https://www.eltiempo.com/archivo/documento/mam-1530744 | Probable |
| Combo pollo entero + 2 acompañantes, y cuarto/medio/entero (Pollos Pucalor) | https://www.doordash.com/en-AU/business/pollos-pucalor-13995483/menu | Probable |
| Cuarto, medio y entero con papa salada, arepa y plátano; bandeja con yuca y ensalada (asaderos en Scribd, 2022) | https://es.scribd.com/document/418940296/Carta-Menu | Probable |
| Picada para dos con papa a elegir (francesa, criolla, casco, vapor, puré), arepa y ensalada (Scribd) | https://es.scribd.com/document/727197766/menu | Probable |
| Acompañantes típicos: plátano maduro, arepa, aguacate, papa | https://www.semana.com/como/articulo/como-hacer-un-asado-tipico-colombiano-y-no-fallar-en-el-intento/202427/ | Seguro |
| Dos acompañantes a elegir y lista de sides (Texas Roadhouse) | https://forms.texasroadhouse.com/NMotion/Menus/Menu%20(I_1801_MNU-UAE).pdf | Seguro (referencia internacional) |
| Toast: grupo obligatorio, sin selección múltiple, mínimo/máximo, visible en todos los canales | https://support.toasttab.com/en/article/Required-Optional-Modifiers | Seguro (competidor) |
| Toast: orden de visualización del grupo "Meat Temp" | https://support.toasttab.com/es-US/article/Editing-Managing-Modifier-Group-Display-Order | Seguro (competidor) |
| Wix Restaurants: grupo "Grado de cocción", min 1 / max 1 | https://support.wix.com/es/article/ajustes-del-grupo-modificador | Probable (no es competidor directo) |
| Loggro Restobar: recetas por producto e inventario (el término no debería descontar insumos) | https://apps.apple.com/us/app/loggro-restobar/id6480476721?l=es-MX | Suposición |
| Plantillas por tipo de negocio en Loggro, Siigo POS, Fudo, Square y Lightspeed | No se encontró documentación pública | Suposición |
| Categorías, gramajes, tipos de presa, frijoles, salsa rosada | Sin fuente directa, conocimiento general | Suposición |

## Dudas para un dueño real

1. Cuando el plato incluye "dos acompañantes", ¿cada acompañante extra se cobra aparte y a qué precio? ¿Alguno (aguacate, yuca, patacón) tiene recargo por ser premium?
2. ¿El término de la carne lleva solo tres opciones (medio, tres cuartos, bien cocido) o también jugoso? En asaderos populares, ¿siquiera se pregunta?
3. ¿Se vende por gramaje (250 g, 300 g, 400 g) como variante con precio distinto, o cada corte es un plato aparte?
4. En el pollo asado, ¿el cliente elige la presa (pechuga o pierna) y cobran más por la pechuga?
5. ¿El combo de pollo es de precio fijo, o se arma sumando porciones y acompañantes?
6. Las salsas (chimichurri, ají, guacamole), ¿son gratis, con límite por plato o se cobran?
7. ¿La parrillada o picada tiene proteínas fijas o el cliente elige la mezcla? ¿Cuántas personas comen por porción?
8. ¿Descuentan inventario por libra o gramo de carne cruda? ¿Les sirve que el término no afecte el inventario?
9. ¿El pollo entero y el medio se manejan como producto con stock limitado que se agota en el día?
10. ¿Qué pasa con la propina sugerida y el impoconsumo en su local? (afecta cómo se cobra el plato)
