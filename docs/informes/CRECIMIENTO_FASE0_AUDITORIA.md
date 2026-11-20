# Central Crecimiento — FASE 0: auditoría sin cambios

Fecha: 2026-11-19. Fuente: `PROMPT_DEFINITIVO_RESTAURANTOS_CENTRAL_CRECIMIENTO` (§15 manda empezar solo con auditoría).
En esta fase **no se cambió nada**: no hubo migraciones, despliegues, contactos ni publicaciones. Todo lo de abajo se consultó en producción (solo lectura) y en el repo (rama `feat/central`).

## 1. ¿Qué existe y funciona de verdad?

| Capacidad | Evidencia |
|---|---|
| Central privada (solo super_admin con 2 pasos) | `CentralGate`, función `exigirDueno`, 127 registros de auditoría |
| 11 agentes en estado "activo" con IA real (OpenRouter), IA encendida, tope 5 USD/mes | tabla `central_agentes`, `central_config` |
| Vigía de la plataforma cada hora (restaurantes, suscripciones, pedidos, opiniones → tareas propuestas + Telegram) | `central-vigia`; llamada programada respondió 200; 6 tareas reales |
| Tareas, aprobaciones, auditoría, niveles N0–N3 | tablas `central_tareas`, `central_aprobaciones`, `central_auditoria` |
| Planes y precios reales en producción: Esencial 160.000, Pro 260.000, Premium 325.000 (Premium **no disponible**) | tabla `planes` |
| Formulario de interesados de la página (`leads`) | tabla con columnas nombre, restaurante, ciudad, whatsapp, interés (**0 filas**) |
| WhatsApp para fidelización de clientes de un restaurante | `whatsapp-enviar`, `whatsapp-webhook` (no sirve para prospección fría) |

## 2. ¿Qué existe solo como pantalla o prototipo?

- Oficina 3D/2D, Reuniones, Proyectos, Documentos, Conocimiento: pantallas con 0 filas reales.
- Aprobaciones: existen pero tienen 0 filas (nadie las ha usado).
- Tabla `central_integraciones`: las 13 filas dicen "no conectada" aunque OpenRouter y Telegram sí funcionan (las llaves están en `platform_secrets`). La pantalla no refleja la realidad.
- Consumo de IA: `central_consumo` en 0 y solo 1 mensaje: los agentes aún no han hablado con IA real a escala.

## 3. ¿Qué no existe?

CRM y embudo de 17 etapas · prospectos y deduplicación · expedientes (Investigación/Ventas/Fundador) · campañas y autorizaciones · lista de supresión/no contactar · Contact Center (correo, bandeja, respuestas, bajas) · agenda comercial · paquete de llamada · Founder Execution Center (misión diaria de Chef Mayor) · Content & Brand Studio (calendario, piezas, aprobación, métricas) · matriz de funciones reales · métricas de crecimiento (MRR, CAC, churn) · modelo financiero de escenarios · búsqueda de negocios en fuentes públicas.

## 4. Integraciones: conectadas y faltantes

- **Conectadas:** OpenRouter (IA), Telegram (avisos hacia ti), Supabase, Wompi (cobro apagado hasta tener RUT con IVA y factura electrónica).
- **Faltan:** correo (Gmail/dominio de envío con SPF/DKIM) · Calendar · WhatsApp Business oficial para prospección · Instagram/Facebook (exige app y revisión de Meta) · TikTok, YouTube, X (apps de desarrollador y aprobación) · búsqueda web/negocios (proveedor sin decidir).

## 5. ¿Qué se puede ejecutar realmente hoy?

Vigilar la plataforma y crear tareas · conversar con los agentes · avisos a Telegram · explicar planes y precios reales. **No se puede** prospectar, enviar correos, agendar ni publicar.

## 6. ¿Qué bloquea prospección, contacto, citas y publicación?

1. No hay dónde guardar prospectos, campañas, autorizaciones ni lista de supresión (sin tablas).
2. No hay fuente legítima de descubrimiento de restaurantes (sin proveedor ni presupuesto definido).
3. No hay canal de envío conectado (ni correo ni WhatsApp oficial).
4. Publicar exige apps aprobadas por Meta/TikTok/YouTube/X; hoy solo hay borradores.
5. Los agentes no tienen herramientas externas (solo conversan y proponen).
6. Cobro real apagado: "cliente pagador" no se puede confirmar todavía.

## 7. Riesgos de seguridad, privacidad y costos

- **Privacidad (Colombia):** datos de prospectos y contacto comercial exigen habeas data (Ley 1581), aviso, baja inmediata y registro de fuente. Falta la política y la lista de supresión antes del primer envío.
- **Instrucciones maliciosas:** páginas y correos externos pueden intentar manipular a un agente; hoy no hay filtro específico para contenido externo.
- **Costo de IA:** hoy limitado por el tope (5 USD); la prospección masiva lo multiplicaría. Hay que fijar presupuesto por campaña.
- **Datos personales en `leads`:** guarda whatsapp e ip_hash; definir retención.
- **Tres versiones de precios en documentos** (el informe de Bloque 6 dice Premium 375.000; producción tiene 325.000, igual que este prompt). Fuente de verdad: tabla `planes`. Los límites de mesas/usuarios están guardados pero no se hacen cumplir.
- **Reputación:** enviar correos fríos desde el dominio principal sin calentamiento puede dañarlo.
- Cholaos Dany es producción real: ninguna prospección ni prueba debe tocar sus datos.

## 8. Orden recomendado

1. **Fase 1 — Gobernanza y fuente de verdad:** matriz de funciones reales, tablas de autorizaciones, lista de supresión, políticas (envío y publicación). Sin esto no se contacta a nadie.
2. **Fase 2 — CRM y expedientes** con datos ficticios etiquetados; deduplicación; tareas.
3. **Fase 3 — Founder Execution Center:** misión diaria de Chef Mayor y agenda interna. Da valor inmediato sin integraciones.
4. **Fase 5 — Content & Brand Studio solo en borradores** (calendario y piezas con aprobación). Publicar después, cuando haya API aprobada.
5. **Fase 4 — Contact Center:** primero borradores, luego envío real por Gmail con tu autorización y campaña piloto pequeña.
6. Fases 6, 7 y 8 después de medir el piloto.

## 9. Decisiones que necesitan tu autorización

1. Ciudad inicial (recomendado: Armenia y alrededores).
2. Canal de envío: cuenta de correo (recomendado: un dominio o buzón dedicado a ventas, no el principal) y quién la conecta con OAuth.
3. Proveedor de búsqueda de negocios y presupuesto mensual (recomendado: empezar con fuentes públicas manuales + un tope bajo).
4. Presupuesto de IA para ventas y contenido (hoy 5 USD/mes).
5. Si Premium se abre o sigue "próximamente", y si Cholaos pasa a precio piloto.
6. Crear una cuenta de desarrollador de Meta (la revisión tarda semanas).
7. Aprobar migraciones de Fase 1 (aditivas, probadas antes en el proyecto de prueba, con reversa).
