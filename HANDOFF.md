# HANDOFF — Control de Horas Extra (XTERRA Costa Rica)

Documento de contexto para retomar el proyecto en cualquier momento.

---

## 1. Resumen del proyecto

Aplicación web progresiva (PWA) para que el personal de XTERRA Costa Rica registre y
calcule las horas extra trabajadas. Funciona en navegador y se puede instalar en el
celular como app. Los datos se guardan en la nube (Supabase) con inicio de sesión por
correo, de modo que se sincronizan entre dispositivos y no se pierden si se daña el celular.

- **URL en producción:** https://overtime.raceclubhub.com
- **Repositorio GitHub:** https://github.com/Nancyms1012/Horas-Extra
- **Idioma de la interfaz:** Español

---

## 2. Infraestructura y despliegue

### Hosting
- **Cloudflare Worker con static assets** (NO es Cloudflare Pages).
- La integración Git del dashboard NO funcionó de forma confiable (se desconectaba de
  la cuenta de GitHub), por eso el método que SÍ funciona es desplegar directamente por CLI.

### Cómo desplegar
```bash
cd overtime-tracker
export CLOUDFLARE_API_TOKEN="<token>"
npx wrangler@4.120.1 deploy
git push origin main
```
> El token de API se crea en Cloudflare → My Profile → API Tokens → plantilla
> "Edit Cloudflare Workers". Es un valor sensible: no debe quedar guardado en el repo.

### Datos de Cloudflare
- **Account ID:** `410d32a609504b9993528287b839af0d`
- **Zona `raceclubhub.com` ID:** `1554a1aca6f759dbb844407f4f8b33b9`
- **Nombre del worker:** `overtime-app`
- El dominio personalizado `overtime.raceclubhub.com` se agregó vía la API de
  Workers domains (requirió borrar antes un registro DNS existente para ese subdominio).

### Estructura de archivos
```
overtime-tracker/
├── public/              # Archivos estáticos servidos por el worker
│   ├── index.html
│   ├── app.js           # Toda la lógica de la app
│   ├── styles.css
│   ├── sw.js            # Service Worker (estrategia network-first)
│   ├── manifest.json    # Config PWA (instalable)
│   ├── _headers         # Headers de seguridad
│   └── icons/
├── worker.js            # Stub del worker (los assets los sirve Cloudflare)
├── wrangler.toml        # [assets] directory = ./public
├── supabase-setup.sql   # Script de creación de tablas
└── HANDOFF.md           # Este documento
```

---

## 3. Base de datos y autenticación (Supabase)

- **URL:** https://hcqykizneteracvmcddc.supabase.co
- **Auth:** email + contraseña (Supabase Auth). La pantalla de login tiene "recordar
  contraseña" y botón para ver/ocultar la contraseña.
- **Seguridad:** todas las tablas usan Row Level Security (RLS) filtrando por `user_id`,
  cada usuario solo ve sus propios datos.

### Tablas
| Tabla | Columnas clave |
|---|---|
| `user_settings` | work_start, work_end, work_days[], salary, currency |
| `overtime_entries` | date, check_in, check_out, is_holiday, **day_type**, overtime_minutes, amount |
| `period_cuts` | cut_date, period_start, period_end, **pay_date**, **label**, total_minutes, total_amount, entries_count |

> El script completo está en `supabase-setup.sql`. Si se agregan columnas nuevas,
> recordar ejecutar el `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` en el SQL Editor
> de Supabase (la app no migra la base de datos automáticamente).

---

## 4. Reglas de cálculo de horas extra

Tarifa base por hora = **salario mensual / 240**.

| Tipo de día (`day_type`) | Cálculo |
|---|---|
| `normal` (día laboral) | Solo las horas extra (después de la hora de salida configurada) a **×1.5** |
| `off-day` (día libre / no laboral) | **Todas** las horas trabajadas a **×2** |
| `holiday-work` (feriado en día laboral) | Horas normales a **×2** + horas extra a **×3** |

Notas:
- La hora de entrada normalmente es la del horario configurado. En Inicio, al elegir un
  tipo de día distinto de "normal", aparece un campo para indicar una hora de entrada
  diferente (ej. un feriado que se trabajó con otro horario). El modal de agregar/editar
  también permite fijar hora de entrada.
- El check out en Inicio usa la hora actual del dispositivo.

---

## 5. Períodos de pago (quincenas)

- Días trabajados del **1 al 15** → se pagan el **30 del mismo mes**.
- Días trabajados del **16 al fin de mes** → se pagan el **15 del mes siguiente**.
- **Cierre automático:** al abrir la app, si hay una quincena pasada con registros sin
  cerrar, se cierra sola (revisa hasta 3 períodos atrás).
- **Cierre manual:** botón "Cerrar Quincena" en la pestaña Historial.
- Las quincenas cerradas quedan en un historial con total de horas, monto y días, y la
  fecha de pago, para comparar contra el pago recibido.

### Vistas del historial
Filtros disponibles: quincena actual, esta semana, este mes, todos.

---

## 6. Notas importantes / lecciones aprendidas

- **Zona horaria (bug corregido):** Costa Rica es UTC-6. Se usaba `toISOString()` (UTC),
  lo que hacía que después de las 6 PM las fechas saltaran al día siguiente. Se corrigió
  usando componentes de fecha LOCAL (`getFullYear/getMonth/getDate`). Ver `getToday()`,
  `getTodayLocal()` y `formatISODate()` en `app.js`.
- **Caché del Service Worker:** el SW usa estrategia *network-first*. Cuando se hace un
  cambio importante, subir la versión de `CACHE_NAME` en `sw.js` (va por `v3`) para forzar
  que los dispositivos descarguen la versión nueva. Si un usuario ve una versión vieja,
  debe cerrar del todo la app y volver a abrirla.
- **Deploy:** siempre por `npx wrangler@4.120.1 deploy` + `git push`. No depender de la
  build de Git del dashboard de Cloudflare.
- Los registros guardados con datos incorrectos (p. ej. fechas viejas por el bug de zona
  horaria) se corrigen editándolos (✏️) o borrándolos en el Historial; la app no los
  reajusta retroactivamente.

---

## 7. Ideas / pendientes

- Ícono propio de la app (se conversó pero quedó pendiente de definir estilo y colores).
- Ajustes de colores/branding (pendiente de decisión de la usuaria).
