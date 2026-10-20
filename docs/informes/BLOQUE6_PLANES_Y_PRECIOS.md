# Bloque 6: planes, precios y cobro (informe)

Estado: **construido y probado SOLO en el proyecto de prueba. Nada en producción.**

## Precios (los que definió Cristhian el 20-oct-2026, IVA incluido)

| Plan | Mes | Sin IVA | Año (10,5 meses) |
|---|---|---|---|
| Esencial | $160.000 | $134.454 | $1.680.000 |
| Pro | $260.000 | $218.487 | $2.730.000 |
| Premium (varias sedes) | $375.000 | $315.126 | $3.937.500 |
| Sede adicional | $70.000 | | |

Prueba gratis: 7 días, sin tarjeta (igual que ya estaba). Los identificadores internos `emprende`, `pro` y `premium` no cambian.

## Qué se hizo

1. **Tabla `planes`** con precios, límites (Esencial: 15 mesas y 5 usuarios) y un interruptor "disponible". Es la única fuente de precios.
2. **Premium queda "Próximamente"** (no se puede elegir) porque incluye varias sedes y eso todavía no existe. Para abrirlo basta cambiar `disponible` con `plataforma_guardar_plan`.
3. **Funciones nuevas:** `planes_publicos` (la lee la página, el panel y el chatbot), `elegir_plan` (el administrador elige plan y ciclo; el servidor calcula el monto), `plataforma_guardar_plan` (solo el dueño con 2 pasos, con motivo y registro), `desglose_cobro` y `precio_plan`.
4. **Cada pago de suscripción guarda base, IVA y total** (`base_cop`, `iva_cop`, `total_cop`) en `wompi-init`, `wompi-subscribe` y `wompi-charge`. Las comisiones de vendedores ya usan esa base.
5. **Plan anual:** el webhook de Wompi renueva por 12 meses si el ciclo es anual, y al primer pago el restaurante deja de figurar como "trial".
6. **Pantallas:** página de inicio (precios "más IVA" desde la base, sin selector de mesas, Premium "Próximamente"), registro, y **Suscripción** del administrador (elegir plan, mensual o anual y ver base + IVA antes de pagar). Se quitaron "Multi-sucursal" y "soporte 24/7".
7. **Chatbot (`chat-support`)** lee los precios de la base en cada conversación.

## Pruebas (proyecto de prueba, revertidas solas)

- Precios y desglose correctos (base 134.454 y 218.487 coinciden con el spec).
- Administrador elige Esencial anual: queda `emprende / anual / $1.680.000`.
- Premium bloqueado; ciclo inválido bloqueado; un administrador no puede cambiar precios; anónimo no puede elegir plan; anónimo sí puede leer la lista pública.
- Los tipos de la app compilan. **No probado:** el cobro real con Wompi (no hay llaves de pruebas en el proyecto de prueba) ni las pantallas a la vista.

## Para pasar a producción (en este orden, con copia nueva y "apruebo, aplica")

1. Migración `20261020100000_planes_precios.sql` (aditiva; reversa en `supabase/rollback/`).
2. Publicar la app.
3. Desplegar las 4 funciones de Wompi y `chat-support`.

## Decisiones que dependen de Cristhian

- Los 5 restaurantes actuales siguen con su acuerdo (premium, 680.000 anotado, sin cobros). No se tocaron. Cholaos figura como "fundador" no promo: decidir si pasa a precio piloto (70.000 o 120.000) cuando haya cobro.
- Los límites (15 mesas, 5 usuarios) están guardados y se muestran, **pero todavía no se hacen cumplir**; hacerlo podría bloquear restaurantes existentes.
- El cobro real sigue apagado hasta tener RUT con IVA y factura electrónica.
