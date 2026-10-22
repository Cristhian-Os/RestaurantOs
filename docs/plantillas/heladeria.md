# Plantilla: Heladería (key: heladeria)

**Nota de método (leer primero):** hubo acceso a internet, pero solo a resúmenes de búsqueda web (WebSearch) y a una página en PDF que no se pudo leer (menú Colsubsidio). Ninguna carta oficial se abrió completa. Prensa y agregadores traen precios desactivados aquí a propósito: no se copió ningún precio, texto ni foto, solo nombres de opciones y categorías. De los competidores (Loggro, Siigo POS, Fudo, Toast, Lightspeed) NO se encontró documentación sobre plantillas de heladería; solo Square, Odoo POS, Paloma365 y SalesPlay. Lo que no está respaldado por una fuente va marcado como Suposición.

Negocios consultados: 7 de Colombia (Hotel Colsubsidio, Topping Gelato, Capriccio, Dito, Mimo's, Crepes & Waffles, Popsy) y 4 internacionales (Baskin-Robbins, Cold Stone, Dairy Queen, Ben & Jerry's). Todos vía resumen de búsqueda, no carta completa.

```json
{
  "key": "heladeria",
  "nombre": "Heladería",
  "descripcion": "Heladería con helado por bolas, copas, sundaes, malteadas, waffles y toppings. Sabores, salsas y toppings como listas reutilizables; precios en cero para que el dueño los ponga.",
  "categorias": [
    {"value": "helados", "label": "Helados", "emoji": "🍦"},
    {"value": "copas", "label": "Copas y Sundaes", "emoji": "🍨"},
    {"value": "malteadas", "label": "Malteadas", "emoji": "🥤"},
    {"value": "waffles_obleas", "label": "Waffles y Obleas", "emoji": "🧇"},
    {"value": "frutas", "label": "Frutas y Ensaladas", "emoji": "🍓"},
    {"value": "bebidas", "label": "Bebidas", "emoji": "🧃"},
    {"value": "adicionales", "label": "Adicionales", "emoji": "🍫"}
  ],
  "listas": [
    {"key": "sabores_helado", "nombre": "Sabores de helado", "items": [
      {"label": "Vainilla", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Chocolate", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Fresa", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Arequipe", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Ron con pasas", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Limón", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Mora", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Café", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Cookies and cream", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Maracuyá", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Coco", "precio_extra": 0, "certeza": "Suposición"}
    ]},
    {"key": "salsas", "nombre": "Salsas", "items": [
      {"label": "Arequipe", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Chocolate", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Caramelo", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Frutos rojos", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Mora", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Fresa", "precio_extra": 0, "certeza": "Probable"}
    ]},
    {"key": "toppings", "nombre": "Toppings", "items": [
      {"label": "Crema chantilly", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Chispas de colores", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Nueces o maní", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Galleta triturada", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Fresas", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Brownie", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Krispies con chocolate", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Cereza", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Gomitas o dulces", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Barquillo", "precio_extra": 0, "certeza": "Suposición"}
    ]},
    {"key": "recipientes", "nombre": "Recipiente", "items": [
      {"label": "Vaso", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Cono", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Cono waffle", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Cono bañado en chocolate", "precio_extra": 0, "certeza": "Probable"}
    ]},
    {"key": "frutas_batido", "nombre": "Frutas para malteada o batido", "items": [
      {"label": "Fresa", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Mora", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Banano", "precio_extra": 0, "certeza": "Suposición"}
    ]}
  ],
  "grupos_tipicos": [
    {"id": "g_tamano", "nombre": "Tamaño", "modo": "single", "min": 1, "max": 1, "requerido": true,
     "fuente": {"items": [
       {"label": "Pequeño", "precio_extra": 0},
       {"label": "Mediano", "precio_extra": 0},
       {"label": "Grande", "precio_extra": 0}]}},
    {"id": "g_bolas", "nombre": "Número de bolas", "modo": "single", "min": 1, "max": 1, "requerido": true,
     "fuente": {"items": [
       {"label": "1 bola", "precio_extra": 0},
       {"label": "2 bolas", "precio_extra": 0},
       {"label": "3 bolas", "precio_extra": 0}]}},
    {"id": "g_sabores", "nombre": "Sabores", "modo": "multi", "min": 1, "max": 3, "requerido": true,
     "fuente": {"lista": "sabores_helado"}},
    {"id": "g_recipiente", "nombre": "Recipiente", "modo": "single", "min": 1, "max": 1, "requerido": true,
     "fuente": {"lista": "recipientes"}},
    {"id": "g_salsa", "nombre": "Salsa", "modo": "single", "min": 0, "max": 1, "requerido": false,
     "fuente": {"lista": "salsas"}},
    {"id": "g_toppings", "nombre": "Toppings", "modo": "multi", "min": 0, "max": 4, "requerido": false,
     "fuente": {"lista": "toppings"}},
    {"id": "g_sabor_malteada", "nombre": "Sabor de la malteada", "modo": "single", "min": 1, "max": 1, "requerido": true,
     "fuente": {"lista": "sabores_helado"}},
    {"id": "g_frutas", "nombre": "Fruta", "modo": "multi", "min": 0, "max": 2, "requerido": false,
     "fuente": {"lista": "frutas_batido"}}
  ],
  "platos_ejemplo": [
    {"nombre": "Helado por bolas", "categoria": "helados", "precio": 0, "grupos": ["g_bolas", "g_sabores", "g_recipiente", "g_toppings"]},
    {"nombre": "Cono sencillo", "categoria": "helados", "precio": 0, "grupos": ["g_tamano", "g_sabores", "g_recipiente"]},
    {"nombre": "Sundae", "categoria": "copas", "precio": 0, "grupos": ["g_tamano", "g_sabores", "g_salsa", "g_toppings"]},
    {"nombre": "Copa de la casa", "categoria": "copas", "precio": 0, "grupos": ["g_sabores", "g_salsa", "g_toppings"]},
    {"nombre": "Banana split", "categoria": "copas", "precio": 0, "grupos": ["g_sabores", "g_salsa", "g_toppings"]},
    {"nombre": "Malteada", "categoria": "malteadas", "precio": 0, "grupos": ["g_tamano", "g_sabor_malteada", "g_toppings"]},
    {"nombre": "Waffle con helado", "categoria": "waffles_obleas", "precio": 0, "grupos": ["g_sabores", "g_salsa", "g_toppings"]},
    {"nombre": "Oblea con helado", "categoria": "waffles_obleas", "precio": 0, "grupos": ["g_sabores", "g_salsa", "g_toppings"]},
    {"nombre": "Fresas con crema y helado", "categoria": "frutas", "precio": 0, "grupos": ["g_sabores", "g_frutas"]}
  ]
}
```

Reglas aplicadas: todos los precios y precio_extra en 0 (en las fuentes los extras varían por local y no hay una regla universal; lo único recurrente es "el primer topping/mix-in gratis y los siguientes cobran", ver Dudas). Los grupos `g_sabores` y `g_sabor_malteada` reutilizan la misma lista.

## Fuentes

| Elemento | Enlace consultado | Certeza |
|---|---|---|
| Categorías: copas, malteadas, banana split, cholado, ensaladas de frutas, batidos, gofres con helado | https://cms.colsubsidio.com/sites/default/files/2026-01/menu-heladeria-hotel-colsubsidio-penalisa.pdf (solo resumen de búsqueda; el PDF no se pudo leer) y https://es.scribd.com/document/852027903/menu | Probable |
| Helado por cantidad de sabores (1, 2, 3), en copa o cono; sabores locales | https://es.scribd.com/document/852027903/menu (Topping Gelato, vía resumen de búsqueda; no se abrió la carta) | Probable |
| Sabores clásicos y combinaciones (fleur de lait, capuchino, pistacho, tres leches, mora, cheesecake) | https://wanderlog.com/place/details/1434219/heladería-capriccio-naturalmente-italiano y https://wanderlog.com/place/details/3541610/dito-heladería-artesanal | Probable |
| Salsas: arequipe, chocolate, caramelo, frutos rojos; sundae con salsa o fruta | https://www.las2orillas.co/?p=945116 y https://www.pulzo.com/economia/helados-mimos-tiene-menu-secreto-que-vende-como-es-como-se-pide-PP3851583A (Mimo's) | Seguro |
| Topping extra con recargo; krispies con chocolate; oblea con helado | https://www.pulzo.com/economia/helados-mimos-tiene-menu-secreto-que-vende-como-es-como-se-pide-PP3851583A | Probable |
| Copas con nombre (Vesubio, Tentación, etc.), chantilly, nueces, salsas; helado en piedra con 2 sabores y varios toppings | https://lakalle.bluradio.com/entretenimiento/ocio/la-deliciosa-copa-de-helado-de-crepes-waffles-que-puedes-conseguir-por-solo-10-600-so35 | Probable |
| Más de 40 sabores, línea de salsas para helados | https://www.pulzo.com/economia/popsy-heladeria-colombiana-quienes-duenos-importante-negocio-PP2733394 y https://www.larepublica.co/empresas/crem-helado-popsy-y-mimo-s-las-marcas-que-lideran-en-el-mercado-de-los-helados-3496750 | Probable |
| Internacional: bolas sencilla/doble/niño, conos waffle (con recargo), sundaes por número de bolas, topping extra con recargo | https://www.thepricer.org/baskin-robbins-menu-prices/ (Baskin-Robbins) | Probable |
| Internacional: tres tamaños, primer mix-in incluido y extras con recargo, cono o vaso aparte | https://coldstonecreamery.com/faqs/icecream y https://www.universalorlando.com/web/en/us/things-to-do/dining/cold-stone-creamery/menu.html | Probable |
| Internacional: Blizzard en tres tamaños, sundaes con fudge/caramelo/fresa, banana split | https://nobleriot.com/dairy-queen-ice-cream-menu-prices-overview/ (agregador de baja calidad) | Suposición |
| Internacional: vaso, cono waffle/azúcar, cono bañado, sundae, malteada con 2 sabores a elección | https://www.benjerry.com/whats-new/2016/scoop-shop-secrets y https://www.thepricer.org/?p=15106 | Probable |
| Tamaño Pequeño/Mediano/Grande como grupo propio | Cold Stone y Dairy Queen (arriba); en Colombia solo se vio por número de sabores, no por tamaño | Probable |
| Competidor Square: sabores como modificador multi-selección, número de bolas como ítem aparte, conos como ítem o modificador, toppings genérico o por tipo; límite con muchos sabores | https://community.squareup.com/t5/Hardware-Setup-Troubleshooting/Items-Create-split-scoop-option-for-ice-cream-shop/m-p/733622/highlight/true y https://kitchenbusiness.com/best-ice-cream-shop-pos/ | Probable |
| Competidores Odoo/Paloma365/SalesPlay: grupos de modificadores reutilizables, asignables a producto o categoría | https://apps.odoo.com/apps/modules/18.0/eg_pos_product_modifiers y https://dashboard.paloma365.com/docs/en/pos/modifier y https://help.salesplaypos.com/help/modifiers | Probable |
| Loggro, Siigo POS, Fudo, Toast, Lightspeed: sin documentación de plantillas de heladería encontrada | https://techcrunch.com/2022/08/19/andreessen-atlantico-maya-capital-fudos-seed-restaurant-tech (solo descripción general de Fudo) | Suposición |
| Sabores "Cookies and cream", "Maracuyá", "Coco", "Barquillo", frutas de batido, categoría "Bebidas" y "Adicionales" | Sin fuente directa; conocimiento general | Suposición |

## Dudas para un dueño real

1. **Cómo cobra:** ¿por bola, por tamaño de copa/cono, por peso, o por combinación? Esto define si el tamaño y las bolas son grupos separados (como en la plantilla) o precios distintos por producto.
2. **Toppings y salsas:** ¿el primero va incluido y los demás se cobran, o todo se cobra? ¿Un solo precio para todos o distinto por topping? (Es la regla que más se repite afuera, pero no está confirmada en Colombia.)
3. **Sabores:** ¿cuántos manejan, rotan por temporada, y se agotan en el día? ¿Hace falta marcar "agotado" en el POS?
4. **Combinar sabores:** ¿una malteada o copa permite mezclar dos sabores y a veces cobra distinto?
5. **Cono o vaso:** ¿se cobra aparte (cono waffle, bañado) o va incluido?
6. **Productos que no sean helado:** ¿venden cholado, oblea, fresas con crema, café, bebidas, helado de licor? ¿Cuáles son su mayor venta?
7. **Combos y promociones:** ¿martes de copas, 2x1, combos familiares, helado por litro o para llevar? ¿Cómo los cobra?
8. **Inventario:** ¿controlan el helado por galón/tarro o por bola? ¿Los toppings se descuentan o se toman a ojo?
9. **Domicilio y mesa:** ¿atienden en mesa, mostrador o domicilio? ¿Algún producto no sale a domicilio (se derrite)?
10. **Impuesto:** ¿el precio de la carta incluye el 8 % de impuesto al consumo, como en la carta de Colsubsidio?
