# Paso a producción: Fidelización, WhatsApp, Domicilios, Mesas QR y Campañas

Guía única, en orden. Todo esto está probado SOLO en el proyecto de prueba (`restaurantos-prueba`) y en el simulador. Producción (Cholaos Dany es un cliente real) no se ha tocado.

## 0. Reglas de oro
- Se hace **de noche, después del servicio**, con la **copia de seguridad hecha** y solo cuando Cristhian diga **«apruebo, aplica»**.
- Antes de empezar, el informe `docs/informes/SEGURIDAD_FIDELIZACION_WHATSAPP.md` no debe tener hallazgos 🔴 sin resolver.
- Las migraciones se aplican **desde los archivos** de `supabase/migrations/`, en el orden de la sección 2. Nunca copiando y pegando a mano (en la base de prueba algunas se aplicaron a mano; el archivo es la versión correcta).
- Primero la base, después las funciones del servidor, al final la app. Al revés, la app llamaría funciones que todavía no existen.

## 1. Copia de seguridad y plan de reversa
1. En Supabase (proyecto de producción): confirma que hay una copia reciente en Database → Backups. Si el plan no la tiene, exporta la base con `pg_dump` y guarda el archivo fuera del repositorio.
2. **Guarda la definición actual de las funciones que esta entrega reemplaza** (por si hay que volver atrás): `create_public_order` y `crear_orden_completa`. Consulta `select pg_get_functiondef(oid) from pg_proc where proname in ('create_public_order','crear_orden_completa');` y guarda el resultado en un archivo.
3. Reversa de la app: en Vercel, volver al despliegue anterior (el de Cholaos con el commit `76550a5`). Las tablas nuevas no estorban a la app vieja.
4. Reversa de la base: las migraciones solo agregan tablas, columnas y funciones, salvo las dos funciones del punto 2 (se restauran con lo guardado). Si algo sale mal, lo primero es apagar (ver sección 6), no borrar.

## 2. Migraciones, en este orden
1. `20261107120000_fidelizacion_clientes_puntos.sql`
2. `20261107120100_whatsapp_domicilios_base.sql`
3. `20261107120200_campanas_arm_interacciones.sql`
4. `20261107120300_fidelizacion_privacidad_roles.sql`
5. `20261107120400_domicilios_pago_codigos.sql`
6. `20261107120500_whatsapp_bot.sql`
7. `20261107120600_wa_plantilla_repartidor.sql`
8. `20261108120000_whatsapp_bot_cerebro.sql`  ← **cambia `create_public_order`, `crear_orden_completa` y `dom_crear`**: son las que usan Caja y el menú público. Tras aplicarla, probar un pedido normal.
9. `20261108130000_mesas_qr_pedidos.sql`
10. `20261108140000_campanas_envio.sql`
11. `20261108150000_fidelizacion_premios_corte_arm.sql`
12. `20261108160000_domicilios_pulido.sql`
13. `20261108170000_domicilio_contra_entrega_pago_previo.sql`
14. `20261108180000_seguridad_fidelizacion_whatsapp.sql` (solo si existe: lo crea la revisión de seguridad)
15. `20261108190000_seguridad_fidelizacion_2.sql` (arregla M1, M2, M6, M7 y M8 de la revisión de seguridad; va DESPUÉS de la 180000; ya probada en la base de prueba)

Después de cada una: que no dé error. Al final, comprobar que no hay funciones duplicadas:
`select proname, count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' group by 1 having count(*)>1;`
(los duplicados que ya existían antes de esta entrega no cuentan; solo los de `wa_`, `dom_`, `fid_`, `mesa_`, `arm_`).

## 3. Funciones del servidor (Edge Functions)
- Desplegar: `whatsapp-webhook` (sin JWT: Meta no lo manda; la seguridad es la firma), `whatsapp-enviar` (sin JWT; exige el secreto de cron), `whatsapp-bot-probar` (con JWT).
- **No** desplegar `wallet-pass` todavía (faltan las cuentas de Apple y Google).
- Variable `APP_URL` (enlace al menú digital del restaurante). La llave del modelo de IA que ya usa Resti se reutiliza.
- Detalle completo en `docs/informes/WHATSAPP_PASO_A_PRODUCCION.md`.

## 4. La app
1. Revisar que la rama `feat/fidelizacion` compila: `npm run typecheck` y `npm run build`.
2. Fusionar a `main` solo después de las secciones 2 y 3 (Vercel despliega al fusionar). Confirmar que el cambio de login de Cholaos (`76550a5`) sigue incluido.
3. Antes de fusionar, hacer el commit de cada paso cuando Cristhian lo pida.

## 5. Prueba de humo (primero en Demo, luego en Cholaos)
- **Caja y pedidos normales:** crear un pedido, cobrarlo y hacer el corte. Debe dar lo mismo que antes.
- **Menú público:** abrir el menú, hacer un pedido de prueba.
- **Fidelización:** registrar un cliente, ver que el cajero solo ve nombre, nivel, puntos y los 4 últimos dígitos del teléfono.
- **Domicilio:** pedido a domicilio con transferencia (no debe llegar a cocina hasta confirmar el comprobante) y contra entrega (el repartidor paga primero en caja; sin eso no puede salir).
- **Mesas QR:** escanear `?mesa=N`, pedir, aceptar como mesero.
- **Campañas / Puntos / Asistente:** abrir las pantallas, no enviar nada real.
- **WhatsApp:** debe quedar en modo «desactivado»; no se manda ningún mensaje.

## 6. Todo queda APAGADO por defecto
- WhatsApp: modo «desactivado» en todos los restaurantes.
- Bot que toma pedidos: apagado.
- Wallets de Apple y Google: no desplegadas.
- Programación automática del envío (cron): no programada.
- Cada restaurante enciende lo suyo desde Configuración, cuando tenga sus llaves de Meta.

## 7. Lo que depende de Cristhian (no lo puede hacer el código)
1. Una cuenta personal de Facebook real y activa (la de «Restaurantos» fue inhabilitada) para crear el portafolio empresarial y la aplicación en Meta.
2. El token permanente de usuario del sistema, el App Secret y el token de verificación; se cargan en Plataforma → «WhatsApp (llaves de Meta)». Nunca por chat ni por correo.
3. Aprobar las plantillas en Meta (lista en la guía de WhatsApp).
4. Cuentas de Apple Developer y de Google Wallet, solo cuando se quiera activar las wallets.
5. Programar el envío automático cuando WhatsApp esté listo (SQL en la guía de WhatsApp).

## 8. Pendientes conocidos
- El descuento en Caja al canjear un premio no está hecho (decisión registrada en la arquitectura).
- El asistente de clientes propone, pero todavía no crea campañas solo.
- Recoger con transferencia no existe: recoger se paga en el local.
- Los platos «armados a tu gusto» no se piden por QR todavía.
- Notificación push al mesero por QR: sin garantía.
- Pruebas con la IA real y con Meta real: pendientes hasta tener las llaves.
