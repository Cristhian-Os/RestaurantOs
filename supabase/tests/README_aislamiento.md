# Prueba de aislamiento multi-restaurante (`aislamiento_multitenant.sql`)

Prueba automatica y generica: demuestra que un restaurante no puede leer, modificar, borrar ni crear datos de otro,
y que nadie se puede "ascender" para saltarse esa regla. Se corre **antes de cada despliegue**, contra una copia/proyecto
de PRUEBA, y debe terminar con `0 FALLA`.

No esta escrita tabla por tabla: descubre en el catalogo las tablas, vistas y funciones de `public`, asi que una tabla o
funcion **nueva** queda cubierta sola (si tiene `restaurant_id`, o cuelga por FK de un restaurante, o es `SECURITY DEFINER`).

## Como correrla

Requisitos: una base con el esquema completo y las migraciones aplicadas (la replica local o un proyecto Supabase de PRUEBA)
y una conexion con rol dueño/superusuario (el bloque hace `SET LOCAL ROLE authenticated|anon`, igual que las otras pruebas).
**Nunca en produccion.** Todo se revierte al final (`RAISE EXCEPTION 'TEST_OUTPUT'`), pero conviene correrla sobre un clon.

```bash
# Local (recomendado: clon desechable)
psql -h <host> -U <usuario> -d postgres -c "create database aislamiento_tmp template <mi_base>"
psql -h <host> -U <usuario> -d aislamiento_tmp -X -f supabase/tests/aislamiento_multitenant.sql 2>&1 | tee aislamiento.txt

# Como compuerta de despliegue: falla si hay alguna FALLA o si no llego al resumen
grep -E '^RESUMEN: [0-9]+ OK, 0 FALLA$' aislamiento.txt || { echo "AISLAMIENTO ROTO"; exit 1; }
```

En el editor SQL de Supabase (proyecto de prueba): pegar el archivo completo y ejecutar; el resultado aparece como el
mensaje del error `TEST_OUTPUT` (es lo esperado: asi se revierte todo). Tarda ~10-15 s.

## Como leer el resultado

Cada linea numerada termina en `: OK` o `: FALLA ...` y es la unica que cuenta. La ultima linea es
`RESUMEN: N OK, M FALLA`. Otras lineas **no cuentan pero hay que leerlas**:

| Prefijo | Significa |
|---|---|
| `AVISO:` | Algo que la prueba no pudo concluir o que conviene revisar (tabla no sembrada, rechazo no concluyente, capacidad por uuid, storage sin politicas...). |
| `no cubierto automaticamente: f(...)` | Funcion `SECURITY DEFINER` que la prueba no supo llamar sola (tipo de argumento sin generador, o falta una fila de B para el uuid). **Revisar a mano.** |
| `INFO:` | Contexto: cobertura, tablas globales, control positivo, grants de anon, stubs usados. |

Que se prueba (la primera linea `1)` imprime la cobertura "sembradas X de Y"; si X < Y esa linea es FALLA):

1. **Siembra generica**: crea restaurantes A y B, usuarios (admin, cashier, waiter, kitchen de A; admin A *inactivo*; cliente sin restaurante; `super_admin` **sin aal2**; staff de B) y siembra una fila por restaurante en cada tabla con `restaurant_id` (y en las hijas por FK), respetando NOT NULL, FK y CHECK. Las tablas que no logra sembrar se listan con su error.
2. **Por cada actor y cada tabla/vista**: SELECT, UPDATE y DELETE sobre filas de B deben afectar 0 filas (o fallar); INSERT con `restaurant_id` de B debe fallar (WITH CHECK); "secuestro" (`UPDATE ... SET restaurant_id = B` sobre filas propias) debe fallar; y ninguna relacion (con o sin `restaurant_id`) puede mostrar texto sembrado de otro restaurante ("MARCADORES"). `anon` no ve nada salvo la lista blanca.
3. **Perfil inactivo** (`profiles.active=false`): no ve ni toca nada de su restaurante.
4. **Escalada**: nadie puede cambiar con UPDATE directo su propio `role`, `restaurant_id` ni `active` (se mide el estado final, no el mensaje de error).
5. **Integridad de pedidos / cobro**: el personal no reescribe `total/items/paid_at` de un pedido por UPDATE directo; cajero/mesero/cocina no leen `payments`, `subscriptions` ni `restaurant_payment_config` (solo admin).
6. **Privilegios peligrosos**: `anon`/`authenticated` sin `TRUNCATE` (salta RLS) y `anon` sin INSERT/UPDATE/DELETE en `public`.
7. **Vistas**: toda vista legible por anon/authenticated es `security_invoker`, o filtra (ningun actor ve filas ajenas) o esta en la lista blanca.
8. **Funciones `SECURITY DEFINER`** ejecutables por authenticated/anon: se llaman desde cada actor con **ids de B** y argumentos plausibles (mapa `argmap` + valores por tipo/nombre). Es FALLA si (a) cambia algo de B (huella hash de todas las filas de B antes/despues), (b) el resultado contiene datos o ids de B que no se le pasaron, o (c) responde con exito a un id de B **distinto de como responde a un id inexistente**.
   *Control positivo*: cada funcion se ejecuta tambien como dueño de B (admin/cajero/mesero/cocina de B, super_admin aal2, anon). Si nadie logra ejecutarla con esos argumentos, el rechazo desde A es **no concluyente** (puede ser solo validacion) y se lista en `AVISO`/`INFO`; si el texto del error es de autorizacion se acepta y se lista como "rechazo aceptado por el texto del error".
9. **Storage** (`restaurant-assets`, `branding`): si hay politicas sobre `storage.objects` que mencionen el bucket, prueba INSERT/UPDATE/DELETE del admin de A sobre la carpeta de B con control positivo en la carpeta propia; ademas evalua la funcion real `public._asset_ok` con rutas de B. Si la base no tiene storage o no tiene politicas del bucket, escribe `storage no probado`. Si falta `storage.filename` (replicas), crea un stub temporal que se revierte.

## Lista blanca (lo unico que se permite ver/usar sin ser del restaurante)

Esta en el bloque `-- LISTA BLANCA` del SQL. Mantenla corta; cada entrada debe poder justificarse:

* Vistas/tablas: `restaurants_public` (solo `id, slug, name`, para resolver el QR), la propia fila de `profiles`, y para `anon` los platos disponibles (`dishes` disponibles y `vista_productos_disponibles`).
* Funciones publicas **por diseño** (el comensal anonimo las usa con el id del restaurante/plato/token): `config_publica`, `restaurante_publico`, `planes_publicos`, `listas_opciones_publicas`, `ingredientes_publicos`, `obtener_interacciones_platos`, `online_payments_enabled`, `create_public_order`, comentarios/resenas/reacciones de platos, `tv_cocina_*` (el token es el secreto) y `_restaurante_activo` (helper de la politica publica de `dishes`). No se juzgan; se listan.
* "Capacidad por uuid de pedido": `estado_pedido_publico`, `obtener_items_pedido_cliente`, `cancelar_orden`, `editar_items_pedido` aceptan a quien tenga el uuid del pedido (el comensal). Salen como `AVISO` (no FALLA): es aceptable solo mientras ese uuid no se exponga a terceros.

Una entrada nueva en la lista blanca es una decision de seguridad: debe ir en el PR con su justificacion.

## Que NO cubre

* Solo el esquema `public` (y las politicas de `storage.objects` si existen). No prueba `auth.*`, GoTrue, ni que el JWT no se pueda falsificar.
* No pasa por PostgREST/Realtime/Edge Functions: prueba la base. Una Edge Function con `service_role` que olvide filtrar por restaurante no se detecta aqui; tampoco canales Realtime ni cabeceras CORS.
* Los argumentos de las funciones son plausibles, no exhaustivos: una funcion que valida antes de autorizar puede quedar "no concluyente". Revisar a mano todo lo listado como `no cubierto automaticamente`, `NO concluyente` y "rechazo aceptado por el texto del error".
* Un restaurante A vs uno B con una fila por tabla: no prueba volumen, concurrencia, carreras ni efectos temporales (suscripciones vencidas, cortes de caja a cierta hora).
* No prueba inferencia por canales laterales (tiempos, mensajes de error, conteos agregados) mas alla de comparar la respuesta con la de un id inexistente.
* Tablas "globales" (sin `restaurant_id` ni FK a un restaurante: `planes`, `leads`, `vendedores`, ...) solo se revisan por marcadores de texto; su politica hay que juzgarla a mano.
* `super_admin` con aal2 (el dueño de la plataforma) puede ver todo por diseño; solo se prueba que **sin aal2** no pueda.
* Efectos fuera de la base (envio de correos, push, HTTP via `pg_net`, escritura de archivos de Storage por API) no se ejercitan; correr solo en proyecto de prueba.
* Si una tabla no se pudo sembrar queda en `AVISO: tablas NO sembradas` y la linea `1)` es FALLA: hay que ensenarle al sembrador (una fila a mano) o aceptarlo explicitamente.

## Como se valido que "tiene dientes"

Contra la copia de la base original de produccion (sin las migraciones nuevas) la prueba reporta FALLA reales: escalada de rol del propio perfil, reescritura de pedidos por UPDATE directo, lectura anonima de `restaurant_config`, `TRUNCATE`/DML de `anon` sobre tablas, pagos/suscripciones legibles por mesero/cocina/cajero, perfil inactivo que sigue viendo su restaurante, `order_total_cents` accesible, `super_admin` sin aal2 con acceso total. Ademas se verifico con fugas sembradas a proposito (politica `USING (true)`, vista sin `security_invoker`, funcion que devuelve un pedido ajeno, politica de storage de `branding` abierta): todas se detectan.
