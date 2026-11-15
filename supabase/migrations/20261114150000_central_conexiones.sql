-- Central · conexiones (todas APAGADAS de fábrica): modelos de IA, redes sociales y los límites de gasto.
-- Depende de: 20261114140000_central_nucleo (tablas central_config y central_integraciones). NO toca restaurantes, pedidos ni dinero.
-- Solo agrega filas y no cambia ninguna estructura: es seguro y se deshace con supabase/rollback/20261114150000_central_conexiones_down.sql.
-- Las LLAVES no se guardan en la base: viven como secretos de las funciones del servidor (ver docs/informes/GUIA_CONEXIONES_CENTRAL.md).
-- Estado de fábrica: IA apagada, límite de gasto en 0 (no se gasta nada) y ninguna integración conectada.

INSERT INTO public.central_config (clave, valor) VALUES
  ('ia_encendida',        'false'::jsonb),    -- interruptor general: apagado = ningún agente llama a un modelo
  ('ia_tope_mensual_usd', '0'::jsonb),        -- límite de gasto del mes (USD); 0 = no se gasta nada hasta que lo fijes tú
  ('ia_modelo_defecto',   '"claude"'::jsonb), -- claude | nvidia | deepseek
  ('ia_modelos',          '{}'::jsonb),       -- modelo por proveedor, p. ej. {"nvidia": "deepseek-ai/deepseek-r1"}; vacío = el de fábrica
  ('ia_precios',          '{}'::jsonb)        -- USD por millón de tokens, p. ej. {"claude": {"entrada": 3, "salida": 15}}; vacío = estimación alta y prudente
ON CONFLICT (clave) DO NOTHING;

INSERT INTO public.central_integraciones (id, nombre, descripcion, scopes, notas) VALUES
  ('claude',    'Claude (Anthropic)', 'Modelo de IA principal para dar voz a los agentes.',
     '["generar texto de conversación, con límite de gasto por agente y general"]'::jsonb,
     'La llave se guarda como secreto del servidor (CENTRAL_CLAVE_CLAUDE), nunca aquí. Los agentes solo conversan y proponen.'),
  ('nvidia',    'NVIDIA (DeepSeek y otros)', 'Modelos abiertos (DeepSeek, Llama…) por la API de NVIDIA, con formato compatible.',
     '["generar texto de conversación, con límite de gasto"]'::jsonb,
     'Llave como secreto del servidor (CENTRAL_CLAVE_NVIDIA). El nombre exacto del modelo se elige del catálogo de NVIDIA.'),
  ('deepseek',  'DeepSeek', 'API directa de DeepSeek (alternativa a pasar por NVIDIA).',
     '["generar texto de conversación, con límite de gasto"]'::jsonb,
     'Llave como secreto del servidor (CENTRAL_CLAVE_DEEPSEEK).'),
  ('instagram_facebook', 'Instagram y Facebook (Meta)', 'Páginas y cuentas de la marca RestaurantOS.',
     '["preparar borradores de publicaciones", "leer métricas de la página"]'::jsonb,
     'Meta exige crear una app y pasar revisión para publicar. Los agentes solo preparan borradores: publicar lo decide un humano.'),
  ('tiktok',    'TikTok', 'Cuenta de la marca.',
     '["preparar borradores de videos y textos", "leer métricas"]'::jsonb,
     'TikTok exige registrar una app de desarrollador y aprobación para publicar. Publicar siempre lo autoriza un humano.'),
  ('youtube',   'YouTube', 'Canal de la marca.',
     '["preparar títulos y descripciones", "leer métricas del canal"]'::jsonb,
     'Requiere un proyecto en Google Cloud con la API de YouTube. Subir o publicar siempre lo autoriza un humano.'),
  ('x_twitter', 'X (Twitter)', 'Cuenta de la marca.',
     '["preparar borradores de publicaciones", "leer métricas"]'::jsonb,
     'La API de X es de pago. Publicar siempre lo autoriza un humano.')
ON CONFLICT (id) DO NOTHING;
