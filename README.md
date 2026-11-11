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
8. [Configuración (`js/config.js`)](#-configuración-jsconfigjs)
9. [Instalación y Ejecución Local](#-instalación-y-ejecución-local)
10. [Experiencia de Usuario y Accesibilidad](#-experiencia-de-usuario-y-accesibilidad)
11. [Créditos](#-créditos)

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

- **📊 Registro de Eventos en Tiempo Real (Event Log):**
  - Panel lateral en escritorio y modal desplegable en dispositivos móviles.
  - Inspección de eventos WebSocket entrantes y acciones locales con marcas temporales.

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
├── index.html                   # Marcado principal HTML5 semántico y accesible
├── README.md                    # Documentación técnica del proyecto
├── assets/
│   └── favicon.svg              # Isotipo vectorial SVG del vehículo
├── css/
│   ├── tokens.css               # Variables de diseño (colores, temas, sombras, tipografía)
│   ├── base.css                 # Maquetación global, CSS Grid responsivo y componentes
│   └── components.css           # Estilos de botones, microinteracciones y animaciones
├── data/
│   ├── grupos.js                # Definición de grupos de comandos (Garra, Grúa, Sistemas)
│   └── joystick-map.js          # Asignación de direcciones a códigos de comando
└── js/
    ├── api.js                   # Cliente HTTP con Fetch, AbortController y normalización de errores
    ├── commands.js              # Despacho de comandos, colas, exclusión y parada de seguridad
    ├── config.js                # Parámetros globales (URLs, rutas, ID de vehículo, timeouts)
    ├── demo.js                  # Control de rutinas demo (carga, ejecución, cancelación y timeouts)
    ├── events.js                # Despachador y discriminador de mensajes WebSocket recibidos
    ├── feedback.js              # Efectos de audio sintetizado y vibración háptica
    ├── health.js                # Sondeo periódico de salud de la API y Amazon RDS
    ├── joystick.js              # Lógica de interacción para joysticks (PointerEvents y teclado)
    ├── main.js                  # Punto de entrada de la aplicación y orquestación
    ├── state.js                 # Almacén reactivo de estado global (patrón observador)
    ├── tema.js                  # Gestión de temas de color, pantalla completa y modales
    ├── ui.js                    # Renderizado dinámico del DOM y registro de acciones
    └── ws.js                    # Cliente WebSocket con reconexión automática y detección offline
```

---

## 🧩 Módulos y Componentes

### 1. Núcleo y Estado
- **`js/main.js`**: Orquesta el arranque de la aplicación. Inicializa comprobaciones de salud, conecta el WebSocket, carga catálogos de comandos y rutinas demo, vincula los joysticks y escucha cambios en el estado reactivo.
- **`js/state.js`**: Implementa un contenedor de estado ligero con suscripciones de tipo observador (`getState()`, `updateState()`, `subscribe()`).

### 2. Comunicación y Red
- **`js/api.js`**: Provee la función `request(path, options)` para llamadas HTTP con control de tiempo de espera (`AbortController`), parseo tolerante a JSON y emisión de instancias `ApiError` estructuradas.
- **`js/ws.js`**: Establece el enlace WebSocket seguro (`WSS`). Administra reconexiones automáticas con variación aleatoria (*jitter*), supervisa cambios de red (`online`/`offline`) y procesa eventos de visibilidad de pestaña.
- **`js/events.js`**: Recibe los mensajes deserializados del WebSocket, filtra eventos dirigidos al `VEHICLE_ID` configurado y despacha manejadores específicos (`estado_inicial`, `comando_individual_completado`, `demo_completada`).
- **`js/health.js`**: Ejecuta verificaciones periódicas de estado contra la API y la base de datos RDS, adaptando el intervalo según la disponibilidad de la red.

### 3. Mecánica de Control
- **`js/joystick.js`**: Convierte el movimiento en coordenadas del cursor o toques de pantalla en desplazamientos cardinales (`arriba`, `abajo`, `izquierda`, `derecha`) empleando una zona muerta central y un umbral de histéresis para evitar fluctuaciones en diagonales.
- **`js/commands.js`**: Regula el flujo de emisión de comandos. Distingue entre comandos sostenidos (movimiento) y de alternancia (*toggle*), administra una cola de toggles para evitar saturar el canal y ejecuta detenciones de seguridad automáticas en caso de fallo de red.
- **`js/demo.js`**: Gestiona el ciclo de vida de rutinas demostrativas, asegurando que los controles manuales permanezcan deshabilitados hasta que el backend reporte la conclusión de la rutina o se cumpla el tiempo límite de seguridad.

### 4. Presentación e Interacción
- **`js/ui.js`**: Encargado de construir dinámicamente los botones de comandos según el catálogo disponible, actualizar tarjetas de salud, mostrar mensajes de estado con identificador de correlación y gestionar el registro de eventos.
- **`js/feedback.js`**: Genera tonos sintetizados mediante `AudioContext` y activa secuencias de vibración mediante `navigator.vibrate()`.
- **`js/tema.js`**: Administra la persistencia de preferencias de usuario en `localStorage` (tema cromático, efectos reducidos, estado de vibración) y controla la apertura/cierre de ventanas modales (`<dialog>`).

---

## 🕹 Mapeo de Comandos y Controles

Los comandos del vehículo se organizan en `data/grupos.js` y `data/joystick-map.js`:

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

## ⚙ Configuración (`js/config.js`)

Todos los parámetros de entorno y comportamiento se centralizan en [`js/config.js`](file:///c:/Users/chuch/Documents/UNI/9no/IoT/Proyecto%20carrito/vehiculo_iot_front/control-iot/js/config.js):

```javascript
export const API_BASE = 'https://vehiculo-iot-itp.duckdns.org';
export const APP_NAME = 'Carrito Jesus';
export const AUTOR_NOMBRE = '80chucho08';
export const ANIO = 2026;
export const VEHICLE_ID = 1;
export const WS_URL = `${API_BASE.replace(/^https:/, 'wss:')}/ws/vehiculos/${VEHICLE_ID}`;

export const REQUEST_TIMEOUT_MS = 8000;       // Tiempo de espera para solicitudes HTTP estándar
export const HEALTH_INTERVAL_MS = 30000;      // Intervalo base para health check de servicios
export const DEMO_TIMEOUT_MS = 180000;        // Tiempo máximo de ejecución para una demo (3 min)
export const STOP_REQUEST_TIMEOUT_MS = 1800;  // Tiempo límite para confirmar la parada de emergencia
export const JOYSTICK_AXIS_HYSTERESIS = 0.12; // Tolerancia angular para evitar cambios bruscos de eje
export const TOGGLE_INTERRUPTS_MOVEMENT = true;// Define si un toggle detiene el movimiento sostenido activo
```

---

## 💻 Instalación y Ejecución Local

Dado que el proyecto utiliza módulos nativos de JavaScript (`<script type="module">`), los archivos deben ser servidos a través de un servidor web local (no es posible abrirlos directamente mediante el protocolo `file://` debido a las restricciones de seguridad CORS del navegador).

### Opción 1: Python (Recomendada)
```sh
# Dentro de la carpeta control-iot:
python -m http.server 8000
```
Accede a `http://localhost:8000/`.

### Opción 2: Node.js (npx)
```sh
# Servidor estático instantáneo con serve o http-server
npx serve .
# o bien
npx http-server -p 8000
```

### Opción 3: Extensión de Editor
- Si utilizas Visual Studio Code, haz clic derecho sobre `index.html` y selecciona **"Open with Live Server"**.

---

## ♿ Experiencia de Usuario y Accesibilidad

- **Contenedores y Consultas de Tamaño (`Container Queries`):** Los joysticks y paneles se redimensionan proporcionalmente al espacio del que disponen, garantizando máxima visibilidad en pantallas reducidas.
- **Navegación por Teclado:** Los joysticks disponen de `tabindex="0"` y responden a las teclas direccionales cuando están enfocados.
- **Regiones Vivas ARIA:** El registro de acciones (`#action-messages`) y eventos (`#event-log`) cuenta con atributos `aria-live="polite"` para compatibilidad con lectores de pantalla.
- **Detección de Movimiento Reducido:** Estilos adaptados automáticamente ante la preferencia del sistema operativo `@media (prefers-reduced-motion: reduce)`.

---

## 👤 Créditos

- **Proyecto:** Carrito Jesus · Control de Vehículo IoT
- **Materia:** Internet de las Cosas (IoT) — 9no Semestre
- **Autor:** [80chucho08](https://github.com/80chucho08)
- **Año:** 2026
