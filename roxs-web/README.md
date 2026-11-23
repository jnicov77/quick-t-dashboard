# ROXS Bio Filtros · sitio web

Sitio estático: un solo `index.html` más la carpeta `img/`. No necesita servidor, base de datos ni instalación. Funciona en cualquier hosting que sirva archivos.

```
roxs-web/
├── index.html      ← toda la página (estilos y código incluidos)
├── img/            ← fotos, logos, Widcy e íconos
├── DESIGN.md       ← guía de diseño (colores, tipografías, componentes)
└── README.md       ← este archivo
```

## Publicarlo en la web

Elige una opción. En todas se sube **la carpeta completa** (`index.html` + `img/`).

### Opción A: Netlify Drop (la más rápida, gratis)
1. Entra a https://app.netlify.com/drop
2. Arrastra la carpeta `roxs-web` a la página.
3. Netlify te da un enlace al instante. Crea una cuenta para conservarlo y conectar tu dominio (Site settings → Domain management).

### Opción B: Vercel (gratis)
1. Entra a https://vercel.com/new y elige subir una carpeta, o conecta un repositorio de GitHub con estos archivos.
2. Framework: "Other". No hay comando de build.
3. Conecta tu dominio en Settings → Domains.

### Opción C: tu hosting actual (cPanel, Hostinger, etc.)
1. Abre el Administrador de archivos (o conéctate por FTP).
2. Sube el contenido de `roxs-web` dentro de `public_html/` (o de la carpeta de tu dominio o subdominio).
3. Verifica que `index.html` quede en la raíz de esa carpeta, junto a `img/`.

### Opción D: GitHub Pages (gratis)
1. Crea un repositorio y sube los archivos.
2. Settings → Pages → Source: rama `main`, carpeta `/ (root)`.

> Usa HTTPS (todas estas opciones lo incluyen). El carrito guarda los productos en el navegador del visitante.

## Lo que falta completar antes de vender

Todo está en `index.html`, en el bloque `<script>` del final.

### 1. Precios (línea ~582, `const P=[`)
Cada producto tiene `price:null`, que se muestra como "Precio por definir". Cámbialo por el valor en pesos, sin puntos:
```js
{id:'yarumo', ..., price:18000, ...}
```
El total del carrito se calcula solo cuando todos los productos del pedido tienen precio.

### 2. Mercado Pago
Hay dos formas. Usa la que te sirva:
- **Un link por producto** (recomendado): crea un link de pago en Mercado Pago para cada producto y pégalo en su campo `mp`:
  ```js
  {id:'canamo', ..., mp:'https://mpago.la/xxxxxxx', ...}
  ```
  El botón "Comprar con Mercado Pago" de la ficha abre ese link.
- **Un link general** (línea ~571, `const CONFIG`):
  ```js
  mercadoPago:'https://link.mercadopago.com.co/roxs'
  ```
  El botón "Pagar con Mercado Pago" del carrito abre ese link.

Mientras no haya links, el botón muestra el resumen del pedido para copiarlo.
**Ojo:** cobrar automáticamente el total de un carrito con varios productos requiere la integración Checkout Pro de Mercado Pago, que necesita un pequeño servidor (o una plataforma como Shopify o WooCommerce). Con links de pago, cada link cobra un producto o monto fijo.

### 3. Datos de productos por confirmar
En `const P=[` cada producto tiene `details:[...]`. Reemplaza los "por confirmar": cantidad de filtros de la bolsa negra, medidas de las bandejas, tallas y nombre del Drop, contenido de los kits.
- Productos que aún no están: tienen `soon:1` (se muestran como "Próximamente"). Quítalo cuando estén disponibles y agrega su foto en `imgs:['nombre-de-la-foto']` (archivo `img/nombre-de-la-foto.webp`).
- Tallas de camisetas: `sizes:['S','M','L','XL']`.

### 4. Blog y comunidad
- Artículos: `const POSTS=[` (línea ~601). Son artículos de ejemplo; reemplaza título, imagen y párrafos (`['p','texto']` para párrafos, `['h','título']` para subtítulos). Quita la nota "Artículos de ejemplo…" del HTML (busca ese texto).
- Reseñas: la sección "Reseñas y cultivos" de Nuestra comunidad tiene espacios vacíos. Cuando tengas fotos y textos de clientes (con su permiso), se reemplazan esos `<div class="slot">`.

### 5. Otros ajustes
- **Aviso +18:** `edad:true` en `CONFIG`. Ponlo en `false` para quitarlo.
- **Instagram:** aparece como `https://instagram.com/roxsbf` (líneas ~418, 448, 540).
- **Vista previa al compartir en redes:** en la línea 10, cambia `content="img/l-bolsa-naranja.webp"` por la dirección completa cuando tengas dominio, por ejemplo `content="https://roxs.co/img/l-bolsa-naranja.webp"`.
- **Tipografías:** se usan Unbounded y Manrope (Google Fonts) como sustitutas de Moderniz, Bakora y Satoshi. Si tienes los archivos .woff2 con licencia web, se pueden poner en `fonts/` y cargarlos con `@font-face`.

## Secciones (enlaces directos)
- `#inicio`
- `#tienda` (y por categoría: `#tienda-ritual`, `#tienda-cultiva`, `#tienda-ropa`, `#tienda-kits`)
- `#comunidad`
- `#juego` (el botón abre https://quickt.tech/cultiva/)
- `#blog` (y cada artículo: `#blog-sembrar`, `#blog-yarumo`…)

## Imágenes
Están en formato WebP, optimizadas para web (1,8 MB en total). Para agregar fotos nuevas, súbelas a `img/` en .webp o .jpg de unos 1000–1400 px y usa el nombre del archivo (sin extensión) en `imgs:[...]`.
