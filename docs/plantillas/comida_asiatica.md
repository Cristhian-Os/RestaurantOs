# Plantilla: Comida asiática sin sushi (key: comida_asiatica)

**Estado:** borrador de investigación. Todos los precios en 0.

**Aviso de método (leer primero):** La herramienta de lectura de páginas estuvo bloqueada (carta.menu respondió 403; medellinguru.com cortó la conexión). Solo se tuvieron RESÚMENES de búsqueda, no las cartas completas. Por eso, aplicando la regla estricta ("2 o más cartas colombianas leídas"), **ningún ítem se marcó "Seguro"**: lo que se repite en varios negocios colombianos según los resúmenes quedó "Probable", y el resto "Suposición". No se encontró documentación de modificadores de Loggro, Siigo POS ni Fudo (la búsqueda no los devolvió); de Toast sí se leyó (en resumen) la lógica de grupos requeridos/mínimos/máximos. No se copiaron textos ni fotos; solo nombres genéricos de opciones.

---

## PARTE A — Estudio de carta

Tendencia común: la comida asiática en Colombia es una mezcla de (1) "comida china" adaptada al paladar local (arroz chino con pollo, chop suey, agridulce) y (2) nichos más especializados (ramen, coreano, tailandés, vietnamita) concentrados en Bogotá y Medellín. Muchas cartas mezclan países; por eso la plantilla debe permitir categorías de varios orígenes sin forzar uno.

### 1. Comida china tipo chifa / comida corrida (arroz chino, chop suey, agridulce)

| Aspecto | Cómo funciona |
|---|---|
| Categorías y orden típico | Entradas (rollitos, wantán frito) > Sopas > Arroces > Chop suey / platos fuertes (agridulce, pollo/res/cerdo) > Fideos > Combos familiares > Bebidas > Postres |
| Qué elige el cliente | Proteína (pollo, res, cerdo, camarón), tamaño (personal / para compartir), acompañante (arroz chino, arroz blanco, fideos, papas), a veces nivel de picante |
| Combos y compartir | Combo "para dos" o familiar: una entrada + 2 platos + gaseosa; platos grandes pensados para compartir al centro |
| Diferencia clave | Carta larga (decenas de platos, p. ej. un local de Bogotá listó 57), poca personalización por paso y mucha variante por proteína. Domicilio fuerte |

### 2. Wok "arma el tuyo" (base + proteína + vegetales + salsa)

| Aspecto | Cómo funciona |
|---|---|
| Categorías y orden típico | Arma tu wok > Woks de la casa (preconfigurados) > Entradas > Bebidas > Postres |
| Qué elige el cliente (en pasos) | 1) Base (arroz o fideos), 2) proteína (una o dos porciones), 3) vegetales (varios), 4) salsa, 5) picante, 6) extras |
| Combos y compartir | Combo wok + entrada + bebida; porciones extra de proteína como adición |
| Diferencia clave | El producto es un "constructor": grupos obligatorios en secuencia. En referencia internacional (Take A Wok, México; cadenas de parrilla mongola) el orden es base, proteína, vegetales, salsa. No se halló un caso colombiano claro, por eso es Probable/Suposición |

### 3. Tailandesa y vietnamita

| Aspecto | Cómo funciona |
|---|---|
| Categorías y orden típico | Entradas (rollitos, ensaladas) > Sopas (pho, tom yum, tom kha) > Fideos salteados (pad thai) > Currys > Arroces > Bebidas > Postres |
| Qué elige el cliente | Proteína (pollo, res, cerdo, camarón, tofu/vegetariano), nivel de picante (central en la cocina tailandesa), a veces tamaño de la sopa (grande/regular) |
| Combos y compartir | Poco combo; más bien varios platos al centro. Mucho domicilio desde cocinas pequeñas |
| Diferencia clave | Carta corta y específica, platos con nombre propio de origen, picante como decisión obligatoria y tofu/vegetariano como variante habitual |

### 4. Coreana y ramen

| Aspecto | Cómo funciona |
|---|---|
| Categorías y orden típico | Coreano: Entradas/banchan > Bibimbap y arroces > Salteados (japchae) > Sopas/guisos > Parrilla de carnes > Bebidas. Ramen: Ramen > Gyozas y entradas > Arroces > Bebidas |
| Qué elige el cliente | Coreano: proteína, picante, a veces acompañamientos (kimchi, encurtidos). Ramen: tipo de caldo (tonkotsu, shoyu, miso, picante), toppings extra (huevo marinado, chashu, maíz, alga), picante |
| Combos y compartir | Parrilla coreana: se comparte la carne al centro con acompañamientos; ramen: ramen + gyozas como combo |
| Diferencia clave | Ramen: carta muy corta, el caldo es la decisión central y los toppings suben el ticket. Coreano: muchos acompañamientos incluidos |

### 5. Delivery de comida asiática (cocina oculta / dark kitchen)

| Aspecto | Cómo funciona |
|---|---|
| Categorías y orden típico | Combos > Más pedidos > Woks y arroces > Entradas > Sopas > Bebidas |
| Qué elige el cliente | Lo mismo que en su subtipo, más "salsas extra", cubiertos/palillos y combos con bebida |
| Combos y compartir | Combos individuales y para dos/familiares como principal gancho; palillos y salsas extra como adicionales |
| Diferencia clave | Carta compacta, combos al frente, empaque (porción personal vs. para compartir) y control de picante por escrito |

---

## PARTE B — Borrador de plantilla (JSON)

```json
{
  "key": "comida_asiatica",
  "nombre": "Comida asiática (sin sushi)",
  "descripcion": "Restaurante o domicilio de comida china, wok arma-tu-wok, tailandesa, vietnamita, coreana, ramen y fideos.",
  "categorias": [
    {"value": "entradas_asiaticas", "label": "Entradas", "emoji": "🥟"},
    {"value": "sopas_asiaticas", "label": "Sopas", "emoji": "🍲"},
    {"value": "arroces_asiaticos", "label": "Arroces", "emoji": "🍚"},
    {"value": "platos_fuertes_asiaticos", "label": "Platos fuertes", "emoji": "🍗"},
    {"value": "wok_arma_tu_wok", "label": "Arma tu wok", "emoji": "🥡"},
    {"value": "fideos_asiaticos", "label": "Fideos y ramen", "emoji": "🍜"},
    {"value": "coreano_asiatico", "label": "Coreano", "emoji": "🥘"},
    {"value": "combos_compartir", "label": "Combos para compartir", "emoji": "🍱"},
    {"value": "bebidas_asiaticas", "label": "Bebidas", "emoji": "🧋"},
    {"value": "postres_asiaticos", "label": "Postres", "emoji": "🍡"}
  ],
  "listas": [
    {"key": "rellenos_entrada_asiatica", "nombre": "Relleno de la entrada", "items": [
      {"label": "Cerdo", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Pollo", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Vegetales", "precio_extra": 0, "certeza": "Probable"}
    ]},
    {"key": "coccion_gyoza_asiatica", "nombre": "Cocción de las gyoza", "items": [
      {"label": "Al vapor", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "A la plancha", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Fritas", "precio_extra": 0, "certeza": "Suposición"}
    ]},
    {"key": "salsas_dip_asiatica", "nombre": "Salsas para mojar", "items": [
      {"label": "Agridulce", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Soya con jengibre", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Picante suave", "precio_extra": 0, "certeza": "Suposición"}
    ]},
    {"key": "tamano_asiatica", "nombre": "Tamaño de la porción", "items": [
      {"label": "Personal", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Para compartir", "precio_extra": 0, "certeza": "Suposición"}
    ]},
    {"key": "proteinas_asiatica", "nombre": "Proteínas", "items": [
      {"label": "Pollo", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Res", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Cerdo", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Camarón", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Tofu", "precio_extra": 0, "certeza": "Probable"}
    ]},
    {"key": "acompanante_plato_asiatica", "nombre": "Acompañante del plato", "items": [
      {"label": "Arroz chino", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Arroz blanco", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Fideos salteados", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Papas fritas", "precio_extra": 0, "certeza": "Suposición"}
    ]},
    {"key": "bases_wok_asiatica", "nombre": "Base del wok", "items": [
      {"label": "Arroz blanco", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Arroz frito", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Fideos de huevo", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Fideos de arroz", "precio_extra": 0, "certeza": "Suposición"}
    ]},
    {"key": "vegetales_wok_asiatica", "nombre": "Vegetales del wok", "items": [
      {"label": "Brócoli", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Zanahoria", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Pimentón", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Cebolla", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Repollo / bok choy", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Champiñones", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Maíz tierno", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Cebollín", "precio_extra": 0, "certeza": "Probable"}
    ]},
    {"key": "salsas_wok_asiatica", "nombre": "Salsa del wok", "items": [
      {"label": "Soya", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Teriyaki", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Agridulce", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Ajo y jengibre", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Salsa de ostras", "precio_extra": 0, "certeza": "Suposición"}
    ]},
    {"key": "nivel_picante_asiatica", "nombre": "Nivel de picante", "items": [
      {"label": "Sin picante", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Suave", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Medio", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Picante", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Extra picante", "precio_extra": 0, "certeza": "Suposición"}
    ]},
    {"key": "caldo_ramen_asiatica", "nombre": "Caldo del ramen", "items": [
      {"label": "Tonkotsu (cerdo)", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Shoyu (soya)", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Miso", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Picante", "precio_extra": 0, "certeza": "Suposición"}
    ]},
    {"key": "toppings_ramen_asiatica", "nombre": "Toppings del ramen", "items": [
      {"label": "Huevo marinado", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Cerdo chashu extra", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Maíz", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Alga nori", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Cebollín extra", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Porción extra de fideos", "precio_extra": 0, "certeza": "Suposición"}
    ]},
    {"key": "proteinas_coreano_asiatica", "nombre": "Proteína del plato coreano", "items": [
      {"label": "Res marinada", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Cerdo picante", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Pollo", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Tofu / vegetariano", "precio_extra": 0, "certeza": "Suposición"}
    ]},
    {"key": "banchan_asiatica", "nombre": "Acompañamientos coreanos", "items": [
      {"label": "Kimchi", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Rábano encurtido", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Pepino picante", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Huevo frito", "precio_extra": 0, "certeza": "Suposición"}
    ]},
    {"key": "entrada_combo_asiatica", "nombre": "Entrada del combo", "items": [
      {"label": "Gyozas", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Rollitos primavera", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Wantán frito", "precio_extra": 0, "certeza": "Suposición"}
    ]},
    {"key": "plato_combo_asiatica", "nombre": "Plato del combo", "items": [
      {"label": "Arroz chino", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Chop suey", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Pollo agridulce", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Fideos salteados", "precio_extra": 0, "certeza": "Suposición"}
    ]},
    {"key": "sabor_te_asiatica", "nombre": "Sabor del té frío", "items": [
      {"label": "Limón", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Durazno", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Jazmín", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Maracuyá", "precio_extra": 0, "certeza": "Suposición"}
    ]}
  ],
  "grupos_tipicos": [
    {"id": "g_relleno", "nombre": "Relleno", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "rellenos_entrada_asiatica"}},
    {"id": "g_coccion_gyoza", "nombre": "Cocción de las gyoza", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "coccion_gyoza_asiatica"}},
    {"id": "g_salsas_dip", "nombre": "Salsas para mojar", "modo": "multi", "min": 0, "max": 2, "requerido": false, "fuente": {"lista": "salsas_dip_asiatica"}},
    {"id": "g_tamano", "nombre": "Tamaño", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "tamano_asiatica"}},
    {"id": "g_proteina_plato", "nombre": "Proteína del plato", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "proteinas_asiatica"}},
    {"id": "g_proteina_extra", "nombre": "Proteína extra", "modo": "single", "min": 0, "max": 1, "requerido": false, "fuente": {"lista": "proteinas_asiatica"}},
    {"id": "g_acompanante", "nombre": "Acompañante", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "acompanante_plato_asiatica"}},
    {"id": "g_base_wok", "nombre": "Base del wok", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "bases_wok_asiatica"}},
    {"id": "g_proteina_wok", "nombre": "Proteínas del wok", "modo": "multi", "min": 1, "max": 2, "requerido": true, "fuente": {"lista": "proteinas_asiatica"}},
    {"id": "g_vegetales_wok", "nombre": "Vegetales del wok", "modo": "multi", "min": 0, "max": 4, "requerido": false, "fuente": {"lista": "vegetales_wok_asiatica"}},
    {"id": "g_salsa_wok", "nombre": "Salsa del wok", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "salsas_wok_asiatica"}},
    {"id": "g_picante", "nombre": "Nivel de picante", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "nivel_picante_asiatica"}},
    {"id": "g_caldo_ramen", "nombre": "Caldo del ramen", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "caldo_ramen_asiatica"}},
    {"id": "g_toppings_ramen", "nombre": "Toppings del ramen", "modo": "multi", "min": 0, "max": 3, "requerido": false, "fuente": {"lista": "toppings_ramen_asiatica"}},
    {"id": "g_proteina_coreana", "nombre": "Proteína del plato coreano", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "proteinas_coreano_asiatica"}},
    {"id": "g_banchan", "nombre": "Acompañamientos coreanos", "modo": "multi", "min": 0, "max": 2, "requerido": false, "fuente": {"lista": "banchan_asiatica"}},
    {"id": "g_combo_entrada", "nombre": "Entrada del combo", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "entrada_combo_asiatica"}},
    {"id": "g_combo_plato", "nombre": "Plato del combo", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "plato_combo_asiatica"}},
    {"id": "g_sabor_te", "nombre": "Sabor del té frío", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "sabor_te_asiatica"}}
  ],
  "platos_ejemplo": [
    {"nombre": "Gyozas", "categoria": "entradas_asiaticas", "precio": 0, "grupos": ["g_relleno", "g_coccion_gyoza", "g_salsas_dip"]},
    {"nombre": "Rollitos primavera", "categoria": "entradas_asiaticas", "precio": 0, "grupos": ["g_relleno", "g_salsas_dip"]},
    {"nombre": "Sopa wantán", "categoria": "sopas_asiaticas", "precio": 0, "grupos": ["g_tamano"]},
    {"nombre": "Arroz chino de la casa", "categoria": "arroces_asiaticos", "precio": 0, "grupos": ["g_tamano", "g_proteina_extra"]},
    {"nombre": "Chop suey", "categoria": "platos_fuertes_asiaticos", "precio": 0, "grupos": ["g_proteina_plato", "g_tamano", "g_acompanante"]},
    {"nombre": "Pollo agridulce", "categoria": "platos_fuertes_asiaticos", "precio": 0, "grupos": ["g_tamano", "g_acompanante"]},
    {"nombre": "Arma tu wok", "categoria": "wok_arma_tu_wok", "precio": 0, "grupos": ["g_base_wok", "g_proteina_wok", "g_vegetales_wok", "g_salsa_wok", "g_picante"]},
    {"nombre": "Pad thai", "categoria": "fideos_asiaticos", "precio": 0, "grupos": ["g_proteina_plato", "g_picante"]},
    {"nombre": "Ramen de la casa", "categoria": "fideos_asiaticos", "precio": 0, "grupos": ["g_caldo_ramen", "g_toppings_ramen", "g_picante"]},
    {"nombre": "Bibimbap", "categoria": "coreano_asiatico", "precio": 0, "grupos": ["g_proteina_coreana", "g_picante", "g_banchan"]},
    {"nombre": "Combo para dos", "categoria": "combos_compartir", "precio": 0, "grupos": ["g_combo_entrada", "g_combo_plato"]},
    {"nombre": "Té frío de la casa", "categoria": "bebidas_asiaticas", "precio": 0, "grupos": ["g_sabor_te"]},
    {"nombre": "Banano frito con helado", "categoria": "postres_asiaticos", "precio": 0, "grupos": []}
  ]
}
```

Notas de diseño: las listas `proteinas_asiatica` y `nivel_picante_asiatica` se reutilizan en varios grupos (un grupo opcional y otro obligatorio con distinto min/max). Los dos grupos de combo solo ofrecen platos que existen en la carta de ejemplo. El plato "Banano frito con helado" no lleva grupos (postre sin elecciones).

---

## FUENTES

Todas consultadas solo como RESUMEN de búsqueda (lectura directa bloqueada). Ningún ítem alcanza "Seguro" por la regla estricta.

| Elemento | URL consultada | Certeza |
|---|---|---|
| Mandarin Express (Suba, Bogotá): chop suey especial, carta de 57 platos, entrega | https://carta.menu/restaurants/suba/mandarin-express/menu | Probable |
| Sr. Kim (Suba, Bogotá): bibimbap, japchae, ramen | https://carta.menu/restaurants/suba/sr-kim | Probable |
| Casa de Corea (Bogotá): kimchi soup, bulgogi, japchae, bibimbap | https://wanderlog.com/place/details/3495794 | Probable |
| Gogi (Calle 93, Bogotá): parrilla coreana, kimchi, tteokbokki | https://www.las2orillas.co/?p=819606 | Probable |
| Lemoncillo (Envigado): pho, pad thai, curry de coco, rollitos | https://wanderlog.com/place/details/1298847/restaurante-lemoncillo | Probable |
| Khlua Thai (Envigado): pad thai, pad khi mao, tom yum de fideos, domicilio | https://medellinguru.com/khlua-thai/ | Probable |
| District 1 (Laureles): sopas tipo pho, tamaño grande | https://medellinguru.com/?p=20005 | Probable |
| Shirai Ramen (Bogotá): tonkotsu | https://wanderlog.com/place/details/2408011/shirai-ramen | Probable |
| Menya Umai (Bogotá): tonkotsu y gyoza, carta corta | https://wanderlog.com/place/details/10319587/menya-umai | Probable |
| Douraku (Medellín): caldo, chashu, mantequilla en fideos | https://wanderlog.com/place/details/2634049 | Probable |
| Sumo Ramen (Medellín): gyozas, ramen adaptado | https://wanderlog.com/place/details/1501841/sumo-ramen | Probable |
| Chifa Loo (Bogotá): chifa, arroz chaufa, lomo saltado | https://www.latercera.com/la-tercera-sabado/noticia/critica-gastronomica-de-don-tinto-chifa-capon-falto-un-poquito/4PDXJCFOS5CY5M7G2UQGLQP6OE/ | Suposición |
| Arroz chino colombiano (versión local con pollo) | https://www.eltiempo.com/cultura/recetas/arroz-chino-colombiano-que-lo-hace-unico-775603 | Probable |
| Oferta asiática mixta en Bogotá (columna) | https://www.eltiempo.com/cultura/gastronomia/critica-gastronomica-un-vietnamita-en-el-patrono-593448 | Suposición |
| Take A Wok (México, referencia): wok ármalo con base, proteína, ingredientes y salsa | https://www.rappi.com.mx/restaurantes/990005231-take-a-wok | Probable (internacional) |
| Parrilla mongola "arma tu bowl" (referencia EE. UU.): proteína, vegetales, fideos/arroz, salsa | https://www.travelok.com/at/listings/view.profile/id.15452 | Probable (internacional) |
| Toast: grupos requeridos, mínimo/máximo | https://support.toasttab.com/en/article/Required-Optional-Modifiers | Probable (internacional) |
| Toast: definición de ModifierGroup | https://doc.toasttab.com/openapi/menus/tag/Data-definitions/schema/ModifierGroup/ | Probable (internacional) |
| Loggro, Siigo POS, Fudo, Square, Lightspeed | No se obtuvo ninguna página (la búsqueda no los devolvió) | Sin dato |
| Tamaños "Personal / Para compartir", extras, combos, listas de aderezos | Conocimiento propio | Suposición |

## Dudas para un dueño real

1. **¿Cómo se cobra el wok "arma el tuyo"?** ¿Precio fijo por plato con base+proteína+salsa, o cada proteína/vegetal extra suma? Esto define si hace falta `precio_extra` por opción o por cantidad (por ejemplo, "dos proteínas" vs. "una").
2. **¿Cuántos gramos o cuántas personas tiene "Personal" y "Para compartir"?** En comida china colombiana el tamaño cambia el precio y cómo se arma el combo; hay que confirmar si usan "media/completa", "personal/familiar" o por número de personas.
3. ¿El arroz chino y los platos fuertes ya traen acompañante incluido, o se elige y se cobra aparte?
4. ¿El nivel de picante lo manejan realmente en escala o solo "con/sin picante"? En tailandés y coreano conviene la escala completa.
5. ¿Venden bebidas calientes asiáticas (té) o solo gaseosas y jugos? Las opciones de té de esta plantilla son una suposición.
