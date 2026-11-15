# RestaurantOS Central — Informe de la Fase 1 (seguridad y acceso)

Fecha: 2026-11-14 · Estado: **PARCIAL** (hecho y probado en local; nada aplicado a la base real, nada commiteado).

## Qué se hizo, en corto
1. **Se encontró y se arregló (en local) un hueco grave:** cualquier persona con sesión podía volverse `super_admin` cambiando su propio rol, o creando la cuenta con ese rol en los datos del registro público. Con eso entraba a todo, incluido Central.
2. **Regla única de acceso a Central en la base de datos:** solo `super_admin` **con código de 2 pasos** (`central_autorizado()`). Si falta cualquiera de los dos, la base no entrega nada.
3. **Registro de auditoría de Central** (`central_auditoria`): solo se puede añadir; nadie puede editar ni borrar. Guarda cada entrada y cada intento rechazado.
4. **Puerta en la app** (`/central`): sesión → rol → código de 2 pasos → confirmación del servidor. Sin un "sí" del servidor no se muestra nada.
5. **Enlace "Abrir Central"** solo dentro del panel de Plataforma (que ya es solo del superadministrador).

## Archivos
Nuevos:
- `supabase/migrations/20261114120000_cerrar_escalada_de_rol.sql` (+ reversa en `supabase/rollback/`)
- `supabase/migrations/20261114130000_central_acceso_auditoria.sql` (+ reversa en `supabase/rollback/`)
- `supabase/tests/seguridad_escalada_rol.sql` (17 comprobaciones) y `supabase/tests/central_acceso.sql` (20 comprobaciones)
- `src/central/acceso.ts`, `acceso.test.ts`, `CentralGate.tsx`, `Central.tsx`

Modificados: `src/App.tsx` (ruta `/central`, carga aparte), `src/components/platform/PlatformPanel.tsx` (enlace).

## Pruebas hechas
- Base local (copia mínima con las definiciones reales de producción): **sin el arreglo, 8 fallas; con el arreglo, todo OK**. Las reversas también se probaron.
- Central en base local: 20 de 20 OK.
- `npx tsc --noEmit`: sin errores. `node src/central/acceso.test.ts`: todo OK.
- Simulador (`restaurantos-qa-mock`): dueño con 2 pasos entra; dueño sin 2 pasos ve el código; admin y mesero ven "Central es privado"; sin sesión va a iniciar sesión; servidor sin instalar muestra aviso; celular sin desborde ni errores.

## Lo que NO está verificado
- **`npm run build` falla en este computador** con "Acceso denegado" al borrar un archivo temporal de esbuild. Falla **igual con el código limpio sin mis cambios**, así que no lo causa Central: es un bloqueo de Windows (probablemente el antivirus). Vercel compila en otro sistema, pero no lo he podido comprobar aquí.
- Las migraciones **no se han probado en el proyecto de prueba de Supabase** (su contraseña falla desde aquí) ni se han aplicado en producción.
- No he atacado producción para confirmar el hueco; lo reproduje en la copia local con sus definiciones reales (lecturas solamente).

## Dependencias
Ninguna nueva en la app. PGlite solo vive en `.claude/qa-mock/pg-local` (carpeta ignorada por git, solo para pruebas).

## Riesgos y decisiones tuyas
1. **Urgente:** el hueco de roles sigue abierto en producción hasta aplicar `20261114120000`. Pasos: copia manual reciente → probar en el proyecto de prueba → tu "apruebo, aplica" → verificar → reversa lista.
2. El registro público está activo (`disable_signup:false`). Con el arreglo ya no sirve para volverse superadministrador, pero conviene decidir si se cierra.
3. `20261114130000` (Central) va después de la anterior y con el mismo proceso.
4. Fases 2–9 (panel, departamentos, agentes, oficina 3D, globo) sin empezar; se basarán en tus 8 imágenes.

## Cómo validarlo tú
Pídeme que abra el simulador: entrar a `/central` como dueño (debe pedir el código y luego mostrar "Acceso verificado" y el registro) y como mesero (debe decir "Central es privado").
