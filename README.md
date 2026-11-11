# Carrito Jesus · Control IoT

Panel web estático para controlar un vehículo IoT. La interfaz adapta la cabina a móvil vertical, móvil horizontal, tablet y escritorio. El nombre de marca, el autor y el año se configuran en `js/config.js`.

## Estructura

```text
control-iot/
├── index.html
├── assets/favicon.svg
├── css/{tokens,base,components}.css
├── data/{grupos,joystick-map}.js
└── js/{api,commands,config,demo,events,health,joystick,main,state,ui,ws}.js
```

## Ejecución local

Sirve la carpeta desde un servidor estático (los módulos ES no deben abrirse con `file://`):

```sh
python -m http.server 8000
```

Abre `http://localhost:8000/`. Todos los recursos locales usan rutas relativas.

## Integración API

`js/config.js` centraliza URL, vehículo, rutas, métodos, tiempos e identidad de marca. `js/api.js` hace Fetch con timeout, cancelación, parseo seguro y normalización de errores. Los comandos y demos se cargan desde el backend y reintentan con backoff si fallan.

Confirma rutas, métodos, CORS y conexión WSS contra la configuración del backend antes de publicar.
