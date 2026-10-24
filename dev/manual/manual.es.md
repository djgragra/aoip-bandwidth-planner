# Manual del AoIP Bandwidth Planner

El AoIP Bandwidth Planner te ayuda a planificar una red de audio Dante / AES67: dibujas dispositivos, switches y enlaces, describes los flujos de audio y ves qué parte de cada enlace usan. Es una aplicación web (PWA) gratuita de OnAir Garage que funciona sin conexión después de la primera visita. Todo funciona en tu navegador y no se envía nada a ninguna parte.

## Abrir e instalar

Abre el planificador en `https://onairgarage.com/apps/aoip-bandwidth-planner/` (la página de la herramienta es `https://onairgarage.com/tools/aoip-bandwidth-planner/`). Para usarlo no se instala nada. También puedes instalarlo como app:

- **Chrome, Edge y otros navegadores Chromium**: pulsa el botón *Instalar app*.
- **iPhone y iPad (Safari)**: toca el botón Compartir y luego «Añadir a pantalla de inicio».
- **Safari en Mac**: menú Archivo y luego «Añadir al Dock».

La app se abre siempre en inglés; cambia el idioma en la cabecera (English, Italiano, Español) y la elección se recuerda. El tema puede ser claro, oscuro o seguir el sistema.

## Dibujar la red

En *Dispositivos y switches* construyes la red:

1. Pulsa **Añadir** para añadir un **dispositivo** o un **switch** (ponle un *Nombre* y elige el *Tipo*). El número de nodos está limitado («Límite alcanzado» te lo dice).
2. Usa **Conectar a** y **Velocidad del enlace** para unir un nodo a otro con un enlace de 100 Mbps, 1 Gbps o 10 Gbps.
3. Cada enlace pertenece a la red **primaria** o a la **secundaria** (la opción *Red*): así se dibuja la redundancia Dante.
4. Arrastra los nodos por el diagrama esquemático (o muévelos con las flechas); *Disposición automática* los ordena. **Quitar** elimina un nodo.

## Describir los flujos

En *Flujos* pulsa **Añadir flujo** (hace falta antes al menos un dispositivo). Cada flujo tiene:

- un **Nombre**, un dispositivo **Fuente** y los **Receptores** (sin ningún receptor seleccionado, un flujo aún no transporta nada);
- la **Entrega**: unicast (un flujo hacia cada receptor) o multicast;
- el número de **Canales**, la **Frecuencia de muestreo** (44,1, 48 o 96 kHz) y la **Profundidad de bits**;
- el **Modelo**: **AES67 (RTP)** o **Dante (estimación)**;
- las **Copias**, para repetir flujos idénticos (por ejemplo muchos dispositivos con la misma configuración), y, para Dante, **Redundante**: el mismo audio se envía también por la red secundaria, y se enruta y se cuenta por separado en cada red.

Para **AES67** eliges también el **Tiempo de paquete** (125 µs, 250 µs, 333 µs, 1 ms por defecto, 4 ms, o un número personalizado de muestras por paquete) y los **Canales por stream**; los tamaños a 16 y 24 bits se calculan. **Dante** es una **estimación** escalada a partir de las cifras que Audinate publica (el formato de paquetes de Dante no es público), solo para 24 bits. *Detalles del cálculo* muestra cómo se obtuvo la cifra de un flujo. *Duplicar* copia un flujo; *Quitar* lo elimina.

## Leer los resultados

- Cada enlace muestra **dos barras**, una por dirección (los enlaces son full duplex), rellenas de segmentos de colores, uno por flujo, con una marca en el **umbral de seguridad**. Por encima del umbral un enlace se pone ámbar, por encima de su capacidad rojo.
- Selecciona un enlace en el diagrama o en la lista: *Detalles del enlace* muestra su capacidad y, para cada dirección, los flujos que lo usan, con Mbps y paquetes por segundo.
- **Enrutamiento**: los flujos unicast se envían una vez por receptor por el camino más corto; los flujos multicast se envían una vez por enlace, o solo hacia sus receptores (*IGMP snooping* activado) o inundando todos los enlaces alcanzables desde la fuente (apagado).
- *Total en el enlace más cargado* da la carga más alta del plan.

## Ajustes y planes

En *Ajustes*: el **Umbral de seguridad** (70 % por defecto: Audinate recomienda mantener el tráfico de audio por debajo del 70 % de cualquier enlace), **Contar preámbulo y espacio entre tramas** (carga a la velocidad de línea), la **Etiqueta VLAN 802.1Q** (añade 4 bytes a cada paquete AES67) y el **IGMP snooping**.

En *Plan*: el plan se **guarda automáticamente solo en este dispositivo**. **Exportar JSON** lo guarda en un archivo e **Importar JSON** carga uno (después de que confirmes reemplazar el plan actual). **Cargar un ejemplo** ofrece tres: un pequeño estudio, una emisora de radio y una red Dante redundante.

## Idioma, tema y privacidad

El idioma y el tema se recuerdan en el dispositivo. Todo funciona en el navegador, las fuentes se sirven en local y no se envía nada a ninguna parte. Una pequeña tarjeta de propina al final tiene la hucha del sitio y un enlace a la página de apoyo de onairgarage.com en tu idioma en una pestaña nueva; dentro del planificador no se pide nunca nada.

## Actualizaciones

Cuando hay una versión nueva lista, un aviso de «actualización disponible» ofrece recargar. Ignorarlo deja simplemente en marcha la versión actual.

## Límites

- **Solo tráfico de audio**: el reloj (PTP), el descubrimiento, el control y otro tráfico no se cuentan, ni QoS, latencia o capacidad de los switches.
- IPv4, Ethernet sin etiqueta salvo que la opción VLAN esté activada, velocidades de línea nominales, un solo enlace entre dos nodos.
- Donde existen dos caminos se usa el más corto (se supone spanning tree; un bucle se señala).
- Los streams AES67 se cuentan solo en la red primaria; los esquemas de redundancia AES67 (como SMPTE ST 2022-7) no se modelan.
- Algunos dispositivos llevan menos canales por flujo a frecuencias de muestreo altas: no se modela.
- Las cifras de Dante son estimaciones. El planificador dimensiona un diseño; no sustituye una captura de red.

## Solución de problemas

| Problema | Qué hacer |
|---|---|
| «Límite alcanzado» al añadir un nodo | El plan tiene el número máximo de dispositivos y switches: quita uno antes. |
| Un flujo no transporta nada | Selecciona su fuente y al menos un receptor («Ningún receptor seleccionado»). |
| Un enlace está en rojo | Los flujos superan su capacidad: usa un enlace más rápido, menos canales, multicast u otro camino. |
| El archivo importado se rechaza | «Este archivo no es un plan válido»: importa un JSON exportado por este planificador. |
| No aparece el botón *Instalar app* | Puede que el navegador no lo ofrezca: en iPhone, iPad y Safari para Mac usa los pasos del capítulo Abrir e instalar. |

## Contactos

Graziano Melzi · OnAir Garage — `https://onairgarage.com` — `hello@onairgarage.com`. Página de la herramienta: `https://onairgarage.com/tools/aoip-bandwidth-planner/`. Código fuente y versiones: `https://github.com/djgragra/aoip-bandwidth-planner`. Licencia: MIT © 2026 Graziano Melzi.
