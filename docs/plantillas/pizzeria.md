# Plantilla: Pizzería (key: pizzeria)

> **AVISO DE ALCANCE (leer primero).** Hubo acceso a búsqueda web, pero `WebFetch` fue bloqueado para los sitios de las cadenas (dominos.com.co, papajohns.com.co, pizzahut.com.co, archies.com.co, Lightspeed devolvió 403). Solo pude leer resúmenes de búsqueda, no cartas completas. Resultado real: **cartas colombianas con detalle útil: 3** (Pizza Hut Medellín 2018, Pane e Pomodoro, Tremendas Pizzas) + 2 con detalle parcial (Hoteles Estelar, Archies); **referencia internacional: 2** (Papa John's España, Pizza Hut) + documentación de 4 POS. **No encontré nada de Loggro, Siigo POS ni Fudo.** El resto del borrador es conocimiento general y está marcado **Suposición**. Los números mínimos pedidos (5-10 colombianos, 3-5 internacionales) NO se cumplieron.

## Borrador JSON

```json
{
  "key": "pizzeria",
  "nombre": "Pizzería",
  "descripcion": "Pizzas por tamaño y masa, con borde, adiciones, opción mitad y mitad, además de entradas, pastas, bebidas y combos.",
  "categorias": [
    { "value": "pizzas_tradicionales", "label": "Pizzas tradicionales", "emoji": "🍕" },
    { "value": "pizzas_especiales", "label": "Pizzas especiales", "emoji": "🍕" },
    { "value": "pizzas_personales", "label": "Pizzas personales", "emoji": "🍕" },
    { "value": "entradas", "label": "Entradas y palitos", "emoji": "🧀" },
    { "value": "pastas", "label": "Pastas y lasañas", "emoji": "🍝" },
    { "value": "ensaladas", "label": "Ensaladas", "emoji": "🥗" },
    { "value": "combos", "label": "Combos", "emoji": "🎁" },
    { "value": "bebidas", "label": "Bebidas", "emoji": "🥤" },
    { "value": "postres", "label": "Postres", "emoji": "🍰" },
    { "value": "adiciones", "label": "Adiciones", "emoji": "➕" }
  ],
  "listas": [
    {
      "key": "tamanos_pizza",
      "nombre": "Tamaños de pizza",
      "items": [
        { "label": "Personal", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Mediana", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Grande", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Familiar / Extra grande", "precio_extra": 0, "certeza": "Probable" }
      ]
    },
    {
      "key": "masas",
      "nombre": "Tipos de masa",
      "items": [
        { "label": "Tradicional", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Delgada", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Pan / gruesa", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Integral", "precio_extra": 0, "certeza": "Suposición" }
      ]
    },
    {
      "key": "bordes",
      "nombre": "Bordes",
      "items": [
        { "label": "Sin borde relleno", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Queso", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Bocadillo con queso", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Salchicha", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Ajo / mantequilla", "precio_extra": 0, "certeza": "Suposición" }
      ]
    },
    {
      "key": "ingredientes_extra",
      "nombre": "Ingredientes extra",
      "items": [
        { "label": "Queso extra", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Jamón", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Pepperoni", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Pollo", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Champiñones", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Maíz tierno", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Piña", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Tocineta", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Aceitunas", "precio_extra": 0, "certeza": "Suposición" }
      ]
    },
    {
      "key": "salsas_dips",
      "nombre": "Salsas y dips",
      "items": [
        { "label": "Salsa de ajo", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Salsa BBQ", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Picante", "precio_extra": 0, "certeza": "Suposición" }
      ]
    },
    {
      "key": "bebidas_combo",
      "nombre": "Bebida del combo",
      "items": [
        { "label": "Gaseosa", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Jugo", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Agua", "precio_extra": 0, "certeza": "Suposición" }
      ]
    }
  ],
  "grupos_tipicos": [
    { "id": "g_tamano", "nombre": "Tamaño", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": { "lista": "tamanos_pizza" } },
    { "id": "g_masa", "nombre": "Masa", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": { "lista": "masas" } },
    { "id": "g_borde", "nombre": "Borde", "modo": "single", "min": 0, "max": 1, "requerido": false, "fuente": { "lista": "bordes" } },
    { "id": "g_mitades", "nombre": "¿Pizza entera o mitad y mitad?", "modo": "single", "min": 1, "max": 1, "requerido": true,
      "fuente": { "items": [ { "label": "Entera", "precio_extra": 0 }, { "label": "Mitad y mitad", "precio_extra": 0 } ] } },
    { "id": "g_adiciones", "nombre": "Ingredientes extra", "modo": "multi", "min": 0, "max": 5, "requerido": false, "fuente": { "lista": "ingredientes_extra" } },
    { "id": "g_salsas", "nombre": "Salsas", "modo": "multi", "min": 0, "max": 3, "requerido": false, "fuente": { "lista": "salsas_dips" } },
    { "id": "g_bebida_combo", "nombre": "Bebida", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": { "lista": "bebidas_combo" } }
  ],
  "platos_ejemplo": [
    { "nombre": "Pizza Hawaiana", "categoria": "pizzas_tradicionales", "precio": 0, "grupos": ["g_tamano", "g_masa", "g_borde", "g_mitades", "g_adiciones"] },
    { "nombre": "Pizza Pepperoni", "categoria": "pizzas_tradicionales", "precio": 0, "grupos": ["g_tamano", "g_masa", "g_borde", "g_mitades", "g_adiciones"] },
    { "nombre": "Pizza Pollo con Champiñones", "categoria": "pizzas_especiales", "precio": 0, "grupos": ["g_tamano", "g_masa", "g_borde", "g_mitades", "g_adiciones"] },
    { "nombre": "Pizza Margarita", "categoria": "pizzas_tradicionales", "precio": 0, "grupos": ["g_tamano", "g_masa", "g_borde", "g_adiciones"] },
    { "nombre": "Pizza Personal Jamón y Queso", "categoria": "pizzas_personales", "precio": 0, "grupos": ["g_masa", "g_adiciones"] },
    { "nombre": "Palitos de queso", "categoria": "entradas", "precio": 0, "grupos": ["g_salsas"] },
    { "nombre": "Lasaña de carne", "categoria": "pastas", "precio": 0, "grupos": [] },
    { "nombre": "Combo Pizza + Gaseosa", "categoria": "combos", "precio": 0, "grupos": ["g_tamano", "g_masa", "g_bebida_combo"] },
    { "nombre": "Gaseosa", "categoria": "bebidas", "precio": 0, "grupos": [] }
  ]
}
```

Notas de diseño (Suposición): el grupo `g_mitades` solo registra la elección; el motor actual no define cómo se elige el segundo sabor ni cómo se cobra (ver dudas). El nombre de tamaño puede no corresponder a los mismos centímetros entre negocios.

## FUENTES

| Elemento | Enlace consultado | Certeza |
|---|---|---|
| Tamaños (personal, regular/mediana, grande; hasta 4 niveles) | https://medellinguru.com/?p=17173 (Pizza Hut Medellín, 2018, vía resumen de búsqueda) | Seguro (también Papa John's, ver abajo) |
| 5 tipos de masa/borde en Pizza Hut (pan, tradicional, delgada, cheesy pops, borde de queso) | https://medellinguru.com/?p=17173 | Probable (un solo negocio, dato de 2018) |
| Borde de queso como opción | https://medellinguru.com/?p=17173 ; resultado "Tremendas Pizzas" https://www.pulzo.com/nacion/medellin/cual-es-pizza-grande-medellin-lugar-famosos-barrios-para-ir-volver-PP4348819 ; carta Hoteles Estelar (masa romana con borde de queso), hallada en búsqueda web (sin URL directa verificada) | Seguro |
| Ingredientes extra con precio por unidad (12 adiciones, un solo tamaño) | https://medellinguru.com/?p=14012 (Pane e Pomodoro) | Probable (precio fijo por adición, no por tamaño; un solo negocio) |
| Pizza personal con masa delgada y porciones/combo de porciones | https://ces.edu.co/wp-content/uploads/2021/08/Carta_2021_2.pdf (carta de cafetería, no pizzería pura) | Suposición |
| Personal + bebida como promo | https://www.valoraanalitik.com/archies-experiencias-gastronomicas-precios/ (Archies, noticia) | Probable |
| Nombre de producto = pizza + masa + tamaño (Original/Borde Mozzarella, Mediana/Familiar/XXL) | https://www.fatsecret.es/calor%C3%ADas-nutrici%C3%B3n/papa-johns/pizza-marinera-borde-mozzarella-familiar/100g (Papa John's España) | Probable (internacional) |
| Mitad y mitad: grupos de modificadores por mitad, cobro 50% por topping de media pizza, ticket "1ª/2ª mitad" | https://support.rezku.com/portal/en/kb/articles/pizza-pizza-products ; https://support.nextorder.com/half-and-half-setup-a-step-by-step-guide-for-pizza-stores-on-your-online-menu ; https://community.toasttab.com/t5/pizzeria/half-pizza/m-p/14953 ; https://o-series-support.lightspeedhq.com/hc/en-us/articles/31329297057435-Create-a-half-and-half-menu (solo título/resumen, 403 al abrir) | Seguro (patrón de los POS) |
| Precio de modificadores por tamaño (Toast) | https://support.toasttab.com/es-US/article/Product-Guide-Configuring-Size-Pricing-on-Modifier-Groups-and-Modifier-Options | Seguro |
| Square: un ítem por tamaño o variaciones, con modificadores "Todo / 1ª mitad / 2ª mitad" | https://community.squareup.com/t5/Archived-Discussions-Read-Only/How-we-can-arrange-a-modifier-for-different-size-for-an-item/m-p/116000 | Probable |
| Loggro, Siigo POS, Fudo: plantillas/config para pizzería | Sin resultados | No verificado |
| Categorías (entradas, pastas, ensaladas, combos, bebidas, postres) | Conocimiento general; Archies menciona pastas y desayunos (https://alsea.net/our-brands/archies) | Suposición |
| Sabores y adiciones concretos (jamón, pepperoni, maíz, bocadillo, tocineta...) | Conocimiento general | Suposición |

## Dudas para un dueño real

1. **Mitad y mitad:** ¿se cobra el precio de la más cara, el promedio, o cada mitad su precio? ¿Se permite con cualquier tamaño y masa? ¿Cómo debe verlo la cocina?
2. **Precio por tamaño:** ¿el precio base lo define cada sabor por tamaño, o hay un precio único por categoría (tradicional/especial) y tamaño? ¿Las adiciones y el borde cuestan distinto según el tamaño?
3. **Tamaños reales:** ¿cuántos manejan, cómo los llaman (personal, mediana, grande, familiar, porciones) y cuántas porciones/cm tiene cada uno?
4. **Bordes y masas:** ¿cuáles ofrecen de verdad (queso, bocadillo, salchicha) y cuáles cobran?
5. **Combos:** ¿cómo arman los combos (2 pizzas + bebida, pizza + palitos)? ¿Dejan elegir sabores dentro del combo?
6. **Vender por porción:** ¿venden porciones sueltas? ¿Se maneja como producto aparte?
7. **Domicilio:** ¿cobran empaque/caja por pizza o domicilio por zona? ¿Es un ítem aparte?
8. **Ingredientes sin costo:** ¿se pueden quitar ingredientes ("sin cebolla") y qué ingredientes extra son gratis (orégano, salsas)?
9. **Plataformas:** ¿venden por Rappi/Didi con otra carta o precios distintos?
