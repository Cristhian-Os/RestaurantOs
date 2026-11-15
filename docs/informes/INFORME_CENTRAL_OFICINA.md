# RestaurantOS Central — la oficina, lista para subir a producción

Fecha: 2026-11-14. **Nada está aplicado en producción, nada está commiteado ni publicado.** Todo vive en `restaurantos-local`.

## 1. Resumen (simple)
La oficina que diseñaste ya está construida dentro de la app, en la ruta `/central`, solo para ti (superadministrador con código de 2 pasos). Tiene:
- **Inicio**, **Oficina** (3D circular con núcleo + 3 anillos, y plano 2D), **Mundo** (globo 3D y mapa plano), **Departamentos** (19 espacios), **Agentes** (11), **Conversaciones**, **Tareas / proyectos / aprobaciones**, **Reuniones**, **Biblioteca**, **Memoria institucional**, **Integraciones**, **Presupuestos**, **Auditoría**, **Configuración** y el panel de **Resti**.
- Todo es honesto: los agentes están "Diseñados / No conectados" y sus respuestas dicen **"Simulación local"**. Nada se envía fuera de RestaurantOS.
- Si Central falla, el resto de RestaurantOS sigue igual (es un paquete aparte).

## 2. Archivos
**Base de datos (nuevos, sin aplicar):** `supabase/migrations/20261114140000_central_nucleo.sql`, `supabase/rollback/20261114140000_central_nucleo_down.sql`, `supabase/tests/central_nucleo.sql`, `supabase/tests/central_nucleo_reversa.sql`.
**App (nuevos):** carpeta `src/central/` (39 archivos): puerta de acceso, datos, acciones, navegación, 12 pantallas en `paginas/`, plano 2D, y `3d/` (escena de la oficina, globo, calidad gráfica, máscara de continentes).
**Modificados:** `src/App.tsx` y `src/components/platform/PlatformPanel.tsx` (la ruta y el enlace "Abrir Central", de la fase anterior). Simulador de pruebas `.claude/qa-mock/mockSupabase.ts` (datos de Central de ejemplo; no va a producción).
**Guía:** `docs/informes/PASO_A_PRODUCCION_CENTRAL_SEGURIDAD.md` (ahora incluye la migración 3).

**Rediseño visual de la oficina 3D (2026-11-14, a pedido de Cristhian: "debe verse como las imágenes de referencia"):** edificio circular de vidrio con cornisa y entrada con cartel RestaurantOS (logo oficial), techo opcional con paneles solares (botón "Techo"), plaza con fuente, palmeras, vía circular, parqueaderos con autos, farolas y bosque; interiores amueblados por tipo de espacio (escritorios con pantalla, pared de video con mapa, mesa de juntas, cafetería, billar, jardín con lago…), pendones por departamento, núcleo con Resti (robot chef) y medallón del logo, cielo de día y de noche con estrellas, sombras, reflejos y brillo (solo en equipos potentes). Archivos nuevos en `src/central/3d/`: `kit.ts`, `texturas.ts`, `entorno.ts`, `mobiliario.ts`, `sectores.ts`; reescrito `OficinaEscena.ts`. Revisado en el simulador (escritorio y 375 px); no se probó en GPU/celular real.

**Estilo "liquid glass" en todo Central (2026-11-14, a pedido de Cristhian: "los módulos y todo deben ser estéticos… los paneles líquid glass… más definición sin sacrificar el rendimiento"):** nuevo `src/central/central.css` (solo actúa dentro de Central; el resto de la app no cambia): fondo azul noche con luz naranja, tarjetas de vidrio con brillo y borde, botones y menú activo en degradado naranja, diálogos ("Más", "Avisos", formularios) también en vidrio oscuro. Inicio ahora tiene una portada con la oficina 3D viva (cámara que se mece sola, sin gestos, 30 fotogramas, resolución moderada; si no hay 3D cae a un fondo de luz). Los agentes son robots chef (traje y gorro del color de su área); tarjetas de cifras con ícono luminoso; tarjetas de agentes y departamentos con resplandor de su color. Definición del 3D: resolución adaptable (baja sola si el equipo se atrasa, sube si le sobra), bordes más limpios en equipos potentes (4 muestras), texturas más nítidas de lejos, formas más redondas. Archivos tocados: `central.css` (nuevo), `Central.tsx`, `Shell.tsx`, `ui.tsx`, `paginas/{Inicio,Agentes,Departamentos}.tsx`, `3d/{OficinaEscena.ts,Oficina3D.tsx}` y `components/ui/Modal.tsx` (solo un interruptor opcional que por defecto no cambia nada). Revisado en el simulador (escritorio y 375 px, sin desborde lateral); no se midió en GPU/celular real.

**Ajustes posteriores (2026-11-14):** el robot grande del centro se quitó (tapaba la oficina y no era Resti): ahora el núcleo muestra solo el logo oficial, pequeño, sobre el pedestal. Los agentes se ven: robots chef más grandes, con marcador de su color sobre la cabeza y su nombre visible de lejos. La resolución adaptable ya no baja de la nativa de la pantalla y no mide mientras haces scroll (antes la imagen se ponía borrosa al bajar la página).

**Conexiones para que los agentes trabajen (2026-11-14/15, a pedido de Cristhian: "dejemos todas las conexiones necesarias para que los agentes empiecen a trabajar"; modelo principal Claude, también NVIDIA/DeepSeek, Telegram para avisos, redes sociales; autonomía "proponen y tú apruebas"):** todo queda APAGADO de fábrica y nada está instalado ni aplicado en producción. Guía paso a paso para Cristhian: `docs/informes/GUIA_CONEXIONES_CENTRAL.md`.
- *Servidor (nuevo, sin desplegar):* `supabase/functions/central-agente/` (responde en nombre del agente con Claude, NVIDIA o DeepSeek; acciones `estado`, `probar`, `responder`), `central-telegram/` (solo avisos de salida) y `_shared/central_acceso.ts` (solo super_admin con 2 pasos). Las llaves viven solo como secretos de Supabase (`CENTRAL_CLAVE_CLAUDE`, `CENTRAL_CLAVE_NVIDIA`, `CENTRAL_CLAVE_DEEPSEEK`, `CENTRAL_TELEGRAM_TOKEN`, `CENTRAL_TELEGRAM_CHAT_ID`); nunca pasan por la app ni las ven los agentes.
- *Protección de dinero:* interruptor general `ia_encendida`, tope mensual en USD (0 = no se gasta nada), presupuesto por agente, máximo 8 respuestas por minuto, respuesta limitada a 700 tokens, el costo se anota antes de guardar la respuesta, precio alto de respaldo si no hay precios configurados. El agente solo conversa y propone (sin herramientas ni acceso a datos).
- *Base de datos:* migración `20261114150000_central_conexiones.sql` (+ reversa en `supabase/rollback/`): solo agrega filas (config de IA apagada; integraciones Claude, NVIDIA, DeepSeek, Instagram/Facebook, TikTok, YouTube, X). Orden de las 4 migraciones de Central en la guía. No aplicada.
- *Pantallas:* Integraciones tiene un "Panel de IA" (interruptor, tope en USD, modelo principal, "Llave guardada/Falta" y botón Probar por proveedor, prueba de Telegram); Presupuestos pasa a USD; en Agentes la opción "Conectado" se habilita solo con la IA encendida; el chat usa la IA real cuando el agente está "Conectado" (burbuja "IA real") y, si no, la simulación honesta de siempre.
- *Verificación:* revisión de tipos sin errores; pruebas de Central OK (incluida `central-agente/logica.test.ts`); probado en el simulador (panel, botón Probar, tope, interruptor, agente Conectado, chat con respuesta simulada del servidor). El simulador NO llama a ningún proveedor real.
- *Sin verificar / pendiente:* llamadas reales a Anthropic/NVIDIA/DeepSeek/Telegram (necesitan llaves que pone Cristhian), despliegue de las funciones, la migración en producción (copia previa + "apruebo, aplica"), si la llave de NVIDIA acepta el modelo DeepSeek elegido (se confirma con "Probar"). Fases siguientes: avisos automáticos a Telegram, Google Workspace, adaptadores de redes sociales (publicar siempre lo aprueba una persona), que los agentes creen propuestas de tarea en Aprobaciones.

## 3. Dependencias
Ninguna nueva. Usa `three` (ya instalado). Los continentes van **dentro** de la app (no se descarga ningún mapa ni imagen: la política de seguridad solo permite recursos propios).

## 4. Pruebas hechas
- Base de datos local (PGlite): ~70 comprobaciones del núcleo **TODO OK** + prueba de reversa **TODO OK** (las 16 tablas se borran y la fase 1 sigue intacta).
- Pruebas de lógica (permisos, rutas, simulación, geometría, calidad, acceso): **todas OK**.
- Revisión de tipos (`tsc`): **sin errores**.
- Simulador, en escritorio y celular (375 px): las 14 pantallas abren sin errores; el chat responde "Simulación local"; puertas de acceso (sin 2 pasos, sin permiso, sin instalar) funcionan; guardar la ciudad de un restaurante lo pone en el globo; al perder WebGL el globo y la oficina caen solos al mapa/plano 2D con aviso y botón "Reintentar 3D".
- Revisión de seguridad del código: sin llaves, sin contraseñas, sin `console.log`, sin red externa. Solo toca tablas `central_*`, lee el rol de `profiles` y usa 3 funciones del servidor.
- Defecto encontrado y corregido: el mapa tenía dos franjas falsas de "tierra" (polígonos que cruzan el meridiano 180°). Regenerado y verificado.

## 5. Riesgos y lo que NO se pudo verificar
- **`npm run build` falla en mi computador** (Windows bloquea un archivo temporal de esbuild; pasa también sin el código nuevo). Hay que ver que Vercel compile antes de dar por publicado.
- No lo probé con datos reales (no hay acceso al proyecto de prueba de Supabase). La migración 3 solo se probó en una base local equivalente.
- El 3D se vio en un navegador sin GPU real; en celulares reales conviene mirarlo una vez.
- Con la recarga en caliente del desarrollo el 3D falló una vez al recargar y se recuperó con "Reintentar 3D"; en producción no hay recarga en caliente.

## 6. Decisiones pendientes tuyas
1. ¿Aplico la migración 3 en producción junto con la 1 y la 2 (cuando Cholaos cierre servicio y tengas copia nueva)?
2. ¿Autorizas commit y publicación de la app?
3. ¿Ubicas tú las ciudades de tus restaurantes (pantalla Mundo)? No se inventa ninguna.
4. Acciones solo humanas (suspender un restaurante, cambiar licencia): hoy **no existen** en Central a propósito. ¿Las quieres más adelante?
5. Conexiones reales (Telegram, Google Workspace, modelos de IA): cada una se decide por separado.

## 7. Estado
Construido y probado en local. **Pendiente: tu autorización para aplicar y publicar.**

## 8. Cómo lo ves tú
Con el simulador (no toca Cholaos): arrancar la configuración `restaurantos-qa-mock`, abrir `http://localhost:5174`, en la consola del navegador `localStorage.setItem('mockRole','super_admin'); localStorage.setItem('mockAal','aal2')`, y abrir `/central`. Pantallas a mirar: Oficina (botones Planta / Exterior / Interior / Recorrer y "Modo nocturno"), Mundo (toca el punto verde, prueba "Puntos de demostración" y "Mapa plano"), Agentes → Sofía → Conversación.
