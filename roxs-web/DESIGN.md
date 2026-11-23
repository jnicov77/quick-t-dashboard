# DESIGN.md · ROXS Bio Filtros — sitio web

Fuente: Manual de marca ROXS (oct. 2025). Sin referencias de UXKIN (no conectado): la dirección sale del manual, no de sitios comparados.

**Dirección:** retro-espacial y botánica, con energía de cartel callejero. Campos planos de color de marca hasta el borde, el logo con franjas tipo atardecer, el destello de estrella y el personaje Widcy como guía. Lúdica pero ordenada. Nada de degradados morado→azul ni vidrio.

## Color

| Token | Claro | Oscuro | Rol |
|---|---|---|---|
| `--cream` | #FFF5E6 | #1A0630 | Fondo base (oscuro: "morado noche") |
| `--ink` | #22093A | #FFF5E6 | Texto principal |
| `--purple` | #510C82 | #B98CE8 | Primario: títulos, enlaces, botón principal |
| `--green` | #0B8457 | #3FC48D | Soporte: siembra, crecimiento, éxito. Texto pequeño en claro: #08704A |
| `--yellow` | #FFC100 | #FFC100 | Acento: precio, destellos, botón destacado (siempre con texto morado encima) |
| `--line` | #22093A1F | #FFF5E626 | Bordes y divisores |
| `--error` | #C2361F | #FF8A73 | Errores de formulario |

Contraste: morado sobre crema 11:1, morado sobre amarillo 8:1, crema sobre verde 4.5:1 (solo texto grande o botones en negrita). Nunca amarillo sobre crema para texto.

## Tipografía

- **Display (Moderniz → sustituto web: Unbounded 800/900).** Títulos y cifras grandes, MAYÚSCULAS, interlineado 1.0–1.05.
- **Display ligera (Bakora → Unbounded 300).** Segunda línea de títulos ("MANUAL DE / **MARCA**"), siempre junto a la versión pesada.
- **Texto (Satoshi → sustituto web: Manrope 400/600/700).** Cuerpo y botones.
- Si la marca entrega los archivos .woff2 de Moderniz, Bakora y Satoshi con licencia web, se reemplazan los sustitutos.

Escala: 13 · 15 · 17 (cuerpo) · 22 · 32 · 48 · clamp(56–120) (cartel). Líneas de 60–70 caracteres.

## Espaciado y forma

- Base 8: 4 · 8 · 16 · 24 · 32 · 48 · 80 · 120. Secciones: clamp(48px, 8vw, 120px) vertical. Contenido máx. 1240px; bandas de color a todo el ancho.
- Radio: 12px (botones, inputs), 24px (tarjetas, como los recuadros de color del manual), 999px (píldoras/etiquetas).
- Profundidad: sin sombras difusas. Una "sombra de bloque" sólida desplazada (4px 4px 0 var(--ink)), eco de la extrusión del logo, solo en botones y tarjetas de producto.
- Corchetes `[ ]` finos alrededor de títulos de sección, como en el manual.

## Componentes

- **Botón principal:** fondo morado, texto crema, sombra de bloque; hover sube 2px; foco: anillo amarillo 3px; deshabilitado al 40%.
- **Botón destacado (comprar):** fondo amarillo, texto morado.
- **Botón secundario:** borde 2px morado, fondo transparente. **Silencioso:** solo texto subrayado.
- **Navegación:** barra fija crema con logo a la izquierda, 5 secciones, carrito con contador; en móvil, menú a pantalla completa morado.
- **Tarjeta de producto:** foto real sobre campo de color, nombre, contenido, precio en amarillo, cantidad + agregar.
- **Pie:** banda morada con isotipo, enlaces, Instagram @roxsbf, "Hecho en Medellín".

## Imagen e iconos

- Fotos de producto reales sobre fondo naranja/verde/crema, recortadas en marcos redondeados de 24px.
- Ilustración: Widcy, la flor con ojo y el destello de estrella, en trazo morado del manual.
- Iconos: trazo de 2px, esquinas redondeadas, dibujados en SVG en línea (sin emojis).
