# Revisión independiente de plantillas (Anexo B 3.1)

Fecha: 2026-10-16. Revisor sin participación en la redacción. Se revisaron los 13 borradores `*.md` de esta carpeta. No se modificó ningún otro archivo.

**Método:** extracción del bloque ```json de cada archivo y validación con un script de Python (parseo, referencias cruzadas, precios, modo/min/max/requerido, duplicados, solapes entre archivos) más lectura completa de los 13 textos. Las fuentes web NO se reabrieron: la revisión de "copia literal" y de "Seguro inflado" se hace contra lo que cada borrador declara en su propia tabla de fuentes.

**Definiciones**
- **Error (duro):** el JSON se contradice a sí mismo o rompe una regla estructural (p. ej. `requerido:false` con `min:1`, nombre de grupo repetido, grupo requerido con una sola opción de relleno).
- **Aviso:** no rompe nada pero es deuda (grupos/listas sin uso, categorías sin plato de ejemplo, convención de nombres).
- Cuenta de "elementos S/P/Su" en dos columnas: ítems del JSON (campo `certeza` de cada opción de las listas) y filas de la tabla de fuentes de cada archivo.

---

## 1. Tabla resumen por archivo

Reglas del encargo (punto 2): los 13 archivos pasan todas. `fuente.lista` existe, `platos_ejemplo[].categoria` existe, `grupos` existen, todo `precio` = 0, todo `precio_extra` = 0, `modo` es single/multi, `min<=max`, `requerido` es booleano. No hay categorías ni listas duplicadas por key dentro de ningún archivo.

| Archivo | JSON válido | Errores | Avisos | Ítems JSON S / P / Su | Filas fuentes S / P / Su | Recomendación |
|---|---|---|---|---|---|---|
| almuerzos | Sí | 0 | 1 | 13 / 23 / 7 | 8 / 11 / 4 | Usable como borrador |
| bar | Sí | 0 | 2 | 11 / 12 / 11 | 3 / 12 / 8 | Necesita corrección |
| cafeteria | Sí | 1 | 5 | 9 / 16 / 12 | 2 / 10 / 6 | Necesita corrección |
| comida_rapida | Sí | 4 | 8 | 16 / 26 / 12 | 7 / 7 / 3 | Necesita corrección |
| heladeria | Sí | 0 | 2 | 13 / 14 / 7 | 1 / 12 / 3 | Usable como borrador |
| internacional | Sí | 0 | 4 | 22 / 30 / 1 | 2 / 18 / 6 | Necesita corrección |
| jugueria | Sí | 0 | 3 | 0 / 23 / 35 | 0 / 7 / 10 | Necesita validar con dueño real |
| mariscos | Sí | 0 | 3 | 10 / 17 / 13 | 6 / 9 / 3 | Usable como borrador |
| panaderia_reposteria | Sí | 1 | 3 | 25 / 28 / 10 | 9 / 11 / 3 | Necesita corrección |
| parrilla | Sí | 0 | 3 | 17 / 12 / 5 | 5 / 9 / 3 | Necesita validar con dueño real |
| pizzeria | Sí | 0 | 3 | 8 / 7 / 13 | 4 / 5 / 3 (+1 "No verificado") | Necesita validar con dueño real |
| sandwicheria | Sí | 0 | 6 | 25 / 36 / 11 | 4 / 9 / 3 | Necesita corrección |
| tipica_regional | Sí | 1 | 8 | 12 / 25 / 6 | 4 / 14 / 5 (+1 "informativo") | Necesita corrección |
| **Total** | **13 / 13** | **7** | **51** | 181 / 269 / 143 | | 3 usables, 7 corrección, 3 validar |

Nota sobre la columna "Filas fuentes": en `internacional` hay 3 tablas (negocios, referencia internacional, competidores); se sumaron las tres. En `comida_rapida` la cabecera de la tabla dice "Nivel de certeza" en vez de "Certeza" (cosmético).

---

## 2. Errores a corregir (7)

| # | Archivo | Elemento | Problema | Corrección sugerida |
|---|---|---|---|---|
| E1 | comida_rapida | `g_termino_carne` | `requerido:false` pero `min:1, max:1` | Poner `min:0` (o `requerido:true` si se decide preguntar el término, ver C3) |
| E2 | comida_rapida | `g_tipo_papas` | `requerido:false` con `min:1` | `min:0` |
| E3 | comida_rapida | `g_pan` | `requerido:false` con `min:1` | `min:0` |
| E4 | comida_rapida | `g_para_llevar` | `requerido:false` con `min:1` | `min:0` |
| E5 | panaderia_reposteria | `g_con_sin_mensaje` | `requerido:false` con `min:1`. Además el propio texto dice que es "débil": el mensaje debe ser texto libre, no opción | Quitar el grupo y dejar el mensaje como nota del pedido |
| E6 | cafeteria | `g_tamano_cafe` y `g_tamano_corto_largo` | Dos grupos con el mismo `nombre` "Tamaño" (ids distintos). En la UI del dueño serían indistinguibles | Renombrar, p. ej. "Tamaño" y "Tamaño del tinto" |
| E7 | tipica_regional | `g_sopa_dia` / lista `sopa_del_dia` | Grupo `requerido:true` cuya lista tiene UNA sola opción de relleno ("Sopa del día (la define el dueño)"). Obliga a elegir lo único que hay | Eliminar la lista y el grupo; la sopa del día es un plato o producto aparte (ver plantilla `almuerzos`) |

### Avisos (51) agrupados

- **Grupos definidos y nunca adjuntados a un plato (6):** comida_rapida `g_tipo_papas`, `g_pan`, `g_proteina`, `g_para_llevar`; sandwicheria `g_acomp`, `g_bebida`. (panaderia `g_con_sin_mensaje` ya está en E5.)
- **Listas sin ningún grupo (2):** panaderia_reposteria `formato_venta`; tipica_regional `bebidas_tipicas`.
- **Categorías sin ningún plato de ejemplo (39):** almuerzos postres; bar sin_alcohol, vinos; cafeteria no_cafe, jugos_batidos, desayunos, postres, granos; comida_rapida sandwiches, pollo_alitas, adicionales, infantil; heladeria bebidas, adicionales; internacional entradas, pizzas, postres, bebidas; mariscos acompanantes, bebidas, postres; panaderia adicionales; parrilla entradas, bebidas, postres; pizzeria ensaladas, postres, adiciones; sandwicheria combos, acompanamientos, bebidas, postres; tipica_regional parrilla, entradas, desayunos, ninos, postres, bebidas_calientes, bebidas. Es normal en una plantilla de ejemplo, pero `sandwicheria.combos` y `comida_rapida.infantil` prometen algo que ningún plato demuestra.
- **Convención de `value` (3):** jugueria usa guiones (`jugos-agua`, `ensaladas-fruta`, `fruta-porcion`); los otros 12 archivos usan snake_case. Unificar.
- **Fila de fuente mal formada:** cafeteria, fila de Azahar: URL `https://imagizer.com (Lonely Planet, vía búsqueda): https://www-lonelyplanet-com-6c06.imagizer.com/...` (dominio espejo de imágenes, no es la fuente).

---

## 3. Duplicados y listas compartibles

### 3.1 Duplicados dentro de un mismo archivo

| Archivo | Duplicado | Comentario |
|---|---|---|
| comida_rapida | "Piña" en `salsas` y `adiciones`; "Tocineta" y "Huevo de codorniz" en `adiciones` y `toppings_perro`; "Pollo" en `adiciones` y `proteina` | El "Perro caliente especial" lleva `g_toppings_perro` Y `g_adiciones`: el cliente puede pedir tocineta dos veces |
| jugueria | "Yogur", "Helado", "Granola", "Miel" en `adiciones` y `toppings_ensalada`; `g_fruta` (single) y `g_frutas_mezcla` (multi 1-3) usan la misma lista `frutas` | Decisión declarada por el autor; mejor un solo grupo `multi min 1 max 3` y que el plato limite a 1 |
| panaderia_reposteria | `sabores_individual` repite `masas` + `rellenos`; "Crema de queso" en `rellenos` y `coberturas`; "Velas" en `decoraciones` y "Vela" en `adicionales_pedido`; "Entrega a domicilio" en `adicionales_pedido` y `g_tipo_entrega`; "Mensaje en la torta" en `adicionales_pedido` y `g_con_sin_mensaje` | Quitar "Entrega", "Mensaje" y "Vela" de `adicionales_pedido` |
| parrilla | `g_acomp_2` y `g_acomp_extra` usan la misma lista `acompanantes`; `g_papa_tipo` (inline) repite 4 papas ya presentes en `acompanantes` | Reusar `lista` en vez de `items` inline |
| sandwicheria | `g_aderezo_ensalada` (inline) repite "Aderezo César", "Salsa ranch", "Aceite y vinagre" de `salsas`; `g_proteina` y `g_proteina_doble` sobre la misma lista | Hacer `lista` aparte `aderezos_ensalada` |
| tipica_regional | `adiciones_sopa` repite "Aguacate", "Arroz", "Arepa" de `acompanantes`; "Plátano" vs "Plátano maduro" | Compartible con `acompanantes` |
| heladeria | `sabores_helado`, `salsas` y `frutas_batido` repiten chocolate/fresa/mora/arequipe | Aceptable (sentidos distintos), pero etiquetar "Salsa de ..." |
| cafeteria | "Sin azúcar (vainilla)" en `sabores_jarabe` vs "Sin azúcar" en `endulzante` | Ambiguo; dejar solo el de `endulzante` |
| bar | "Botella" en `presentaciones_licor` y `tamanos_cerveza` | Mismo label, distinto sentido; no compartir |

No hay listas, categorías ni ids de grupo repetidos por key dentro de ningún archivo.

### 3.2 Choques de key entre archivos (PELIGRO si el motor comparte por key)

Estas keys se repiten en varios archivos con contenido distinto (solapamiento casi cero). Si RestaurantOS fusiona listas por `key`, mezclaría cosas incompatibles. Renombrar con sufijo semántico:

| Key repetida | Archivos | Contenido real |
|---|---|---|
| `salsas` | comida_rapida, heladeria, internacional, mariscos, parrilla, sandwicheria | Cuatro familias: salsas de mesa (rosada, ajo...), de postre (arequipe, caramelo...), asiáticas/mexicanas (soya, teriyaki...), de mariscos. Solapamiento por etiqueta exacta ~0 |
| `proteinas` | almuerzos (14 cocciones/cortes), internacional (7), sandwicheria (12 fiambres) | Disjuntas (solo "Pollo" común) |
| `acompanantes` | almuerzos, mariscos, parrilla, tipica_regional | Parcialmente solapadas (parrilla vs típica: 8 comunes, J=0,47) |
| `adiciones` | comida_rapida, jugueria | Disjuntas |
| `masas` | pizzeria (tipo de masa), panaderia_reposteria (sabor de torta) | Distinto concepto |
| `endulzante` | cafeteria, jugueria | Parecidas pero etiquetas distintas |
| `bebidas_combo` | comida_rapida, pizzeria | Parecidas (J=0,40) |
| `terminos_carne` | comida_rapida, parrilla | Parecidas, 3 vs 4 ítems |

### 3.3 Listas casi idénticas que conviene compartir (con un solo key)

| Lista compartida propuesta | Origen | Qué unificar |
|---|---|---|
| `leches` | cafeteria `leches` (7), jugueria `base` (5 lácteas con "En leche de avena/almendras/deslactosada"), tipica_regional `base_jugo` (En agua/En leche) | Una lista de leches + una `base_liquida` (agua/leche) |
| `endulzante` | cafeteria, jugueria | Etiquetas: "Con azúcar", "Sin azúcar", "Panela", "Miel", "Stevia" (hoy "Panela" vs "Con panela", "Stevia / edulcorante" vs "Con stevia") |
| `bebida_combo` | pizzeria, comida_rapida, sandwicheria `bebidas`, parrilla `g_bebida_combo` (inline) | Gaseosa, Jugo natural, Agua (+ Limonada, Té helado, Malteada opcionales). NO incluir `bar.mezcladores` (J=0,50 pero es otro concepto) |
| `terminos_carne` | comida_rapida, parrilla | Jugoso, Término medio, Tres cuartos, Bien cocido (hoy "Medio"/"Término medio", "Bien cocida"/"Bien cocido") |
| `salsas_mesa` | comida_rapida, sandwicheria, parrilla, mariscos, pizzeria `salsas_dips` | Misma familia con etiquetas distintas: "Rosada" / "Salsa rosada", "Tomate" / "Salsa de tomate", "BBQ" / "Salsa BBQ", "Ajo" / "Salsa de ajo", "Picante / ají" / "Ají" / "Ají picante" / "Picante". Normalizar etiquetas |
| `acompanantes_base` + `tipos_papa` | parrilla, tipica_regional, almuerzos, mariscos, comida_rapida `tipos_papas`, parrilla `g_papa_tipo` | Papa criolla/francesa/rústica/en casco/salada/al vapor; yuca, plátano maduro, patacón, arepa, arroz, ensalada, aguacate |
| `tamano_psg` | pizzeria `tamanos_pizza`, comida_rapida `tamanos_papas`, cafeteria `g_tamano_cafe` (inline), heladeria `g_tamano` (inline), jugueria `tamano_ensalada` | Pequeño/Mediano/Grande. Hoy género y etiquetas inconsistentes (Pequeña/Pequeño) y 2 de 5 son `items` inline |
| `nivel_picante` | internacional `picante`, mariscos `g_picante` (inline), tipica_regional `g_quitar` ("Sin picante") | Sin picante / Suave / Medio / Picante |
| `g_servicio` (aquí / para llevar) | almuerzos `g_para_llevar`, comida_rapida `g_para_llevar` | Idénticos |
| `toppings_dulces` | heladeria `toppings`, jugueria `toppings_ensalada` | Granola, miel, yogur, helado, crema, coco rallado |

---

## 4. Contradicciones (22)

Ítems que no pertenecen al tipo de negocio o grupos que exigen algo que el negocio típico no hace.

| # | Archivo | Elemento | Contradicción |
|---|---|---|---|
| C1 | bar | "Cóctel de la casa", "Mojito": `g_licor_base` (requerido) + `g_sin_alcohol` ("Sin alcohol (virgen)") | Un cóctel virgen no tiene licor base, pero el grupo lo exige |
| C2 | bar | `tamanos_cerveza` (requerido) | Mezcla envase (botella, jarra, pinta) con multipack ("Cubetazo x7/x10") y barril; se aplica también a "Cerveza artesanal" |
| C3 | comida_rapida | `g_termino_carne` en hamburguesas | Su propia fuente (Suposición) dice que en res molida lo habitual es bien cocida y la duda #2 sugiere eliminarlo. Está en 3 platos y exige 1 opción |
| C4 | comida_rapida | `g_combo_si_no` ("En combo (papas + bebida)") | La hamburguesa sencilla ofrece "combo" pero no adjunta papas ni bebida; solo el plato "Combo hamburguesa" las tiene. Además 4 grupos definidos sin uso (E2-E4, `g_proteina`) |
| C5 | comida_rapida | "Perro caliente especial" con `g_toppings_perro` y `g_adiciones` | Tocineta y huevo de codorniz se pueden pedir dos veces |
| C6 | heladeria | `g_bolas` (1-3) vs `g_sabores` (min 1, max 3) vs `g_tamano` | "1 bola" permite 3 sabores; tamaño y bolas coexisten sin regla. La propia fuente aclara que en Colombia solo se vio por número de sabores |
| C7 | heladeria | `g_sabor_malteada` reutiliza `sabores_helado` | Incluye "Ron con pasas" (sabor con licor) y "Cookies and cream" como sabor de malteada; `salsas` repite sabores |
| C8 | internacional | "Shawarma" con `g_salsas` | La lista ofrece soya, teriyaki, wasabi, guacamole y crema agria; nada de tahini o ajo, propio del shawarma |
| C9 | internacional | "Combo de sushi" con `g_tamano` | La lista mezcla "Roll completo", "Medio roll" y "Combo 20/30/50 piezas"; no aplica a un combo |
| C10 | internacional | "Lasaña boloñesa" con `g_acompanante`; "Pasta a elección" con `g_proteina` | Frijoles y pan pita para lasaña; Falafel y cerdo al pastor como proteína de pasta |
| C11 | internacional | `salsas_pasta` "Pollo con champiñones"; `salsas` "Queso" | Un plato y un ingrediente no son salsas |
| C12 | internacional | Alcance | Una sola plantilla cubre sushi, mexicana, pasta y árabe, con categoría `pizzas` que duplica la plantilla `pizzeria`. Debería ser subtipos o plantillas separadas |
| C13 | jugueria | `g_fruta` vs `g_frutas_mezcla`; "Batido de fruta en leche" | El batido "en leche" no incluye `g_base`; el fruver por peso (la categoría) no se puede modelar (el propio texto lo admite) |
| C14 | mariscos | "Langosta" con `g_preparacion` | La lista incluye "Frito entero", "Encocado", "Sudado", "Apanado", que son de pescado |
| C15 | mariscos | `salsas` "Limón", "Ají picante"; `marisco_base` "Langosta"; `g_picante` y `extras_ceviche` "Con picante" | Condimentos como salsa; langosta como base de ceviche; picante modelado dos veces |
| C16 | panaderia_reposteria | `adicionales_pedido`, `g_con_sin_mensaje`, `formato_venta`, "Porción de torta de chocolate" | Entrega/mensaje/vela duplicados (ver 3.1); `formato_venta` huérfano; la porción no tiene grupo ni descuenta de la torta entera |
| C17 | parrilla | `g_acomp_2` (requerido, exactamente 2) + `g_acomp_extra` sobre la misma lista | Obliga a elegir exactamente 2 acompañantes (patrón de un club hotelero y de una cadena de EE.UU.); el cliente puede repetir el mismo en el "extra" |
| C18 | pizzeria | `g_mitades` (requerido) | Falta en Margarita y en la personal; `g_borde` es opcional pero ofrece "Sin borde relleno" (opción redundante); "Combo Pizza + Gaseosa" no incluye borde ni mitades; el propio texto dice que el motor no sabe cobrarla |
| C19 | sandwicheria | `g_combo` / `g_acomp` / `g_bebida`; `tamanos`; `panes` | La dependencia combo -> acompañante y bebida no se puede expresar (la categoría `combos` queda vacía); tamaños 15/30 cm chocan con baguettes de 14/21 cm de su propia fuente; "Wrap" y "Sin pan (bowl)" están como pan Y como categoría aparte |
| C20 | tipica_regional | "Almuerzo del día" con `g_proteina_extra` | Usa "Proteínas extra" como selector de la proteína principal; chicharrón, carne molida, chorizo, morcilla y huevo ya vienen incluidos en la bandeja, así que "extra" duplica |
| C21 | almuerzos | `jugos_del_dia`, `g_para_llevar`, `g_jugo` | "Jugo del día" convive con jugos concretos y "Agua de panela"; `g_para_llevar` es requerido en todos los platos sin fuente; `g_jugo` requerido en "Bandeja paisa" y "Pechuga a la plancha" (platos a la carta); "Ejecutivo (sin sopa)" afirma una distinción que otra fuente niega |
| C22 | cafeteria | `g_temperatura`, `g_extras_cafe` | Temperatura solo en Latte (Americano y Capuchino también se piden fríos); "Descafeinado" es una variante, no un extra; "Jarrita de leche aparte" es servicio |

---

## 5. Certeza inflada y afirmaciones demasiado específicas

### 5.1 Criterio de "Seguro" inconsistente entre archivos
Cada autor definió "Seguro" distinto: 2 o más fuentes (cafeteria, internacional), 3 o más (comida_rapida, mariscos), "varios negocios" (panaderia, almuerzos), y jugueria usa cero. Resultado: `internacional` marca 22 ítems Seguro mientras sus tablas solo tienen 2 filas Seguro (la mayoría son "Probable"); `heladeria` 13 vs 1; `sandwicheria` 25 vs 4; `cafeteria` 9 vs 2. Recomendación: una sola definición ("2 o más negocios colombianos distintos con carta leída") y recalcular.

### 5.2 Seguro apoyado en una sola fuente, en referencia internacional o sin fuente

| Archivo | Elemento | Problema |
|---|---|---|
| bar | `licor_base`: Ginebra, Tequila (Seguro) | Sin fila de fuente propia (la tabla solo avala whisky, vodka, ron, aguardiente) |
| bar | `tamanos_cerveza`: Botella, Jarra (Seguro) | La tabla dice "Probable (un solo negocio leído)". En cambio "Cañita (6 oz)" está en Suposición aunque la tabla la da como Probable |
| cafeteria | `leches`: Entera, Avena (Seguro); `sabores_jarabe` Vainilla/Caramelo/Avellana (Seguro) | Sin fuente de Entera ni Avena; los jarabes salen de Starbucks México/Uruguay, no de negocios colombianos |
| heladeria | `sabores_helado`: Vainilla, Chocolate, Fresa, Arequipe (Seguro); "Ron con pasas" (Probable) | La fila de sabores cita otros (fleur de lait, capuchino, pistacho, tres leches, mora, cheesecake); ninguno de los cuatro Seguro tiene fuente explícita |
| internacional | `proteinas`, `picante`, `salsas` (Seguro) | Basados en Chipotle (Probable, vía guía de terceros) y negocios con una sola mención |
| jugueria | "Tomate de árbol" (Probable); "Níspero" (Suposición) | El primero no tiene fuente; el segundo SÍ la tiene (Probable en Cartagena) y está subestimado |
| parrilla | `terminos_carne` "Término medio", "Bien cocido" (Seguro); `g_acomp_2` | Seguro se apoya en Texas Roadhouse (carta de EAU), referencia internacional, para un producto colombiano |
| sandwicheria | `proteinas`/`quesos`/`salsas`/`vegetales` (Seguro: Tocineta, Cheddar, Pavo, Pepinillos, Salsa BBQ, "Pequeño (mini)") | Provienen de Subway/Jersey Mike's EE.UU. (terceros, Probable). Solo Subway Colombia y Charles Café son colombianos |
| tipica_regional | `base_jugo` En agua / En leche, `bebidas_tipicas` Gaseosa (Seguro); ajiaco (Seguro) | La tabla cita una sola URL (mondongos.com.co) pese a decir "varias fuentes" |
| almuerzos | `proteinas` Pechuga a la plancha, Carne de res, Pescado (Seguro) | La fila de proteínas está en Probable |
| mariscos | Patrón de modificadores (Seguro) | Se apoya en una repostada de redes de Fudo y en Wix, no en documentación del POS |
| pizzeria | Mitad y mitad requerido (Seguro como patrón POS) | Evidencia de POS de EE.UU., ninguna de pizzerías colombianas |

### 5.3 Afirmaciones específicas sin respaldo suficiente (Suposición, fuente única o sin fuente)
- **bar:** "Pinta (16 oz)", "Pinta imperial (20 oz)", "Cañita (6 oz)", "Barril 1,6 L" y "Cubetazo x7/x10" son volúmenes y cantidades de uno o dos negocios; la duda #7 reconoce que el cubetazo puede ser de 6, 7 o 10.
- **comida_rapida:** `terminos_carne` (3 Suposiciones) usados en 3 platos; `g_para_llevar`; "Cebolla" como topping de perro (Suposición).
- **sandwicheria:** "Mediano (15 cm)" y "Grande (30 cm)" calcados de Subway 6"/footlong; "Pequeño (mini)" de Jersey Mike's; "Wayoyo" (ubicación no confirmada, Suposición) respalda la receta "ropa vieja".
- **panaderia_reposteria:** todo el lado del pan (`tamanos_pan`, categorías `pan_dulce`, `pan_tradicional`) es Suposición declarada; 6/25/40/50 porciones salen de un solo negocio.
- **pizzeria:** 13 de 28 ítems son Suposición (bordes de bocadillo/salchicha/ajo, masas integrales, ingredientes de topping); `g_mitades` obligatorio.
- **parrilla:** "Pierna pernil", `tipo_presa` (3 Suposiciones), "Frijoles"; `g_proteinas` min 1 max 6 forzando hasta las 6 proteínas.
- **tipica_regional:** "Para compartir (2 personas)", "Mixto (pollo y cerdo)", "Torta de elote" (Suposición aunque Mondongo's la nombra), `g_quitar` y `g_sopa_dia` ("ideas propias").
- **jugueria:** 35 de 58 ítems en Suposición; endulzantes, hielo, linaza, espinaca, jengibre "conocimiento propio".
- **almuerzos:** `g_para_llevar` y "Almuerzo solo sopa y seco" sin fuente; "Ejecutivo sin sopa" en Probable con fuente que se contradice.
- **cafeteria:** `calentar_pan` y `acompanante_combo` (6 Suposiciones); `temperatura` "Extra caliente", `endulzante` con/sin azúcar (Probable sin fuente).
- **heladeria / mariscos:** "Cookies and cream", "Barquillo", frutas de batido; "Papas a la francesa", "Yuca", "Arroz blanco", "Apanado" (Suposición declarada, bien marcada).

### 5.4 Contenido de fuentes que contradice a otro archivo
Loggro: `mariscos` y `cafeteria` citan la ficha de App Store de Loggro Restobar (Probable) mientras los demás afirman "sin documentación". Aclarar con una sola frase común.

---

## 6. ¿Texto copiado de una carta? Marcas y nombres comerciales

No se detecta copia literal de párrafos ni de descripciones largas. Los textos de contexto están parafraseados y los nombres de negocios aparecen solo en las tablas de fuentes. Elementos a revisar:

| Severidad | Archivo | Elemento | Motivo |
|---|---|---|---|
| Alta | panaderia_reposteria | `rellenos`: "Oreo (cookies and cream)", "Nutella" | Marcas registradas (Mondelez y Ferrero). Usar "Galleta de chocolate con crema" y "Crema de avellana y chocolate" |
| Alta | sandwicheria | `panes`: "Pan de avena y miel", "Pan de mantequilla y ajo", "Pan de orégano y parmesano" | Las tres variantes son exactamente la lista de panes de Subway Colombia que cita la propia fuente (fila 3 de la tabla). Genéricos: "Pan de avena", "Pan de ajo", "Pan de hierbas y queso" |
| Media | sandwicheria | `vegetales`: "Maíz dulce", "Plátano maduro"; `salsas`: "Salsa de piña" | Combinación del "Sub Criollo" de Subway Colombia según la fuente. Marcar Suposición en vez de Probable |
| Media | heladeria | `toppings`: "Krispies con chocolate" | Producto citado de la carta de Mimo's (fila 5 de fuentes); "Krispies" evoca la marca Rice Krispies. Usar "Arroz inflado con chocolate" |
| Baja | cafeteria | `metodo_filtrado`: "V60", "Chemex", "Aeropress" | Nombres de método que son marcas registradas (Hario, Chemex, AeroPress). Aceptables como descriptores; considerar "Filtrado de cono", "Filtrado de vidrio", "Inmersión a presión" |
| Baja | cafeteria | `sabores_jarabe`: Vainilla, Caramelo, Avellana, "Sin azúcar (vainilla)" | Calcan la tríada de jarabes de Starbucks que cita la fuente |
| Baja | comida_rapida | "Cebolla grillé" | Término usado por El Corral según la tabla de fuentes |
| Baja | heladeria (fuentes, no JSON) | "Copas con nombre (Vesubio, Tentación)", "Blizzard" | Correcto que NO estén en el JSON; no incorporarlos |

Sin hallazgos de marca en: almuerzos, bar (no hay marcas de licor), internacional, mariscos, parrilla, pizzeria, tipica_regional, jugueria. "Bandeja paisa", "Pizza Hawaiana/Margarita/Pepperoni", "Banana split", "Sundae", "Mojito" son denominaciones genéricas.

Además, varios archivos copian precios de referencia en la tabla de fuentes (almuerzos 12.000-20.000; tipica_regional 33.500 COP; bar impuestos; heladeria 8 %). Están marcados "no usados" y el JSON queda en 0, pero el encargo pedía no incluir precios de cartas.

---

## 7. Observaciones transversales

1. **Evidencia débil generalizada.** En 12 de 13 archivos WebFetch fue bloqueado; todo salió de resúmenes de buscador. Ninguna plantilla se apoya en cartas leídas completas de 5 o más negocios colombianos (el mínimo pedido). `jugueria` tiene cero cartas colombianas.
2. **Dependencias y precio por tamaño.** Cinco plantillas (comida_rapida, sandwicheria, pizzeria, tipica_regional, heladeria) necesitan "si elige X, ofrecer grupo Y" o precio por tamaño (que Square/Toast tampoco resuelven). El esquema actual no lo expresa: combos y mitad y mitad quedan a medias.
3. **Consistencia de modelado.** Mezcla de grupos con `lista` e `items` inline para el mismo concepto (papas, bebidas, tamaños, picante); sin criterio para cuándo usar cada uno.
4. **Solape de tipos de negocio.** `almuerzos` vs `tipica_regional` (almuerzo del día, sopa del día); `internacional` vs `pizzeria` (pizzas); `jugueria` vs `cafeteria` (batidos, jugos); `sandwicheria` vs `comida_rapida` (sándwiches). Decidir qué categorías son canónicas.
5. **Buen estado de base:** JSON válido en los 13, precios en 0 en todos, referencias cruzadas sin rotura, dudas para dueño útiles y honestas.

---

## 8. Recomendación por plantilla

| Plantilla | Recomendación | Qué falta |
|---|---|---|
| almuerzos | **Usable como borrador** | Ajustes menores (C21); validar con dueño la "lista del día" y la distinción corrientazo/ejecutivo |
| bar | **Necesita corrección** | C1 (cóctel virgen), C2 (cerveza), bajar Seguro de Ginebra/Tequila/Botella/Jarra; validar tamaños |
| cafeteria | **Necesita corrección** | E6, C22, quitar Seguro sin fuente (Entera, Avena), revisar marcas de método |
| comida_rapida | **Necesita corrección** | E1-E4, C3-C5; decidir si el término de carne existe |
| heladeria | **Usable como borrador** | C6-C7; reetiquetar sabores Seguro sin fuente; renombrar "Krispies" |
| internacional | **Necesita corrección** | C8-C12; recalcular Seguro; considerar dividir en subtipos |
| jugueria | **Necesita validar con dueño real** | 0 cartas colombianas, 0 Seguro, 35 Suposiciones; fruver por peso fuera de alcance; unificar `value` con guiones |
| mariscos | **Usable como borrador** | C14-C15; confirmar precio por especie/peso con dueño |
| panaderia_reposteria | **Necesita corrección** | E5, C16, quitar Oreo/Nutella; el lado "pan" debe validarse con panadería real |
| parrilla | **Necesita validar con dueño real** | `g_acomp_2` requerido exacto y Seguro basado en referencia internacional (C17); término de la carne |
| pizzeria | **Necesita validar con dueño real** | Mitad y mitad (C18), 13 Suposiciones, precio por tamaño |
| sandwicheria | **Necesita corrección** | Panes de Subway Colombia, C19, recalcular Seguro (basado en cadenas de EE.UU.) |
| tipica_regional | **Necesita corrección** | E7, C20, 7 categorías sin plato; resolver solape con `almuerzos` |
