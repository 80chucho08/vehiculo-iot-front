# Control IoT · versión base

Panel web estático para el vehículo de prueba **Excavadora IoT** (ID 1). El proyecto separa estructura (`index.html`), valores visuales (`css/tokens.css` y estilos), reglas/API (`js/`) y datos de categorías/mapeo (`data/`). No modifica el backend ni requiere npm.

## Estructura

```text
control-iot/
├── index.html
├── assets/favicon.svg
├── css/{tokens,base,components}.css
├── data/{grupos,joystick-map}.js
└── js/{api,commands,config,demo,events,health,joystick,main,state,ui,ws}.js
```

## Ejecución local y publicación

Sirve la carpeta `control-iot` desde un servidor estático (los módulos ES no deben abrirse con `file://`):

```sh
cd control-iot
python -m http.server 8000
```

Abre `http://localhost:8000/`. También funciona con cualquier servidor estático simple. Todos los recursos locales usan rutas relativas; para GitHub Pages puede publicarse esta carpeta como sitio o dentro de una subruta sin asumir raíz de dominio. Bootstrap 5 se carga desde CDN.

## Integración API

`js/config.js` centraliza base URL, vehículo, rutas, métodos, timeouts e intervalos. `js/api.js` hace Fetch con timeout, cancelación, parseo seguro y normalización de errores. Los POST no incluyen cuerpo. `data/grupos.js` clasifica como sostenidos los códigos 1, 2, 3, 4, 9, 10, 11 y 12; los botones de garra envían al presionar y DETENER al soltar. Los códigos 5-8 son toggle y no muestran estado ON/OFF. Si hay una solicitud en vuelo, `commands.js` conserva solo el comando deseado más reciente y lo envía al terminar si difiere del sostenido activo; cambiar dirección no manda un DETENER intermedio. `config.js` tiene `TOGGLE_INTERRUPTS_MOVEMENT` para reflejar el resultado de la prueba de si un toggle interrumpe el sostenido. DETENER cancela solicitudes pendientes, invalida respuestas tardías, reintenta una vez con timeout corto y repite la detención cuando había solicitudes pendientes.

| Método | Ruta | Uso |
|---|---|---|
| GET | `/` | Salud de API; único dato para indicador AWS |
| GET | `/health/db` | Salud RDS; indicador independiente |
| GET | `/api/vehiculos/{id}/comandos` | Catálogo dinámico de comandos |
| GET | `/api/vehiculos/{id}/demos` | Selector de demos activas |
| POST | `/api/vehiculos/{id}/comandos/{id_comando}/ejecutar` | Solicitar comando individual |
| POST | `/api/vehiculos/{id}/detener` | DETENER; **CONFIRMAR EN SWAGGER** método y ruta |
| POST | `/api/vehiculos/{id}/demos/{id_demo}/ejecutar` | Iniciar demo; **CONFIRMAR EN SWAGGER** método y ruta |
| POST | `/api/vehiculos/{id}/demos/cancelar` | Cancelar demo; **CONFIRMAR EN SWAGGER** método y ruta |

En `config.js`, revisar `HTTP_METHODS` y `ROUTES` contra Swagger antes de conectar al backend. También hay que confirmar CORS para el origen donde se publique la web y si el navegador puede establecer el WSS.

## WebSocket

`js/ws.js` administra conexión, estados y reconexión exponencial limitada con jitter. `js/events.js` contiene el mapa de manejadores por `tipo`. Para agregar uno, importa/define una función y añádela a `handlers` o llama `registerMessageHandler('nuevo_tipo', manejador)`; recibe el objeto parseado y el contexto de UI. Los tipos desconocidos quedan en el registro con tipo y JSON crudo, mostrado mediante `textContent`.

El estado `conectado` de `estado_inicial` se etiqueta como dato reportado por el backend y se mantiene aparte del estado de la conexión WSS del navegador. El indicador WSS en línea no demuestra conexión física del vehículo.

## Supuestos y verificaciones

- Se asumió que los tres POST indicados usan POST y no requieren body; confirmar rutas y métodos en Swagger.
- El nombre de autor queda como `[nombre completo]` para reemplazarlo.
- Confirmar CORS, contrato de errores/eventos reales y todos los tipos WS que el firmware puede enviar.
- El timeout de seguridad de demo es 180 segundos y puede ajustarse en `js/config.js`.
