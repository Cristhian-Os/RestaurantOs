# Resti 3D y proveedor de IA — estado (2026-10-22)

## Personaje 3D (procedural, gratis, sin archivos de modelo)

- `src/components/resti/rig/restiRig.ts`: esqueleto de 16 articulaciones + dedos articulados. **Apariencia fija**: ningún color, forma ni material depende del estado.
- `src/components/resti/rig/restiAnim.ts`: cada estado fija una postura objetivo; cada articulación la persigue con un resorte amortiguado **sobre cuaterniones** (camino más corto) con tope de velocidad (~400°/s). Cambiar de estado a mitad de movimiento transforma la postura actual: no hay saltos. Caminata, respiración y aleteo del saludo son capas aditivas con peso suavizado.
- Los ángulos de los brazos se resolvieron numéricamente (posición de la mano: mentón, oído, pecho, cintura…), no a ojo.
- `src/components/resti/RestiCharacter3D.tsx`: lienzo transparente, carga diferida (chunk propio, 136 kB gzip; se precarga al pasar el cursor por el gorro), pausa con la pestaña oculta, ~24 fps en reposo, modo ligero en equipos modestos. Si WebGL falla → `onFallo` → sprites.
- Estados: reposo, saludo, caminar, señalar, pensar, escuchar, explicar, ejecutar, listo, alerta, seguro (manos en la cintura).
- Pruebas: `node src/components/resti/rig/rig.test.ts` (posición de la mano por pose, apariencia idéntica tras animar todos los estados, giro máximo por cuadro < 0.15 rad ≈ 9 rad/s).

### Limitaciones conocidas (no maquillar)
- Es una versión simplificada de la referencia: faltan costuras finas, bolsillos esculpidos, guantes con pliegues y el desgaste de las botas.
- El emblema (engranaje + icono de encendido) es una reproducción en código, no el archivo oficial. Para exactitud hace falta el vector/PNG de alta resolución.
- El respaldo por sprites (`public/assets/resti/`) NO se ha comparado con la referencia; si se usa cuando WebGL falla, el aspecto podría diferir. Pendiente: generar los respaldos como capturas del mismo rig.
- Medido solo con renderizado por software en un navegador sin GPU; los FPS reales en dispositivos no están medidos.
- No probado montado dentro del panel real (requiere sesión de Supabase de un administrador con `resti_agent` activo).

## Proveedor de IA (investigación)

Fuentes oficiales no accesibles desde este entorno (proxy); lo siguiente viene de búsquedas y es **por verificar** antes de decidir.

| Opción | Gratis | Hallazgos |
|---|---|---|
| Gemini API (actual) | Sí, con cupo | El nivel gratuito **usa los datos enviados para mejorar productos de Google** (revisión humana posible). Activar facturación lo cambia. Foros reportan recortes del cupo gratuito (de 250 a ~20 peticiones/día en 2.5 Flash, no oficial). Google indica que los modelos 2.5 quedan limitados para proyectos nuevos: **riesgo para `gemini-2.5-flash`, usado hoy en 6 funciones**. |
| Groq | Sí, con cupo (cifras no verificadas) | `gpt-oss-120b`/Llama con tool use y JSON; strict schema solo en algunos modelos; no combina structured outputs con tool use. |
| OpenRouter `:free` | Sí | 20 peticiones/min y 50/día (1000/día con 10 USD de crédito); las fallidas también gastan cupo. No apto para producción. |
| DeepSeek | No (pago por uso, muy barato) | Documentación oficial no accesible desde aquí; fuentes contradictorias sobre JSON/tool calling. Sin probar. |

**Conclusión:** ninguna opción gratuita es adecuada para producción con datos reales de restaurantes (cupos mínimos o uso de los datos para entrenar). Para desarrollo y pruebas sirven Groq u OpenRouter. Para producción conviene un proveedor de pago con retención/entrenamiento desactivado: el costo estimado es de centavos por restaurante al mes con el tope actual de 80 mensajes/día. La capacidad agéntica depende más de la arquitectura (catálogo de herramientas, validación en servidor, confirmaciones) que del modelo: por eso el siguiente paso es una capa de proveedor intercambiable.
