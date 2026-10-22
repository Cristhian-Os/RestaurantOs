# Plantilla: almuerzos (corrientazo / ejecutivo / menú del día) - Colombia

**Estado de la investigación (fecha 2026-10-16):** hubo acceso a búsqueda web, pero la descarga directa de las páginas (WebFetch) falló o fue bloqueada en casi todos los sitios. Todo lo de abajo sale de resúmenes de búsqueda y no de leer las cartas completas. Por eso la evidencia es más débil de lo pedido:

- Negocios colombianos con datos de carta verificables en los resultados: **4** (Puntos Sabroso, Parrilla Santandereana, Misterpollo, La Estación Paisa). Un quinto, "El Ejecutivo" (Bucaramanga), solo apareció como ficha en Rappi/Didi sin contenido legible. **No se llegó a los 5-10 pedidos.**
- Además se usaron 4 notas de prensa/gremio (La República, Acodres/El Colombiano, La Nota Positiva, Colombia One) y 1 documento de contratación pública que describen la estructura típica.
- Referencias internacionales: 3 formatos (menú del día de España, comida corrida de México, teishoku de Japón) más 2 negocios de teishoku con carta (KIBOU Oxford, Izakaya Rintaro SF). Son formatos, no cartas completas.
- Competidores: documentación real revisada solo de Toast, Square y Lightspeed. De Loggro, Siigo POS y Fudo **no encontré documentación pública** sobre menú del día/modificadores; no afirmo nada de su configuración.
- Se extrajo solo estructura (nombres de opciones). Ningún texto ni foto copiado. Todos los precios en 0.

## Hallazgos clave

1. Estructura casi universal: **sopa del día + principio + proteína + harina/acompañante + arroz + ensalada + jugo (+ postre a veces)**. Precio único por almuerzo completo; lo que cambia es qué se elige.
2. **Corrientazo vs ejecutivo:** una fuente dice que el corrientazo trae sopa y el ejecutivo no (versión más ligera); otra dice que son lo mismo. Hay que preguntar al dueño.
3. Lo que **cambia cada mañana**: sopa, principio y jugo (y a veces la lista de proteínas). Puntos Sabroso cobra por separado "jugo del día", "sopa del día" y "porción del principio del día" como adiciones.
4. Los competidores internacionales resuelven esto con **grupos de modificadores obligatorios dentro de un plato de precio fijo** (Toast: prix fixe con grupos Required; Square: modificadores con mínimo/máximo; Lightspeed: combos con grupos de ítems / option sets con límite por grupo). Eso calza con el modelo `grupos_tipicos` pedido.
5. Una "lista del día" que se edita cada mañana es lo que ninguna documentación revisada muestra como plantilla lista; es el punto diferenciador a resolver en el producto (ver dudas).

## Borrador de plantilla

```json
{
  "key": "almuerzos",
  "nombre": "Almuerzos / Corrientazo / Ejecutivos",
  "descripcion": "Restaurante de almuerzo del día con precio fijo: sopa, principio, proteína, acompañantes y jugo que se eligen o rotan cada mañana.",
  "categorias": [
    { "value": "almuerzos", "label": "Almuerzos del día", "emoji": "🍛" },
    { "value": "ejecutivos", "label": "Ejecutivos", "emoji": "💼" },
    { "value": "platos_especiales", "label": "Platos especiales", "emoji": "🍗" },
    { "value": "sopas", "label": "Sopas", "emoji": "🥣" },
    { "value": "bebidas", "label": "Bebidas y jugos", "emoji": "🥤" },
    { "value": "adicionales", "label": "Adicionales", "emoji": "➕" },
    { "value": "postres", "label": "Postres", "emoji": "🍮" }
  ],
  "listas": [
    {
      "key": "sopas_del_dia",
      "nombre": "Sopas del día",
      "items": [
        { "label": "Sopa de lentejas", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Sopa de fríjoles", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Sancocho", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Consomé", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Sopa de pasta", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Crema de verduras", "precio_extra": 0, "certeza": "Suposición" }
      ]
    },
    {
      "key": "principios",
      "nombre": "Principios del día",
      "items": [
        { "label": "Fríjoles", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Lentejas", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Garbanzos", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Habichuelas", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Pasta", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Verdura salteada", "precio_extra": 0, "certeza": "Suposición" }
      ]
    },
    {
      "key": "proteinas",
      "nombre": "Proteínas",
      "items": [
        { "label": "Pollo sudado", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Pechuga a la plancha", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Pollo frito", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Carne de res", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Carne sudada", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Carne asada", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Carne molida", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Chuleta de cerdo", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Carne de cerdo", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Mojarra frita", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Pescado", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Hígado", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Chicharrón", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Chorizo", "precio_extra": 0, "certeza": "Probable" }
      ]
    },
    {
      "key": "acompanantes",
      "nombre": "Harina / acompañante",
      "items": [
        { "label": "Papa", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Yuca", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Plátano maduro", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Plátano verde (patacón)", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Papa a la francesa", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Bollo", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Arepa", "precio_extra": 0, "certeza": "Probable" }
      ]
    },
    {
      "key": "arroz_ensalada",
      "nombre": "Arroz y ensalada",
      "items": [
        { "label": "Arroz blanco", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Ensalada", "precio_extra": 0, "certeza": "Seguro" }
      ]
    },
    {
      "key": "jugos_del_dia",
      "nombre": "Jugos y bebidas del día",
      "items": [
        { "label": "Jugo del día", "precio_extra": 0, "certeza": "Seguro" },
        { "label": "Limonada", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Jugo de mora", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Jugo de lulo", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Jugo de maracuyá", "precio_extra": 0, "certeza": "Suposición" },
        { "label": "Agua de panela", "precio_extra": 0, "certeza": "Suposición" }
      ]
    },
    {
      "key": "postres",
      "nombre": "Postres",
      "items": [
        { "label": "Postre del día", "precio_extra": 0, "certeza": "Probable" },
        { "label": "Porción de fruta", "precio_extra": 0, "certeza": "Probable" }
      ]
    }
  ],
  "grupos_tipicos": [
    { "id": "g_sopa", "nombre": "Sopa", "modo": "single", "min": 0, "max": 1, "requerido": false, "fuente": { "lista": "sopas_del_dia" } },
    { "id": "g_principio", "nombre": "Principio", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": { "lista": "principios" } },
    { "id": "g_proteina", "nombre": "Proteína", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": { "lista": "proteinas" } },
    { "id": "g_acompanante", "nombre": "Harina / acompañante", "modo": "multi", "min": 0, "max": 2, "requerido": false, "fuente": { "lista": "acompanantes" } },
    { "id": "g_arroz_ensalada", "nombre": "Arroz y ensalada", "modo": "multi", "min": 0, "max": 2, "requerido": false, "fuente": { "lista": "arroz_ensalada" } },
    { "id": "g_jugo", "nombre": "Jugo", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": { "lista": "jugos_del_dia" } },
    { "id": "g_postre", "nombre": "Postre", "modo": "single", "min": 0, "max": 1, "requerido": false, "fuente": { "lista": "postres" } },
    { "id": "g_para_llevar", "nombre": "Servicio", "modo": "single", "min": 1, "max": 1, "requerido": true, "fuente": { "items": [ { "label": "Para comer aquí", "precio_extra": 0 }, { "label": "Para llevar", "precio_extra": 0 } ] } }
  ],
  "platos_ejemplo": [
    { "nombre": "Almuerzo corriente completo", "categoria": "almuerzos", "precio": 0, "grupos": ["g_sopa", "g_principio", "g_proteina", "g_acompanante", "g_arroz_ensalada", "g_jugo", "g_para_llevar"] },
    { "nombre": "Almuerzo ejecutivo (sin sopa)", "categoria": "ejecutivos", "precio": 0, "grupos": ["g_principio", "g_proteina", "g_acompanante", "g_arroz_ensalada", "g_jugo", "g_postre", "g_para_llevar"] },
    { "nombre": "Almuerzo solo sopa y seco", "categoria": "almuerzos", "precio": 0, "grupos": ["g_sopa", "g_proteina", "g_acompanante", "g_arroz_ensalada", "g_jugo", "g_para_llevar"] },
    { "nombre": "Bandeja paisa", "categoria": "platos_especiales", "precio": 0, "grupos": ["g_jugo", "g_para_llevar"] },
    { "nombre": "Pechuga a la plancha", "categoria": "platos_especiales", "precio": 0, "grupos": ["g_acompanante", "g_arroz_ensalada", "g_jugo", "g_para_llevar"] },
    { "nombre": "Sopa del día sola", "categoria": "sopas", "precio": 0, "grupos": ["g_sopa", "g_para_llevar"] },
    { "nombre": "Jugo del día", "categoria": "bebidas", "precio": 0, "grupos": ["g_jugo"] },
    { "nombre": "Porción de principio del día", "categoria": "adicionales", "precio": 0, "grupos": ["g_principio"] }
  ]
}
```

Notas de diseño: `g_sopa` va opcional (min 0) para cubrir tanto corrientazo con sopa como ejecutivo sin ella. Las listas `sopas_del_dia`, `principios`, `proteinas` y `jugos_del_dia` son las que el dueño debe poder activar/desactivar cada mañana. Los nombres de opciones son ejemplos regionales (paisa, santandereano, bogotano), no una carta única.

## Fuentes

| Elemento | Enlace consultado | Certeza |
|---|---|---|
| Estructura sopa + principio + proteína + harina + arroz + jugo | https://www.larepublica.co/economia/corrientazos-un-negocio-de-mas-de-1-billon-al-mes-2066746 | Seguro (varias fuentes coinciden) |
| Sopa, proteína, carbohidrato, ensalada, jugo | https://www.elcolombiano.com/negocios/corrientazo-en-medellin-se-encarecio-11-este-ano-acodres-cuanto-vale-un-almuerzo-corrient-ejecutivo-en-medellin-CH23606150 | Seguro |
| Corrientazo con sopa vs ejecutivo sin sopa | https://lanotapositiva.com/destacado/corrientazo-almuerzo-predilecto-colombianos_87017 | Probable (otra fuente dice que son sinónimos) |
| Puntos Sabroso: sopa, proteína, principio, acompañante, arroz, ensalada, bebida, postre; adiciones jugo/sopa/principio del día | https://puntosabroso.com.co/product/almuerzo-ejecutivo/ (solo vía resumen de búsqueda, página no descargable) | Probable |
| Parrilla Santandereana (Bogotá): sopa, principio, proteína a elegir (mojarra, pollo sudado, pollo frito, res, cerdo, pechuga), arroz, ensalada, plátano, papa, limonada o jugo | resultado de búsqueda sobre "ejecutivo" en Bogotá (carta de 2020, desactualizada); enlace concreto no confirmado | Probable |
| Misterpollo: sopa del día o consomé, presa de pollo, arroz, papa a la francesa, ensalada, jugo natural, postre | https://www.misterpollo.co/domicilios/almuerzos/89-ejecutivo-con-pollo.html (vía resumen de búsqueda) | Probable |
| La Estación Paisa (Barranquilla): pechuga con papa, yuca, bollo, maduro con queso y sopa | https://www.rappi.com.co/restaurantes/900079598-restaurante-y-asadero-la-estacion-p (vía resumen) | Probable |
| El Ejecutivo (Bucaramanga): solo ficha, sin contenido leído | https://www.rappi.com.co/restaurantes/900014557-el-ejecutivo | Suposición |
| Proteínas: carne molida, oreja, garra, chicharrón, chorizo (versión económica Medellín) | https://www.elpais.com.co/colombia/asi-es-el-corrientazo-que-se-puede-conseguir-en-medellin-por-apenas-2000-1229.html (vía resumen) | Probable |
| Proteínas: carne sudada, asada, pechuga, pollo dorado, chuleta, hígado (propietario bogotano) | https://www.elespectador.com/gastronomia-y-recetas/este-restaurante-tiene-uno-de-los-mejores-corrientazos-de-bogota-vale-21000/ (vía resumen) | Probable |
| Licitación pública: sopa del día, proteína 140 g (pollo/res/cerdo), acompañante (papa/plátano/yuca), jugo o limonada | https://www.ucundinamarca.edu.co/documents/contratacion/invitaciones/2024/GCD-033_PRECIOS_REF.pdf | Probable |
| Listas "del día" que rotan (principio, sopa) | https://colombiaone.com/2026/01/27/colombia-typical-lunch-ejecutivo/ y La República | Seguro |
| Internacional: menú del día España (primero, segundo, postre, bebida, pan) | https://fascinatingspain.com/gastronomy/menus/spanish-menu-del-dia/ | Seguro |
| Internacional: comida corrida México (sopa, arroz/pasta, guisado a elegir entre 3-5, agua del día) | https://culinarybackstreets.com/cities-category/mexico-city/2019/lunch-rush/ | Seguro |
| Internacional: teishoku Japón (principal + arroz + sopa miso + encurtido) | https://sabukaru.online/articles/a-love-letter-to-teishoku-the-lunch-of-champions | Seguro |
| Internacional: teishoku con carta (KIBOU Oxford; Izakaya Rintaro SF) | https://www.experienceoxfordshire.org/new-teishoku-lunch-menu-in-kibou-oxford/ ; https://ww2.kqed.org/bayareabites/118638/izakaya-rintaro-in-san-francisco-now-offers-teishoku-set-meal-lunch | Probable |
| Toast: menú prix fixe con grupos de modificadores Required (entrada/plato/postre), mínimo solo si es requerido | https://support.toasttab.com/en/article/Setting-Up-a-Prix-Fixe-Menu | Seguro |
| Toast: grupos de modificadores de selección múltiple (bowls/tacos) | https://support.toasttab.com/es-US/article/Setting-Up-Your-BYO-Bowl-or-Taco-Menu-with-Modifier-Multi-Select-and-Duplicate-Modifiers (solo título, no se pudo leer) | Suposición |
| Square for Restaurants: modificadores con requeridos/máximo (0 = ilimitado), opción "solo una" | https://squareup.com/help/us/en/article/8280 ; https://squareup.com/help/gb/en/article/5119-create-and-manage-item-modifiers | Seguro |
| Lightspeed: combos con grupos de ítems; option sets con límite por grupo; "selección requerida" min/max 1-99 | https://k-series-support.lightspeedhq.com/hc/en-us/articles/4407625615387-Modifying-combos ; https://resto-support.lightspeedhq.com/hc/en-us/articles/6455698479899-Creating-and-managing-combos | Probable (varía por línea de producto) |
| Siigo POS restaurantes: menciona recetas y combos; sin detalle de modificadores | https://www.siigo.com/sistema-pos/restaurantes | Suposición |
| Loggro, Fudo: sin documentación pública hallada sobre menú del día/plantillas | (búsquedas sin resultado útil; sitio fu.do no consultado) | Suposición |
| Precios de referencia (no usados, todos en 0): Bogotá 12.000-18.000, Medellín 15.000-20.000 (2024) | https://www.elcolombiano.com/negocios/corrientazo-en-medellin-se-encarecio-11-este-ano-acodres-cuanto-vale-un-almuerzo-corrient-ejecutivo-en-medellin-CH23606150 | Probable |

## Dudas para un dueño real

1. **¿Cómo cambia su menú cada mañana?** ¿Escribe una lista nueva de sopas/principios/jugos a diario, o rota un ciclo semanal fijo (lunes lentejas, martes fríjoles...)? Define si el producto necesita "lista del día" editable en 30 segundos o plantillas por día de la semana.
2. **¿Cobra un precio único o varía según la proteína?** (p. ej. res o pescado más caro que pollo). Determina cuándo usar `precio_extra` por proteína, que aquí quedó en 0 por no ser regla universal.
3. **¿Corrientazo y ejecutivo son platos distintos en su negocio?** ¿Uno lleva sopa y el otro no, o con distinto precio?
4. **¿El cliente elige o el restaurante arma el plato?** En muchos locales la persona elige proteína y el resto viene fijo; en otros elige todo. Afecta qué grupos son `requerido`.
5. **¿Se agota la proteína a media tarde?** Necesita marcar un ítem "agotado" rápido sin borrarlo, y saber si limita cantidades por proteína.
6. **¿Repite sopa, principio o jugo ("repite", "otra sopa")?** ¿Es gratis, tiene costo, o es parte del trato? Hoy no hay forma de modelarlo.
7. **¿Maneja almuerzos por suscripción/mensualidad, convenios con empresas o fiado a clientes de oficina?** Es común en este negocio y no apareció en ninguna fuente.
8. **¿Cuántas personas piden "sin sopa", "sin ensalada" o "sin arroz" y eso cambia el precio?** ¿Cuenta la bebida o el empaque para llevar como adicional?
9. **¿Inventario?** ¿Descuenta por porción de proteína (ej. 140 g) o no lleva inventario y solo cuenta platos vendidos?
10. **¿Domicilios?** ¿El almuerzo del día se vende por Rappi/WhatsApp con el mismo menú y precio, y cómo comunica la lista del día?
