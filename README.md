# Carrito Jesus · Panel de Control IoT

> **Interfaz web moderna, modular y reactiva para el control y telemetría en tiempo real de un vehículo IoT.**  
> Desarrollado con JavaScript vanilla (ES Modules), HTML5 semántico y CSS3 avanzado, sin dependencias externas ni procesos de compilación.

---

## 📑 Tabla de Contenidos

1. [Descripción General](#-descripción-general)
2. [Características Principales](#-características-principales)
3. [Arquitectura del Sistema](#-arquitectura-del-sistema)
4. [Estructura del Proyecto](#-estructura-del-proyecto)
5. [Módulos y Componentes](#-módulos-y-componentes)
6. [Mapeo de Comandos y Controles](#-mapeo-de-comandos-y-controles)
7. [Protocolo de Comunicación](#-protocolo-de-comunicación)
   - [API REST](#api-rest)
   - [WebSocket WSS (Telemetría y Eventos)](#websocket-wss-telemetría-y-eventos)
8. [Configuración (`assets/js/core/config.js`)](#-configuración-assetsjscoreconfigjs)
9. [Instalación y Ejecución Local](#-instalación-y-ejecución-local)
10. [Cómo agregar una página nueva](#-cómo-agregar-una-página-nueva)
11. [Despliegue en GitHub Pages (mayúsculas y rutas)](#-despliegue-en-github-pages-mayúsculas-y-rutas)
12. [Experiencia de Usuario y Accesibilidad](#-experiencia-de-usuario-y-accesibilidad)
13. [MONITOREO](#-monitoreo)
14. [Créditos](#-créditos)

---

## 🚀 Descripción General

**Carrito Jesus · Control IoT** es el panel de mando (front-end) diseñado para operar un vehículo robótico móvil dotado de actuadores para grúa elevadora, garra manipuladora y sistemas auxiliares.

La aplicación opera como una cabina de mando interactiva capaz de adaptarse fluidamente a múltiples factores de forma (móvil vertical, móvil horizontal, tablets y pantallas de escritorio) y ofrece control por gestos táctiles, ratón y teclado, complementado con retroalimentación auditiva y háptica.

---

## ✨ Características Principales

- **🎮 Doble Joystick Virtual Independiente:**
  - **Joystick de Grúa:** Manejo de elevación y giro con autocentrado y cálculo vectorial con histéresis.
  - **Joystick de Garra:** Control de apertura, cierre y orientación.
  - Soporte completo para eventos táctiles (`PointerEvents`), captura de puntero (`setPointerCapture`) y atajos de teclado (`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`).
  - Exclusión mutua para prevenir operaciones simultáneas conflictivas.

- **🛑 Parada de Emergencia Prioritaria (`DETENER`):**
  - Botón de parada de alto impacto visual.
  - Cancela peticiones en curso vía `AbortController`, vacía colas de comandos pendientes y reintenta de forma automática ante fallos transitorios de red.

- **🤖 Automatización de Rutinas Demo:**
  - Carga dinámica de rutinas preprogramadas desde el backend.
  - Bloqueo preventivo de controles manuales mientras la rutina está activa.
  - Temporizador de seguridad de 3 minutos para desbloqueo automático en caso de pérdida de enlace.
  - Capacidad de cancelación inmediata en cualquier momento.

- **📡 Monitor de Servicios y Salud en Vivo:**
  - Tarjetas de estado con animación de pulso para:
    1. **WebSocket WSS:** Conexión de telemetría y eventos en tiempo real.
    2. **Servidor AWS:** API de servicios backend.
    3. **Amazon RDS:** Estado de conexión de la base de datos relacional.
  - Sondeo periódico inteligente con retroceso exponencial (*exponential backoff*) y reintentos ante recuperación de conectividad.

- **📊 Registro de Eventos (`eventos.html`):**
  - Página independiente con su propia conexión WSS de **solo lectura** al mismo vehículo (no envía nada).
  - Lista de eventos recibidos con hora, tipo y JSON crudo (máximo 200 entradas), con botones **Pausar** y **Limpiar**.
  - Solo muestra lo recibido desde que se abrió la página: un evento WebSocket confirma la publicación del backend, no la ejecución física.
  - La pantalla de control conserva únicamente la última acción y su estado.

- **🔊 Feedback Sensorial Avanzado:**
  - **Web Audio API:** Síntesis de sonido en tiempo real con osciladores (sin requerir archivos de audio externos) para clics, confirmaciones, alertas y errores.
  - **Vibration API:** Retroalimentación háptica en dispositivos móviles compatibles (vibración al interactuar con joysticks, botones o activación del botón de parada).

- **🎨 Personalización y Accesibilidad:**
  - 3 temas de color seleccionables: **Ámbar** (predeterminado), **Cian** y **Neón**.
  - Modo de efectos visuales reducidos (respetando además `prefers-reduced-motion`).
  - Modo de pantalla completa integrado vía Fullscreen API.
  - Diálogos y modales accesibles mediante el elemento nativo `<dialog>`.

---

## 🏗 Arquitectura del Sistema

```
                      ┌─────────────────────────────────────────┐
                      │          Panel Web Front-End            │
                      │     (Carrito Jesus · Control IoT)       │
                      └─────────────┬────────────────────┬──────┘
                                    │ HTTP Fetch         │ WebSocket WSS
                                    │ (REST API)         │ (Bidireccional)
                                    ▼                    ▼
                      ┌─────────────────────────────────────────┐
                      │             Servidor AWS                │
                      │   (https://vehiculo-iot-itp.duckdns.org)│
                      └─────────────┬────────────────────┬──────┘
                                    │                    │
                           Consultas│                    │ Socket / Mensajería
                           SQL      ▼                    ▼
                      ┌───────────────┐        ┌────────────────┐
                      │  Amazon RDS   │        │  Vehículo IoT  │
                      │(Base de Datos)│        │  (Unidad ID 1) │
                      └───────────────┘        └────────────────┘
```

---

## 📁 Estructura del Proyecto

```text
control-iot/
├── index.html                    # CONTROL: cabina con joysticks, DEMO y DETENER
├── monitoreo.html                # MONITOREO: último movimiento + últimos 10 movimientos persistidos
├── eventos.html                  # Diagnóstico: eventos WebSocket crudos (solo lectura)
├── README.md
├── docs/
│   └── monitoreo.md              # Auditoría de contratos, arquitectura, pruebas y checklist de MONITOREO
└── assets/
    ├── css/
    │   ├── tokens.css            # Variables de diseño, temas y @font-face de Inter
    │   ├── base.css              # Compartido: reset, barra superior, estado de servicios, navegación, créditos
    │   ├── components.css        # Compartido: teclas, campos, hojas <dialog>, movimiento reducido
    │   ├── control.css           # Solo index.html
    │   ├── monitoreo.css         # Solo monitoreo.html
    │   └── eventos.css           # Solo eventos.html
    ├── js/
    │   ├── core/                 # Reutilizable por cualquier página
    │   │   ├── config.js         # URLs, rutas, ID de vehículo, timeouts, zona horaria, créditos y PAGINAS
    │   │   ├── api.js            # Cliente REST (fetch + timeout + AbortController + ApiError)
    │   │   ├── ws.js             # Cliente WSS con reconexión (backoff) y detección offline
    │   │   ├── events.js         # Despachador de mensajes WSS (filtra otros vehículos)
    │   │   ├── health.js         # Salud de la API (GET /) y de RDS (GET /health/db)
    │   │   ├── conectividad.js   # Los 3 indicadores (WSS, API AWS, RDS) para páginas nuevas
    │   │   ├── validaciones.js   # Validación de payloads REST/WSS reales
    │   │   ├── fecha.js          # Fechas del backend (UTC sin sufijo) → hora del centro de México
    │   │   ├── state.js          # Estado global observable (CONTROL)
    │   │   ├── feedback.js       # Sonido y vibración (CONTROL)
    │   │   ├── tema.js           # Tema de color y efectos reducidos
    │   │   └── layout.js         # Navegación entre páginas y pie de créditos
    │   ├── control/              # Módulos de index.html (main, commands, joystick, demo, demo-progreso, luz, ui)
    │   ├── monitoreo/
    │   │   ├── main.js           # Punto de entrada: REST inicial, WSS en vivo, resincronización
    │   │   ├── ultimo-movimiento.js # Tarjeta del último movimiento y estado de DEMO en vivo
    │   │   └── historial.js      # Tabla de 10: carga, filtro, deduplicación y confirmación en RDS
    │   ├── eventos/
    │   │   └── main.js           # Punto de entrada de eventos.html
    │   └── data/
    │       ├── joystick-map.js   # Dirección → código de comando
    │       └── grupos.js         # Grupos de comandos (Garra, Grúa, Sistemas)
    ├── img/                      # favicon.svg, favicon-32.png, apple-touch-icon.png, logo-marca.svg
    └── fonts/                    # Inter variable (SIL OFL 1.1)
```

> `core/events.js` importa `control/commands.js` para correlacionar solicitudes con eventos; `eventos.html` lo carga pero nunca llama a funciones que envíen peticiones.

---

## 🧩 Módulos y Componentes

### 1. Núcleo y Estado
- **`control/main.js`**: Orquesta el arranque de la aplicación. Inicializa comprobaciones de salud, conecta el WebSocket, carga catálogos de comandos y rutinas demo, vincula los joysticks y escucha cambios en el estado reactivo.
- **`core/state.js`**: Implementa un contenedor de estado ligero con suscripciones de tipo observador (`getState()`, `updateState()`, `subscribe()`).

### 2. Comunicación y Red
- **`core/api.js`**: Provee la función `request(path, options)` para llamadas HTTP con control de tiempo de espera (`AbortController`), parseo tolerante a JSON y emisión de instancias `ApiError` estructuradas.
- **`core/ws.js`**: Establece el enlace WebSocket seguro (`WSS`). Administra reconexiones automáticas con variación aleatoria (*jitter*), supervisa cambios de red (`online`/`offline`) y procesa eventos de visibilidad de pestaña.
- **`core/events.js`**: Recibe los mensajes deserializados del WebSocket, filtra eventos dirigidos al `VEHICLE_ID` configurado y despacha manejadores específicos (`estado_inicial`, `comando_individual_completado`, `demo_completada`).
- **`core/health.js`**: Ejecuta verificaciones periódicas de estado contra la API y la base de datos RDS, adaptando el intervalo según la disponibilidad de la red.

### 3. Mecánica de Control
- **`control/joystick.js`**: Convierte el movimiento en coordenadas del cursor o toques de pantalla en desplazamientos cardinales (`arriba`, `abajo`, `izquierda`, `derecha`) empleando una zona muerta central y un umbral de histéresis para evitar fluctuaciones en diagonales.
- **`control/commands.js`**: Regula el flujo de emisión de comandos. Distingue entre comandos sostenidos (movimiento) y de alternancia (*toggle*), administra una cola de toggles para evitar saturar el canal y ejecuta detenciones de seguridad automáticas en caso de fallo de red.
- **`control/demo.js`**: Gestiona el ciclo de vida de rutinas demostrativas, asegurando que los controles manuales permanezcan deshabilitados hasta que el backend reporte la conclusión de la rutina o se cumpla el tiempo límite de seguridad.

### 4. Presentación e Interacción
- **`control/ui.js`**: Encargado de construir dinámicamente los botones de comandos según el catálogo disponible, actualizar tarjetas de salud, mostrar la última acción con su estado e inicializar diálogos, pantalla completa, popover de WebSocket y hoja de demos.
- **`core/feedback.js`**: Genera tonos sintetizados mediante `AudioContext` y activa secuencias de vibración mediante `navigator.vibrate()`.
- **`core/tema.js`**: Aplica y guarda en `localStorage` el tema cromático y los efectos reducidos en todas las páginas.
- **`core/layout.js`**: Genera la navegación entre páginas (`montarNavegacion`) a partir de `PAGINAS` y el pie de créditos (`montarCreditos`).
- **`eventos/main.js`**: Abre una conexión WSS de solo lectura y pinta cada evento con `textContent` (nunca `innerHTML`).

---

## 🕹 Mapeo de Comandos y Controles

Los comandos del vehículo se organizan en `assets/js/data/grupos.js` y `assets/js/data/joystick-map.js`:

### 1. Grúa (Comandos Sostenidos)
| Dirección | Código de Comando | Función |
| :---: | :---: | :--- |
| **↑ Arriba** | `12` | Elevación superior |
| **↓ Abajo** | `10` | Elevación inferior |
| **← Izquierda** | `4` | Giro hacia la izquierda |
| **→ Derecha** | `2` | Giro hacia la derecha |

### 2. Garra (Comandos Sostenidos)
| Dirección | Código de Comando | Función |
| :---: | :---: | :--- |
| **↑ Arriba** | `1` | Abrir / Extender garra |
| **↓ Abajo** | `3` | Cerrar / Retraer garra |
| **← Izquierda** | `11` | Posicionamiento izquierdo |
| **→ Derecha** | `9` | Posicionamiento derecho |

### 3. Sistemas (Comandos de Alternancia / Toggle)
| Código | Icono | Descripción / Subsistema |
| :---: | :---: | :--- |
| `5` | ◉ | Actuador / Sistema 1 |
| `6` | ✦ | Actuador / Sistema 2 |
| `7` | ⌁ | Actuador / Sistema 3 |
| `8` | ● | Actuador / Sistema 4 |

> **Nota:** La parada general de emergencia (`DETENER`) cuenta con su endpoint exclusivo `/api/vehiculos/{id}/detener` y tiene prioridad operativa sobre cualquier otro comando en tránsito.

---

## 📡 Protocolo de Comunicación

### API REST

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `GET` | `/` | Comprobación de salud de la API (AWS) |
| `GET` | `/health/db` | Comprobación de conectividad con Amazon RDS |
| `GET` | `/api/vehiculos/{id}/comandos` | Obtención del catálogo de comandos activos |
| `POST` | `/api/vehiculos/{id}/comandos/{id}/ejecutar` | Envío y ejecución de un comando específico |
| `POST` | `/api/vehiculos/{id}/detener` | Orden de detención inmediata (`DETENER`) |
| `GET` | `/api/vehiculos/{id}/demos` | Consulta de rutinas demo disponibles |
| `POST` | `/api/vehiculos/{id}/demos/{id}/ejecutar` | Inicio de ejecución de una rutina demo |
| `POST` | `/api/vehiculos/{id}/demos/cancelar` | Solicitud de cancelación de rutina demo activa |

### WebSocket WSS (Telemetría y Eventos)

**URL de conexión:** `wss://vehiculo-iot-itp.duckdns.org/ws/vehiculos/{id}`

#### Tipos de Mensajes Soportados:
1. **`estado_inicial`**:
   Emitido por el servidor al abrir el canal. Informa el nombre del vehículo, disponibilidad y estado inicial de rutinas demo.
2. **`comando_individual_completado`**:
   Notifica la conclusión de la ejecución de una instrucción previamente despachada por HTTP mediante el correlacionador `id_solicitud`.
3. **`demo_completada`**:
   Indica que la secuencia de movimientos de una rutina demo finalizó con éxito (`total_movimientos`).

---

## ⚙ Configuración (`assets/js/core/config.js`)

Todos los parámetros de entorno y comportamiento se centralizan en [`assets/js/core/config.js`](assets/js/core/config.js):

```javascript
export const API_BASE = 'https://vehiculo-iot-itp.duckdns.org';
export const APP_NAME = 'Carrito Jesus';
export const AUTOR_NOMBRE = 'Navarro Carbajal Jesus Alfonso';
export const MATRICULA = '22200964';
export const ANIO = 2026;
export const PAGINAS = [ /* { id, href, etiqueta, icono } — navegación entre páginas */ ];
export const VEHICLE_ID = 1;
export const WS_URL = `${API_BASE.replace(/^https:/, 'wss:')}/ws/vehiculos/${VEHICLE_ID}`;

export const REQUEST_TIMEOUT_MS = 8000;       // Tiempo de espera para solicitudes HTTP estándar
export const HEALTH_INTERVAL_MS = 30000;      // Intervalo base para health check de servicios
export const DEMO_TIMEOUT_MS = 180000;        // Tiempo máximo de ejecución para una demo (3 min)
export const STOP_REQUEST_TIMEOUT_MS = 1800;  // Tiempo límite para confirmar la parada de emergencia
export const JOYSTICK_AXIS_HYSTERESIS = 0.12; // Tolerancia angular para evitar cambios bruscos de eje
export const TOGGLE_INTERRUPTS_MOVEMENT = true;// Define si un toggle detiene el movimiento sostenido activo
```

El pie de ambas páginas se genera como `Desarrollado por {AUTOR_NOMBRE} · {MATRICULA} · {ANIO}`.

---

## 💻 Instalación y Ejecución Local

El proyecto usa módulos nativos (`<script type="module">`), así que debe servirse con un servidor estático; abrir el archivo con `file://` no funciona.

### Opción 1: Node.js (npx)
```sh
# Dentro de la carpeta control-iot:
npx serve .
# o bien
npx http-server -p 8000
```

### Opción 2: Python
```sh
python -m http.server 8000
```
Accede a `http://localhost:8000/` (control), `http://localhost:8000/monitoreo.html` y `http://localhost:8000/eventos.html`.

> **CORS:** el backend solo permite el origen `https://80chucho08.github.io`. En local el WSS conecta, pero el navegador bloquea las llamadas REST (indicador API «No disponible», historial «Desconectado»). Las pruebas REST reales de CONTROL y MONITOREO se hacen en GitHub Pages. Ver [`docs/monitoreo.md`](docs/monitoreo.md).

> **Windows:** si la consola muestra *"Expected a JavaScript module script but the server responded with a MIME type of text/plain"*, el registro de Windows tiene `.js` asociado a `text/plain` y `http.server` lo hereda. Usa la opción de Node.js o corrige la clave `HKEY_CLASSES_ROOT\.js` → `Content Type = text/javascript`, y recarga sin caché.

### Probar desde una subruta (como GitHub Pages)
GitHub Pages publica el sitio en `https://<usuario>.github.io/control-iot/`. Para reproducirlo, sirve la carpeta **padre** y abre la subruta:
```sh
# Desde la carpeta que contiene control-iot/
npx serve . -l 8000
```
Abre `http://localhost:8000/control-iot/`. Todas las rutas del proyecto son relativas, por lo que funcionan igual en la raíz y en la subruta.

### Opción 3: Extensión de Editor
- En Visual Studio Code, clic derecho sobre `index.html` → **"Open with Live Server"**.

---

## ➕ Cómo agregar una página nueva

Ejemplo: `administracion.html`.

1. **HTML:** copia `eventos.html` como plantilla a la raíz (`control-iot/administracion.html`). Conserva los `<link>` de favicon, `tokens.css`, `base.css` y `components.css`, el `<nav class="app-nav" data-nav>` de la barra superior y el `<footer class="app-credits" id="app-credits">` al final del `<main>`.
2. **CSS:** crea `assets/css/administracion.css` con la maquetación propia de la página y enlázalo.
3. **JS:** crea `assets/js/administracion/main.js` y cárgalo con `<script type="module" src="assets/js/administracion/main.js">` (más `assets/js/core/tema.js` para el tema). Dentro:
   ```javascript
   import { montarNavegacion, montarCreditos } from '../core/layout.js';
   montarNavegacion(document.querySelector('[data-nav]'), 'administracion');
   montarCreditos(document.getElementById('app-credits'));
   ```
4. **Navegación:** agrega la entrada en `PAGINAS` de `assets/js/core/config.js`:
   ```javascript
   Object.freeze({ id: 'administracion', href: 'administracion.html', etiqueta: 'Administración', icono: 'administracion' })
   ```
   El enlace aparece automáticamente en las demás páginas (`core/layout.js` ya incluye el icono de `administracion`).
5. Usa siempre **rutas relativas** (`assets/...`, `../core/...`), nunca rutas que empiecen con `/`.

---

## 🚀 Despliegue en GitHub Pages (mayúsculas y rutas)

- GitHub Pages **distingue mayúsculas y minúsculas**; Windows no. Un `import './Config.js'` funciona en local pero da **404** publicado si el archivo es `config.js`. Todos los nombres de archivo y carpeta del proyecto están en minúsculas: mantén esa convención.
- Al renombrar solo mayúsculas en Windows usa `git mv viejo.js temporal.js && git mv temporal.js nuevo.js`, porque Git no siempre detecta el cambio.
- No uses rutas absolutas (`/assets/...`): en Pages apuntarían a `https://<usuario>.github.io/assets/...` en lugar de `.../control-iot/assets/...`.

---

## ♿ Experiencia de Usuario y Accesibilidad

- **Contenedores y Consultas de Tamaño (`Container Queries`):** Los joysticks y paneles se redimensionan proporcionalmente al espacio del que disponen, garantizando máxima visibilidad en pantallas reducidas.
- **Navegación por Teclado:** Los joysticks disponen de `tabindex="0"` y responden a las teclas direccionales cuando están enfocados.
- **Regiones Vivas ARIA:** La última acción del control (`#action-messages`, `role="status"`) y la lista de `eventos.html` usan `aria-live="polite"` para compatibilidad con lectores de pantalla.
- **Detección de Movimiento Reducido:** Estilos adaptados automáticamente ante la preferencia del sistema operativo `@media (prefers-reduced-motion: reduce)`.

---

## 📈 MONITOREO

`monitoreo.html` muestra, en solo lectura:

- **Último movimiento**: carga inicial con `GET /api/vehiculos/1/estado` y actualización inmediata con cada `comando_individual` recibido por WSS (de cualquier pestaña o cliente). Cada movimiento indica por separado si fue **publicado por WSS**, **entregado por el backend**, **persistido en RDS** (confirmado por REST) y que la **ejecución física no es verificable** (el backend responde «sin confirmación de firmware»).
- **Últimos 10 movimientos individuales persistidos**: `GET /api/vehiculos/1/historial` (el endpoint no admite límite ni orden, así que devuelve todo y se filtra en el navegador). Se excluyen los pasos de DEMO (`origen: "demo"`), se ordena y deduplica por `id_historial` y se muestran fecha y hora en hora del centro de México (el backend guarda UTC). Las filas con `comando` nulo son DETENER.
- **DEMO en vivo**: entre `demo_iniciada` y `demo_completada` los `comando_individual` se muestran como pasos de la DEMO y no se agregan a la tabla.
- **Indicadores**: WSS (sesión de este navegador), API AWS (`GET /`) y RDS (`GET /health/db`), independientes entre sí.
- **Resiliencia**: una sola petición REST en vuelo por recurso, ráfagas de eventos agrupadas, confirmación en RDS con reintentos acotados (sin polling continuo), y resincronización por REST al reconectar el WSS.

Detalle completo (contratos verificados, diagrama, lógica, casos de prueba y checklist): [`docs/monitoreo.md`](docs/monitoreo.md).

---

## 👤 Créditos

- **Proyecto:** Carrito Jesus · Control de Vehículo IoT
- **Materia:** Internet de las Cosas (IoT) — 9no Semestre
- **Autor:** Navarro Carbajal Jesus Alfonso ([80chucho08](https://github.com/80chucho08))
- **Matrícula:** 22200964
- **Año:** 2026
- **Tipografía:** [Inter](https://rsms.me/inter/) de Rasmus Andersson, licencia SIL Open Font License 1.1.
