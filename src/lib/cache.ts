import { revalidateTag, unstable_cache } from "next/cache";

/**
 * Caché de las lecturas de Airtable.
 *
 * Airtable corta en 5 peticiones por segundo y por base, y `listarRegistros`
 * recorre la tabla completa de 100 en 100. Sin caché, cada carga de página
 * dispara varios barridos y con unos miles de registros eso pasa del límite.
 *
 * Solo se cachea la lectura cruda de una tabla, que no depende de quién mira.
 * El filtrado por permisos ocurre después, fuera del caché — meter la sesión
 * aquí serviría datos de una persona a otra.
 *
 * Se usa `unstable_cache` y no la directiva `use cache` porque esta última
 * exige activar `cacheComponents` en todo el proyecto, y las 7 páginas leen la
 * cookie de sesión: es una migración aparte, no un ajuste de rendimiento.
 */

export const ETIQUETAS = {
  visitas: "airtable:visitas",
  casos: "airtable:casos",
  clientes: "airtable:clientes",
  contactos: "airtable:contactos",
  cultivos: "airtable:cultivos",
  productos: "airtable:productos",
  personal: "airtable:personal",
  areas: "airtable:areas",
  pedidos: "airtable:pedidos",
  remisiones: "airtable:remisiones",
  cotizaciones: "airtable:cotizaciones",
} as const;

export type Etiqueta = (typeof ETIQUETAS)[keyof typeof ETIQUETAS];

/**
 * Cuánto puede quedarse una lectura sin refrescar. Es un techo, no una
 * promesa de frescura: toda escritura del CRM invalida su etiqueta al
 * instante, así que quien acaba de guardar ve su cambio de inmediato.
 *
 * Lo operativo vence antes porque cambia durante el día; los maestros duran
 * más porque se tocan poco.
 */
const SEGUNDOS = {
  [ETIQUETAS.visitas]: 30,
  [ETIQUETAS.casos]: 30,
  [ETIQUETAS.clientes]: 120,
  [ETIQUETAS.contactos]: 120,
  [ETIQUETAS.cultivos]: 300,
  [ETIQUETAS.productos]: 300,
  [ETIQUETAS.personal]: 300,
  // Las áreas de la empresa se crean una vez y ahí se quedan.
  [ETIQUETAS.areas]: 600,
  // Un pedido cambia de estado durante el dia; la remision la escribe otra app.
  [ETIQUETAS.pedidos]: 30,
  [ETIQUETAS.remisiones]: 60,
  // Una cotización se edita mientras se negocia, y quien la imprime necesita
  // ver lo que acabó de cambiar.
  [ETIQUETAS.cotizaciones]: 30,
} as const satisfies Record<Etiqueta, number>;

/**
 * Envuelve una lectura. `clave` tiene que ser única y estable: es parte de la
 * llave del caché, igual que los argumentos de `leer`.
 *
 * Estable no quiere decir eterna: si cambia la **forma** de lo que se devuelve
 * —un campo nuevo, uno que se renombra o pasa de valor único a lista— hay que
 * versionar la clave ("contactos" → "contactos-v2"). Las entradas guardadas no
 * se invalidan solas al desplegar: sobreviven con la forma vieja y el código
 * nuevo revienta al leer un campo que ahí no existe. `invalidar()` no sirve
 * para esto —borra por etiqueta, no reconoce que el tipo cambió—; la clave
 * nueva simplemente no encuentra nada y vuelve a Airtable.
 *
 * No envolver lecturas que decidan permisos antes de escribir: un dato viejo
 * ahí dejaría editar un registro que ya cambió de dueño.
 */
export function cachearLectura<A extends unknown[], T>(
  clave: string,
  etiqueta: Etiqueta,
  leer: (...args: A) => Promise<T>,
): (...args: A) => Promise<T> {
  return unstable_cache(leer, [clave], {
    tags: [etiqueta],
    revalidate: SEGUNDOS[etiqueta],
  });
}

/**
 * Descarta el caché de las tablas que acabó de tocar una escritura.
 *
 * `{ expire: 0 }` y no `"max"`: con "max" la siguiente lectura recibe el dato
 * viejo mientras revalida por detrás, y quien acaba de guardar vería su
 * pantalla sin el cambio. `updateTag`, que es lo indicado para leer lo propio
 * recién escrito, solo funciona dentro de Server Functions y estas mutaciones
 * son Route Handlers.
 */
export function invalidar(...etiquetas: Etiqueta[]): void {
  for (const etiqueta of etiquetas) {
    revalidateTag(etiqueta, { expire: 0 });
  }
}
