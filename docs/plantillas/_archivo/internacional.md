# Plantilla: Comida internacional (key: internacional)

Subtipos cubiertos: **sushi/asiática**, **mexicana (tacos/burritos/nachos)** y **pasta/italiana**. Árabe queda como apoyo menor (categoría opcional).

Nota de método: había internet (WebSearch/WebFetch), pero casi ninguna carta oficial se pudo abrir completa (sitios bloqueados o sin carta pública). La mayoría de la evidencia sale de resúmenes de prensa, reseñas y guías; solo extraje nombres de opciones, sin precios ni textos. Por eso la certeza "Seguro" se usa solo cuando la opción aparece en 2 o más negocios distintos. Nada de Loggro ni Siigo POS pudo confirmarse (ver sección de competidores).

## Borrador JSON

```json
{
  "key": "internacional",
  "nombre": "Comida internacional (sushi, mexicana, pasta)",
  "descripcion": "Restaurante de cocina internacional con foco en sushi/asiática, mexicana (tacos, burritos, nachos) y pasta italiana. Incluye listas de proteínas, salsas, nivel de picante, tipos de pasta y adicionales.",
  "categorias": [
    {"value": "entradas", "label": "Entradas", "emoji": "🥟"},
    {"value": "rolls", "label": "Rolls y sushi", "emoji": "🍣"},
    {"value": "combos_sushi", "label": "Combos de sushi", "emoji": "🍱"},
    {"value": "calientes_asia", "label": "Platos calientes asiáticos", "emoji": "🍜"},
    {"value": "tacos", "label": "Tacos", "emoji": "🌮"},
    {"value": "burritos_quesadillas", "label": "Burritos y quesadillas", "emoji": "🌯"},
    {"value": "nachos", "label": "Nachos y para compartir", "emoji": "🧀"},
    {"value": "pastas", "label": "Pastas", "emoji": "🍝"},
    {"value": "pizzas", "label": "Pizzas", "emoji": "🍕"},
    {"value": "arabe", "label": "Árabe (shawarma y mezze)", "emoji": "🥙"},
    {"value": "postres", "label": "Postres", "emoji": "🍰"},
    {"value": "bebidas", "label": "Bebidas", "emoji": "🥤"}
  ],
  "listas": [
    {"key": "proteinas", "nombre": "Proteínas", "items": [
      {"label": "Pollo", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Res / carne asada", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Cerdo (al pastor / carnitas)", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Camarón", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Pescado / salmón", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Vegetariano (tofu / vegetales)", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Falafel", "precio_extra": 0, "certeza": "Probable"}
    ]},
    {"key": "salsas", "nombre": "Salsas", "items": [
      {"label": "Soya", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Anguila (unagi)", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Mayonesa picante (spicy mayo)", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Teriyaki", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Wasabi", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Salsa roja / pico de gallo", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Salsa verde", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Guacamole", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Crema agria", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Queso", "precio_extra": 0, "certeza": "Probable"}
    ]},
    {"key": "picante", "nombre": "Nivel de picante", "items": [
      {"label": "Sin picante", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Suave", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Medio", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Picante", "precio_extra": 0, "certeza": "Seguro"}
    ]},
    {"key": "tipos_pasta", "nombre": "Tipo de pasta", "items": [
      {"label": "Espagueti", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Fetuccini", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Penne", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Fusilli", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Linguini", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Ravioli", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Ñoquis", "precio_extra": 0, "certeza": "Probable"}
    ]},
    {"key": "salsas_pasta", "nombre": "Salsa de la pasta", "items": [
      {"label": "Boloñesa", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Carbonara", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Alfredo", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Pesto", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Pomodoro / napolitana", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Pollo con champiñones", "precio_extra": 0, "certeza": "Probable"}
    ]},
    {"key": "tortilla", "nombre": "Tortilla", "items": [
      {"label": "Maíz", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Harina", "precio_extra": 0, "certeza": "Probable"}
    ]},
    {"key": "tamano_roll", "nombre": "Tamaño / porción", "items": [
      {"label": "Roll completo (8-10 bocados)", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Medio roll", "precio_extra": 0, "certeza": "Suposición"},
      {"label": "Combo 20 piezas", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Combo 30 piezas", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Combo 50 piezas", "precio_extra": 0, "certeza": "Probable"}
    ]},
    {"key": "adicionales", "nombre": "Adicionales", "items": [
      {"label": "Queso extra", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Guacamole extra", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Proteína extra", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Tocineta", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Aguacate", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Queso crema", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Gyozas (porción)", "precio_extra": 0, "certeza": "Probable"}
    ]},
    {"key": "acompanante", "nombre": "Acompañantes", "items": [
      {"label": "Arroz", "precio_extra": 0, "certeza": "Seguro"},
      {"label": "Frijoles", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Papas fritas", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Ensalada", "precio_extra": 0, "certeza": "Probable"},
      {"label": "Pan pita", "precio_extra": 0, "certeza": "Probable"}
    ]}
  ],
  "grupos_tipicos": [
    {"id": "g_proteina", "nombre": "Proteína", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "proteinas"}},
    {"id": "g_picante", "nombre": "Nivel de picante", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "picante"}},
    {"id": "g_salsas", "nombre": "Salsas", "modo": "multi", "min": 0, "max": 3, "requerido": false, "fuente": {"lista": "salsas"}},
    {"id": "g_tortilla", "nombre": "Tortilla", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "tortilla"}},
    {"id": "g_tipo_pasta", "nombre": "Tipo de pasta", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "tipos_pasta"}},
    {"id": "g_salsa_pasta", "nombre": "Salsa de la pasta", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "salsas_pasta"}},
    {"id": "g_tamano", "nombre": "Tamaño / porción", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": {"lista": "tamano_roll"}},
    {"id": "g_adicionales", "nombre": "Adicionales", "modo": "multi", "min": 0, "max": 5, "requerido": false, "fuente": {"lista": "adicionales"}},
    {"id": "g_acompanante", "nombre": "Acompañante", "modo": "single", "min": 0, "max": 1, "requerido": false, "fuente": {"lista": "acompanante"}},
    {"id": "g_sin_ingrediente", "nombre": "Sin ingrediente", "modo": "multi", "min": 0, "max": 4, "requerido": false, "fuente": {"items": [
      {"label": "Sin cebolla", "precio_extra": 0},
      {"label": "Sin cilantro", "precio_extra": 0},
      {"label": "Sin queso", "precio_extra": 0},
      {"label": "Sin salsa", "precio_extra": 0}
    ]}}
  ],
  "platos_ejemplo": [
    {"nombre": "Roll de salmón y queso crema", "categoria": "rolls", "precio": 0, "grupos": ["g_salsas", "g_adicionales"]},
    {"nombre": "Combo de sushi", "categoria": "combos_sushi", "precio": 0, "grupos": ["g_tamano", "g_salsas"]},
    {"nombre": "Wok de arroz o fideos", "categoria": "calientes_asia", "precio": 0, "grupos": ["g_proteina", "g_picante", "g_sin_ingrediente"]},
    {"nombre": "Tacos (orden de 3)", "categoria": "tacos", "precio": 0, "grupos": ["g_proteina", "g_tortilla", "g_picante", "g_salsas", "g_sin_ingrediente"]},
    {"nombre": "Burrito", "categoria": "burritos_quesadillas", "precio": 0, "grupos": ["g_proteina", "g_picante", "g_adicionales", "g_acompanante"]},
    {"nombre": "Nachos con queso", "categoria": "nachos", "precio": 0, "grupos": ["g_proteina", "g_picante", "g_adicionales"]},
    {"nombre": "Pasta a elección", "categoria": "pastas", "precio": 0, "grupos": ["g_tipo_pasta", "g_salsa_pasta", "g_proteina", "g_adicionales"]},
    {"nombre": "Lasaña boloñesa", "categoria": "pastas", "precio": 0, "grupos": ["g_adicionales", "g_acompanante"]},
    {"nombre": "Shawarma", "categoria": "arabe", "precio": 0, "grupos": ["g_proteina", "g_salsas", "g_sin_ingrediente"]}
  ]
}
```

Notas de diseño: "Seguro" en listas viene de que la opción apareció en 2 o más negocios o plataformas. `precio_extra` va en 0 en todo: no encontré ninguna regla de recargo universal en Colombia. Los recargos de guacamole/queso/proteína extra existen en Chipotle (referencia internacional), pero el monto lo define cada dueño.

## Fuentes

Negocios en Colombia (resúmenes de prensa y reseñas; no se abrió ninguna carta oficial completa):

| Elemento | Enlace | Certeza |
|---|---|---|
| Sushi: rolls grandes, promoción de 10 rolls (Bushido) | https://www.las2orillas.co/el-restaurante-en-chapinero-donde-puede-comerse-10-rollos-gigantes-de-sushi-por-39-mil/ | Probable |
| Sushi: ~30 sabores de rolls, combos de 20/30/50 makis, gyozas como entrada (Sushi Bless) | https://www.las2orillas.co/el-restaurante-en-bogota-para-comer-sushi-de-calidad-desde-26-mil-ofrecen-mas-de-30-opciones/ | Probable |
| Sushi: nigiri, sashimi, rolls, tempura, teriyaki, ramen (Watakushi, Sushi Bushido Usaquén, Sushigozen) | https://www.expatexchange.com/rg/28589/sr-miyagi (listados Bogotá, ver también expatexchange.com/rg/33212/watakushi y /rg/33214/sushigozen) | Probable |
| Sushi: rolls de 8-10 bocados como unidad estándar | https://www.eltiempo.com/cultura/gastronomia/vuelve-la-semana-de-rollos-de-sushi-de-10-bocados-a-13-000-pesos-567946 | Probable |
| Asiática: Wok (Bogotá), arroces, ramen, curris, makis, fideos | https://flavorsofbogota.com/asian-restaurant-in-bogota-wok/ | Probable |
| Mexicana: tacos, quesadillas, burritos, nachos, flautas (Mi Pico E Gallo, Medellín) | https://medellinguru.com/2021/01/29/ | Probable |
| Mexicana: salsas caseras, tacos al pastor, picante (Orale; Sativa Taco y Chela; Enchiladas La Candelaria) | https://wanderlog.com/place/details/4056805/enchiladas-la-candelaria | Probable |
| Mexicana: tacos de pescado/carne asada/al pastor, nachos, tortillas (Santa Marta) | https://www.las2orillas.co/?p=926307 | Probable |
| Mexicana: salsas menos picantes adaptadas, cerdo desmechado (Chingada, Cartagena) | https://wanderlog.com/place/details/9869410/chingada-gastro-bar | Suposición |
| Pasta: espagueti, fetuccini, penne con salsas pesto, boloñesa, alfredo, carbonara (Sapore Divino) | https://www.las2orillas.co/los-carritos-de-pasta-que-estan-al-sur-de-bogota-y-le-ofrecen-almuerzo-desde-11-mil/ | Seguro |
| Pasta: fettuccine, ravioli, spaghetti, penne frescos (Il Castello); ravioli, tagliatelle, ñoquis (Tirrena) | https://medellinguru.com/il-castello/ | Probable |
| Pasta: fusilli, penne, spaghetti, fettuccine, linguine como los más pedidos; 21 tipos de pasta (Archies) | https://www.elespectador.com/gastronomia-y-recetas/archies-celebra-el-dia-internacional-de-la-pasta-con-un-viaje-a-italia/ | Probable |
| Pasta: ravioli, lasaña boloñesa/pollo, penne, linguine; 15 pizzas (Di Lucca) | https://www.larepublica.co/ocio/di-lucca-es-un-restaurante-clasico-italiano-que-lleva-25-anos-en-la-capital-del-pais-2288496 | Probable |
| Pasta: muchas pastas con elección de salsa, lasaña, pizzas, salmón con alfredo (Il Forno) | https://medellinguru.com/il-forno/ | Probable |
| Pasta: carbonara, pastas con carne molida, pollo, salchicha son comunes en Colombia | https://www.elheraldo.co/entretenimiento/gastronomia/2024/11/14/receta-para-preparar-una-pasta-carbonara-en-casa/ | Suposición |
| Árabe: shawarma de pollo/carne/cordero/falafel, hummus, baba ganoush (Habibi) | https://www.larepublica.co/ocio/del-shawarma-al-cordero-al-horno-asi-es-la-interesante-propuesta-gastronomica-de-habibi-4435810 | Probable |
| Árabe: hummus, shawarma, baba ganoush, mezze, kibbe (El Libanés, El Árabe) | https://wanderlog.com/place/details/10137906/el-libanés | Probable |

Referencia internacional:

| Elemento | Enlace | Certeza |
|---|---|---|
| Chipotle: proteína, arroz, frijoles, salsa suave/media/picante, guacamole extra (sitio oficial bloqueado; datos de guías de terceros) | https://www.theroastedroot.net/?p=78460 | Probable |
| Wagamama: categorías (principales, extras, acompañantes, postres, niños, sin gluten), filtros vegano/vegetariano | https://www.wagamama.com/menu | Probable |
| Black Wok (México): "elige base, 1 proteína, 1 salsa, 2 vegetales" | https://www.rappi.com.mx/restaurantes/1923258598-black-wok | Suposición |
| Olive Garden (pasta + salsa + proteína adicional): no se pudo abrir (403) | https://www.olivegarden.com/menu | Suposición |

## Cómo lo configuran los competidores

| Sistema | Qué encontré | Enlace | Certeza |
|---|---|---|---|
| Toast | Grupos de modificadores Opcional/Requerido, selección única o múltiple, mínimo/máximo solo en requeridos, duplicados permitidos; guía para armar bowls/tacos con 2 grupos (gratis requerido con min/max + adicionales pagos opcionales); visibilidad por canal afecta lo "requerido" | https://support.toasttab.com/es-US/article/Setting-Up-Your-BYO-Bowl-or-Taco-Menu-with-Modifier-Multi-Select-and-Duplicate-Modifiers | Seguro |
| Fudo | "Grupos modificadores" que cambian el precio final según adicionales; guía oficial no encontrada | https://www.infogastronomica.com.ar/repost-socialfudo-19/ | Probable |
| Lightspeed (Restaurant) | Modificadores = grupos de artículos asignados a producto o categoría | https://resto-support.lightspeedhq.com/hc/articles/226404648 | Probable |
| Square | Modificadores por artículo (solo ubicado el artículo de ayuda, no revisado en detalle) | https://squareup.com/help/us/es/article/5119-create-and-manage-item-modifiers | Suposición |
| Loggro, Siigo POS | Solo páginas comerciales (recetas y combos); sin documentación de modificadores ni plantillas por tipo de cocina | https://www.siigo.com/sistema-pos/restaurantes | Suposición |

Ningún competidor revisado ofrece plantillas por tipo de cocina visibles públicamente; todos parten de menú vacío y modificadores manuales. Esto es una conclusión parcial, no se vio panel de ninguno.

## Dudas para un dueño real

1. **Picante en sushi y pasta**: ¿se pregunta nivel de picante en todos los platos, solo en tacos/woks, o solo se ofrece salsa picante aparte? Define si `g_picante` es requerido o no.
2. **Cobro de adicionales**: ¿cobra aparte guacamole, queso, proteína extra, salsa extra de soya o jengibre/wasabi? ¿cuánto y desde qué cantidad es gratis?
3. **Combos de sushi**: ¿arma el cliente las piezas del combo (elige sus rolls) o son combos fijos por piezas (20/30/50)? Afecta si el combo es plato con grupos o producto compuesto.
4. **Pasta**: ¿el cliente escoge tipo de pasta y salsa libremente (Archies/Il Forno) o cada plato tiene pasta y salsa fijas? Si es libre, ¿cambia el precio por proteína?
5. **Tamaños**: ¿se vende roll completo y medio, o pasta en media porción? ¿tacos por unidad o por orden de 3?
6. **Bases de preparación**: ¿wok y bowls se arman por base + proteína + salsa + vegetales (modelo "arma tu plato")?
7. **Alergias y restricciones**: ¿qué avisos son obligatorios (gluten, mariscos, maní, lácteos)? ¿maneja opción vegetariana/vegana?
8. **Domicilio y plataformas**: ¿el menú de Rappi/domicilios.com lleva los mismos modificadores y precios que el local?
9. **Árabe**: ¿vale la pena subtipo propio (shawarma, mezze, kibbe) o basta como categoría?
