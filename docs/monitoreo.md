# MONITOREO · auditoría, arquitectura, pruebas y checklist

Ampliación de la práctica 4.1 (CONTROL) con la vista MONITOREO, en el mismo sitio y repositorio.
No se creó backend, tablas, procedimientos ni CRUD. MONITOREO es de solo lectura: no envía comandos.

---

## 1. Auditoría de contratos reales

Verificado contra `https://vehiculo-iot-itp.duckdns.org` el 2026-11-13. Fuentes: `/openapi.json`, GET reales y captura WSS de solo lectura, más una prueba controlada (comando «Luz ON/OFF», DETENER y DEMO 1) autorizada por el autor.

| Contrato | Resultado verificado |
|---|---|
| Autenticación | OpenAPI no declara `securitySchemes`. No hay tokens ni credenciales en el frontend. |
| CORS | Solo `Access-Control-Allow-Origin: https://80chucho08.github.io`. `localhost` y `127.0.0.1` quedan bloqueados para REST. |
| `GET /api/vehiculos/1/estado` | `{ total, estado: [{ id_vehiculo, vehiculo, id_comando, comando, codigo, conectado, fecha_actualizacion }], conectado_websocket }` |
| `GET /api/vehiculos/1/historial` | Sin parámetros (no hay límite, orden ni filtro). `{ total, historial: [{ id_historial, id_vehiculo, comando, codigo, fecha_hora, origen }] }` con más de 770 filas (~97 KB), en orden descendente por `id_historial`. |
| `origen` | `interfaz_web`, `demo`, `api`. Lo asigna el backend según el endpoint, no según el cliente. |
| Filas con `comando` y `codigo` `null` | Son DETENER: `POST /detener` generó la fila 761 con `comando: null`. |
| Fechas | ISO sin sufijo de zona, en **UTC**: el POST de las 05:50:13 UTC quedó como `05:51:24`, un desfase de reloj de ~1 min, no de zona horaria. |
| `POST …/comandos/{id}/ejecutar` y `POST …/detener` | `200 { mensaje, id_solicitud, estado: "entregado_a_observadores", resultados: [] }`. El mensaje fue «No hay dispositivo conectado; el comando se entregó a 2 cliente(s) WebSocket». |
| `POST …/demos/{id}/ejecutar` | `202 { mensaje, id_vehiculo, id_demo, estado: "en_ejecucion" }` |
| WSS al conectar | `estado_inicial { id_vehiculo, estado: [...], demos: [...] }` |
| WSS por comando | `comando_individual { id_vehiculo, id_solicitud, id_comando, comando, codigo }`, y ~50 ms después `comando_individual_completado { id_vehiculo, id_solicitud, id_comando, comando, estado, mensaje }` (sin `codigo`). |
| WSS de DETENER | `comando: "APAGAR_TODO"`, `codigo: 0`, `id_comando: null` |
| WSS de DEMO | `demo_iniciada { id_demo, nombre, total_movimientos }`, luego N pares `comando_individual` / `_completado` **idénticos** a un comando suelto (sin `id_demo` ni `origen`), y al final `demo_completada { id_demo, total_movimientos }`. Los pasos se persisten con `origen: "demo"`. |
| Correlación evento ↔ fila | El historial **no** incluye `id_solicitud`. Se confirma por `id_historial` mayor al último conocido + mismo `codigo` (o `null` para DETENER). |
| Presencia del vehículo | No existe una señal fiable: `conectado_websocket` siguió en `false` con un cliente WSS abierto. Solo se etiqueta la sesión WSS del navegador. |
| Salud | `GET /` (API) y `GET /health/db` (RDS), ya implementados en `core/health.js`. |
| Número de servicios | OpenAPI expone 27 operaciones; la etiqueta histórica dice «API de 21 servicios». |

**Diferencias con el enunciado**

- El proyecto no usa Bootstrap 5. Se reutilizan los componentes propios para no romper el diseño de la 4.1.
- El pie conserva la matrícula: «Desarrollado por Navarro Carbajal Jesus Alfonso · 22200964 · 2026».

---

## 2. Arquitectura

```
                         GitHub Pages · https://80chucho08.github.io/<repo>/  (rutas relativas)
 ┌──────────────── index.html · CONTROL ─────────────┐   ┌──────────── monitoreo.html · MONITOREO ─────────────┐
 │ joysticks · DETENER · DEMO · luz · indicadores    │   │ último movimiento · tabla de 10 · DEMO en vivo       │
 │ control/*  (sin cambios de lógica)                │   │ monitoreo/main · ultimo-movimiento · historial        │
 └───────┬───────────────────────────┬───────────────┘   └───────┬──────────────────────────────┬──────────────┘
         │ core/api.js (REST)         │ core/ws.js (WSS)          │ core/api.js (GET estado/historial)   │ core/ws.js
         │ POST ejecutar/detener/demo │ 1 conexión por pestaña    │ core/health.js · conectividad.js     │ 1 conexión
         ▼                            ▼                           ▼                                      ▼
 ┌───────────────────────────── AWS · Caddy (HTTPS/WSS) → FastAPI/uvicorn ─────────────────────────────────────┐
 │  REST (27 operaciones) · /ws/vehiculos/1 publica comando_individual, _completado, demo_iniciada/completada   │
 └──────────────────────────────────────────────┬──────────────────────────────────────────────────────────────┘
                                                │ SQL (solo el backend)
                                                ▼
                                        Amazon RDS MySQL (historial, estado, comandos, demos)
```

- **Una conexión WSS por pestaña, no compartida.** CONTROL y MONITOREO son páginas distintas. Compartir un socket exigiría `SharedWorker` (no disponible en Chrome Android) o convertir el sitio en SPA. Se reutiliza el mismo `core/ws.js`, con reconexión exponencial con jitter y un manejador registrado una sola vez por página.
- **El navegador nunca habla con RDS.** Solo el backend lo hace.

---

## 3. Lógica

### Último movimiento (`monitoreo/ultimo-movimiento.js`)

1. **Carga inicial:** `GET /estado` muestra el comando y la fecha del backend. La fase «Persistido en RDS» queda en ✓ porque el estado viene de la base.
2. **`estado_inicial`** (WSS, en cada conexión): se aplica como snapshot.
3. **`comando_individual` válido:** actualiza la tarjeta al instante con «Publicado por WSS». `comando_individual_completado` con el mismo `id_solicitud` marca «Entregado por el backend (sin confirmación de firmware)».
4. **Persistido en RDS:** pasa a ✓ solo cuando `GET /historial` devuelve la fila. Entonces la fecha mostrada cambia de «hora de recepción en este navegador» a «fecha registrada por el backend».
5. **Ejecutado físicamente:** siempre «No verificable». No hay telemetría ni heartbeat del dispositivo.
6. **Protección contra datos viejos:**
   - Cada evento WSS incrementa una marca local.
   - Un snapshot REST lanzado antes de un evento más nuevo **no** reemplaza la tarjeta; solo la confirma si coincide.
   - Entre snapshots se compara `fecha_actualizacion`, que viene del mismo reloj del backend.

### Tabla de 10 (`monitoreo/historial.js`)

- **Carga:** `GET /historial`, validando cada fila. Se descartan las de otro vehículo, las de formato inválido y las de `origen: "demo"`. Se deduplica por `id_historial`, se ordena de forma descendente por `id_historial` y se toman 10.
- **Render por claves (`data-id`):** solo se crean, mueven o quitan las filas necesarias. La fila 11 sale del DOM; **no se borra nada en RDS**. El texto se escribe siempre con `textContent`.
- **Peticiones:** una sola en vuelo. Si llega otra solicitud mientras tanto, se encadena **una** recarga más. Nunca se aplica una respuesta cuyo `id_historial` máximo sea menor que el ya mostrado.
- **Confirmación tras un evento WSS individual:**
  1. Agrupa ráfagas durante 400 ms y hace una recarga.
  2. Si la fila no aparece, reintenta a los 900 ms y a los 2500 ms.
  3. Si sigue sin aparecer, marca «Aún no aparece en el historial».

  No hay polling continuo.
- **Pasos de DEMO:** no disparan confirmación ni entran a la tabla.
- **Estados visibles:** «Cargando movimientos…», «Sin movimientos individuales registrados.», «Desconectado: …» y «Error al consultar el historial: …». Si ya había datos, se conservan con un aviso.

### Recuperación

- **Al reabrir el WSS** (no en la primera conexión), al recibir el evento `online` del navegador y tras `demo_completada`: resincronización REST de estado e historial, cada uno de forma única en vuelo.
- **Si se pierde la conexión durante una DEMO:** su estado pasa a «desconocido». Si no llega `demo_completada` en `DEMO_TIMEOUT_MS`, también.

### Indicadores (`core/conectividad.js`)

Son tres, independientes entre sí:

| Indicador | Origen | Estados |
|---|---|---|
| WSS | Sesión de este navegador | En línea / Conectando / Reconectando / Desconectado |
| API AWS | `GET /` con backoff y pausa en pestaña oculta | Disponible / Comprobando / No disponible |
| RDS | Solo `GET /health/db` | Disponible / No disponible / Sin verificar |

No se deduce RDS a partir del WSS ni el estado de las 21 APIs a partir del health.

### Zona horaria (`core/fecha.js`)

Las fechas se interpretan como UTC (`ZONA_HORARIA_BACKEND`) y se muestran en `America/Mexico_City` (`ZONA_HORARIA_VISTA`), indicando el desfase en pantalla.

---

## 4. Archivos

| Archivo | Cambio |
|---|---|
| `monitoreo.html` | Nuevo |
| `assets/css/monitoreo.css` | Nuevo (Mobile First; reutiliza tokens y componentes) |
| `assets/js/monitoreo/main.js` | Nuevo |
| `assets/js/monitoreo/ultimo-movimiento.js` | Nuevo |
| `assets/js/monitoreo/historial.js` | Nuevo |
| `assets/js/core/conectividad.js` | Nuevo |
| `assets/js/core/validaciones.js` | Nuevo |
| `assets/js/core/fecha.js` | Nuevo |
| `assets/js/core/config.js` | Rutas `estado` e `historial`, página `monitoreo` en `PAGINAS`, zona horaria y parámetros de la tabla |
| `README.md`, `docs/monitoreo.md` | Documentación |

CONTROL (`index.html`, `control/*`) no se modificó. Solo gana el enlace «Monitoreo», que `core/layout.js` genera desde `PAGINAS`. Se volvió a medir: sigue sin scroll en los 6 tamaños.

---

## 5. Ejecución

- **Local:** `npx serve .` dentro de `control-iot/` y abrir `/monitoreo.html`. El WSS real conecta, pero el REST queda bloqueado por CORS: el indicador de API muestra «No disponible» y la tabla «Desconectado». Es el comportamiento esperado fuera del origen permitido.
- **GitHub Pages:** subir a la rama publicada y abrir `https://80chucho08.github.io/<repo>/monitoreo.html`. Allí el REST funciona porque coincide con el origen permitido.
- **Pruebas sin backend:** se usó un simulador que imita los contratos anteriores. No forma parte del repositorio.

---

## 6. Casos de prueba

**Leyenda**

- **Real:** ejecutado contra el backend real.
- **Simulado:** ejecutado en local con un backend que imita los contratos reales.
- **Pendiente:** requiere GitHub Pages o capturas del autor.

| # | Caso | Estado | Resultado / evidencia a capturar |
|---|---|---|---|
| 1 | Carga inicial (estado + 10 filas) | Simulado ✓ · real pendiente | 10 filas sin pasos de DEMO, DETENER identificado, hora del centro de México. **Capturar** en Pages: la tarjeta y la tabla junto con `GET /historial` en DevTools → Network. |
| 2 | Comando desde CONTROL | Simulado ✓ (2 pestañas) · real pendiente | «Velocidad x2» y DETENER aparecen en MONITOREO como persistidos, sin recargar. **Capturar** en Pages: CONTROL y MONITOREO lado a lado. |
| 3 | Evento WSS desde otra pestaña o cliente | Real ✓ (captura WSS) · simulado ✓ | El cliente externo recibió `comando_individual` y `_completado` (sección 1). **Capturar** con Postman o una extensión WebSocket de Chrome conectada a `wss://vehiculo-iot-itp.duckdns.org/ws/vehiculos/1` mientras CONTROL envía un comando. |
| 4 | Más de diez movimientos | Simulado ✓ | La numeración se mantiene en 1–10, la fila 11 sale del DOM y la tabla sigue en 10. |
| 5 | Orden, duplicados y fecha/hora | Real ✓ (orden y UTC verificados) · simulado ✓ | Eventos con `id_solicitud` repetido no duplican filas. El orden es por `id_historial`. Las horas se convierten de UTC a GMT-6. |
| 6 | Pérdida y reconexión WSS | Simulado ✓ | Muestra «Reconectando» y un aviso. Al volver, una recarga REST recupera los 2 comandos ejecutados durante el corte. **Capturar** en Pages: activar el modo avión y desactivarlo. |
| 7 | Respuesta REST vieja | Simulado ✓ | Un `GET /estado` lento con datos de hace una hora no reemplaza un evento más nuevo. |
| 8 | Ráfaga de comandos | Simulado ✓ | 5 comandos seguidos se resuelven con 1 sola consulta al historial. |
| 9 | Salud AWS y RDS | Real ✓ (endpoints) · pendiente en Pages | En local se ven «No disponible» y «Sin verificar» por CORS. **Capturar** en Pages: «Disponible» en ambos. |
| 10 | DEMO sin contaminar el historial | Real ✓ (contrato) · simulado ✓ | Los pasos se muestran como «Paso de DEMO n de 11», la tabla no cambia y no se consulta el historial por ellos. **Capturar** en Pages durante una DEMO. |
| 11 | Joystick y DETENER conservados | Simulado ✓ | CONTROL sin cambios de lógica; DETENER aceptado; sin scroll en los 6 tamaños. |
| 12 | Publicación HTTPS/WSS | Pendiente | Requiere push y GitHub Pages. **Capturar**: candado HTTPS, conexión `wss://` en Network → WS, consola sin errores. |
| 13 | Otro vehículo y payload inválido | Simulado ✓ | `id_vehiculo: 2` se ignora. Un payload con HTML inyectado no se renderiza (0 `<img>`). |

**Nunca se probó:** la ejecución física. No hay ESP8266/ESP32 conectado y el backend lo confirma con `resultados: []`.

---

## 7. Checklist

**Seguridad**

- [x] Solo HTTPS y WSS (`API_BASE` https, `WS_URL` wss).
- [x] Sin secretos, claves AWS, tokens ni credenciales MySQL en el repositorio. La API no exige autenticación; si la agrega, se centraliza en `core/api.js`.
- [x] El navegador no accede a RDS.
- [x] Render con `textContent` / `createElement`; MONITOREO no usa `innerHTML`.
- [x] Validación de cada payload REST y WSS (`core/validaciones.js`); los inválidos se descartan sin inventar valores.
- [x] Filtro por `id_vehiculo`.
- [x] MONITOREO no envía nada por WSS ni ejecuta POST.
- [ ] CORS para desarrollo local: decisión del backend (fuera de alcance).

**Accesibilidad**

- [x] Contraste ≥ 4.5:1 en texto y ≥ 3:1 en bordes de control (tokens de la 4.1).
- [x] Estados con icono + texto + `data-estado`, nunca solo con color.
- [x] Tabla semántica con `<caption>`, `<th scope="col">` y `<time datetime>`.
- [x] Regiones `role="status"` / `aria-live="polite"` para la tarjeta, la tabla y la DEMO.
- [x] Foco visible de alto contraste y navegación por teclado (enlaces de la barra).
- [x] Objetivos táctiles ≥ 44 px, verificados en 6 tamaños.
- [x] `prefers-reduced-motion` y `prefers-contrast`.

**Errores y resiliencia**

- [x] Mensajes de Cargando, Sin movimientos, Desconectado y Error, conservando los últimos datos válidos.
- [x] Timeout y `AbortController` en REST (`core/api.js`); se cancela todo en `pagehide`.
- [x] Peticiones únicas en vuelo, sin respuestas fuera de orden, deduplicación por `id_historial`.
- [x] Reconexión WSS con backoff y resincronización REST.
- [x] Sin polling continuo del historial.
