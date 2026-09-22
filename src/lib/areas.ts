import { listarRegistros, texto } from "@/lib/airtable";
import { cachearLectura, ETIQUETAS } from "@/lib/cache";
import { env } from "@/lib/env";

/**
 * Base "Sirius Nomina Core", tabla "Areas": las áreas de la empresa.
 *
 * Son el mismo maestro que usa Nómina para colgar a cada empleado de un área,
 * así que el CRM solo lee. El cruce con el resto del sistema es por el serial
 * `SIRIUS-AREA-XXXX`, igual que `CL-XXXX` o `SIRIUS-PRODUCT-XXXX`: guardar el
 * nombre del área dejaría el pedido apuntando a algo que puede renombrarse.
 *
 * No confundir con `AreaProducto` de `productos-comun`, que es la dupla
 * Pirólisis/Laboratorio con la que el catálogo separa sus dos líneas.
 */

const CAMPOS_AREA = {
  codigo: "Codigo Area",
  nombre: "Nombre del Area",
} as const;

/** Los códigos son SIRIUS-AREA-XXXX; el CRM los valida antes de escribirlos. */
export const SERIAL_AREA = /^SIRIUS-AREA-\d{3,6}$/;

export type AreaEmpresa = {
  recordId: string;
  /** Serial legible, formato SIRIUS-AREA-XXXX. Es lo que se guarda al cruzar. */
  codigo: string;
  nombre: string;
};

/**
 * Las áreas de la empresa, ordenadas por nombre.
 *
 * Se descartan las que no tengan código o nombre: sin serial no se pueden
 * referenciar, y sin nombre no hay qué mostrar en un selector.
 */
export const listarAreas = cachearLectura(
  "areas",
  ETIQUETAS.areas,
  async (): Promise<AreaEmpresa[]> => {
    const registros = await listarRegistros(env.baseNomina, env.tablaAreas, {
      fields: Object.values(CAMPOS_AREA),
    });

    return registros
      .flatMap((registro) => {
        const codigo = texto(registro.fields[CAMPOS_AREA.codigo]);
        const nombre = texto(registro.fields[CAMPOS_AREA.nombre]);
        if (!codigo || !nombre) return [];
        return [{ recordId: registro.id, codigo, nombre }];
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  },
);

/**
 * Las áreas desde las que sale un pedido, en el orden en que se ofrecen.
 *
 * La empresa tiene doce áreas, pero un pedido solo nace en las dos líneas
 * productivas: son las mismas que el catálogo separa en `AREAS_PRODUCTO` y las
 * que distingue `Origen del Pedido` (DataLab / PiroliApp). Se listan por
 * código y no por nombre porque un área renombrada en Nómina dejaría el
 * selector vacío sin que nadie lo note.
 */
const AREAS_DE_PEDIDO = [
  "SIRIUS-AREA-0009", // PIROLISIS
  "SIRIUS-AREA-0008", // LABORATORIO
] as const;

/**
 * Las áreas que el formulario de pedidos ofrece.
 *
 * Filtra lo que se puede elegir, no lo que se puede leer: un pedido que ya
 * apunte a otra área —escrito antes, o desde otra app— conserva su nombre al
 * mostrarse, porque `conAreas` sigue resolviendo contra el maestro completo.
 */
export function areasDePedido(areas: AreaEmpresa[]): AreaEmpresa[] {
  const porCodigo = new Map(areas.map((area) => [area.codigo, area]));
  return AREAS_DE_PEDIDO.flatMap((codigo) => {
    const area = porCodigo.get(codigo);
    return area ? [area] : [];
  });
}

/**
 * Si un código es una de las áreas desde las que puede nacer un pedido.
 *
 * Lo usa el POST: dejar que la API acepte las doce mientras el formulario
 * ofrece dos convertiría la regla en un adorno de la pantalla.
 */
export function esAreaDePedido(codigo: string): boolean {
  return (AREAS_DE_PEDIDO as readonly string[]).includes(codigo);
}

/** Pone el nombre del área a partir del código; el código sigue mandando. */
export function nombresPorCodigo(areas: AreaEmpresa[]): Map<string, string> {
  return new Map(areas.map((area) => [area.codigo, area.nombre]));
}
