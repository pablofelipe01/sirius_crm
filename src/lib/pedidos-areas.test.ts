/**
 * El área del pedido se guarda como serial (`SIRIUS-AREA-XXXX`) y el nombre se
 * resuelve al leer. Las dos puntas de ese cruce son lo que se prueba aquí: que
 * el serial que entra a Airtable esté validado, y que un serial sin área —un
 * área renombrada, borrada o escrita por DataLab— no se pierda por el camino.
 */

import { describe, expect, it } from "vitest";

import { areasDePedido, esAreaDePedido, SERIAL_AREA } from "@/lib/areas";
import { conAreas, type Pedido } from "@/lib/pedidos";

const AREAS = [
  { recordId: "recA", codigo: "SIRIUS-AREA-0003", nombre: "ADMINISTRACION" },
  { recordId: "recB", codigo: "SIRIUS-AREA-0008", nombre: "LABORATORIO" },
  { recordId: "recC", codigo: "SIRIUS-AREA-0009", nombre: "PIROLISIS" },
];

function pedido(idAreaCore: string | null): Pedido {
  return {
    recordId: "rec1",
    id: "SIRIUS-PED-0070",
    idClienteCore: "CL-0001",
    idPersonalCore: "SIRIUS-PER-0002",
    responsable: null,
    idAreaCore,
    area: null,
    fecha: "2026-09-11",
    origen: null,
    estado: "Recibido",
    categoriaAplicacion: null,
    notas: null,
    lineas: [],
    total: 0,
  };
}

describe("SERIAL_AREA", () => {
  it("acepta los códigos que emite Sirius Nomina Core", () => {
    expect(SERIAL_AREA.test("SIRIUS-AREA-0001")).toBe(true);
    expect(SERIAL_AREA.test("SIRIUS-AREA-0012")).toBe(true);
  });

  it("rechaza un nombre de área escrito a mano", () => {
    expect(SERIAL_AREA.test("LABORATORIO")).toBe(false);
    expect(SERIAL_AREA.test("SIRIUS-AREA-")).toBe(false);
    // Ni el serial de otra entidad: los tres conviven en la misma tabla.
    expect(SERIAL_AREA.test("SIRIUS-PER-0002")).toBe(false);
  });
});

describe("conAreas", () => {
  it("pone el nombre del área a partir del código", () => {
    const [resultado] = conAreas([pedido("SIRIUS-AREA-0008")], AREAS);
    expect(resultado.area).toBe("LABORATORIO");
    // El código sigue siendo el dato: el nombre solo se muestra.
    expect(resultado.idAreaCore).toBe("SIRIUS-AREA-0008");
  });

  it("deja el área vacía si el pedido no la tiene", () => {
    const [resultado] = conAreas([pedido(null)], AREAS);
    expect(resultado.area).toBeNull();
  });

  /**
   * Un código que ya no está en el maestro no se inventa un nombre. Quien lo
   * muestre cae de vuelta al código, que es lo único cierto que queda.
   */
  it("no resuelve un código que el maestro no conoce", () => {
    const [resultado] = conAreas([pedido("SIRIUS-AREA-9999")], AREAS);
    expect(resultado.area).toBeNull();
    expect(resultado.idAreaCore).toBe("SIRIUS-AREA-9999");
  });
});

describe("areasDePedido", () => {
  it("ofrece solo las dos líneas productivas, Pirólisis primero", () => {
    expect(areasDePedido(AREAS).map((a) => a.nombre)).toEqual([
      "PIROLISIS",
      "LABORATORIO",
    ]);
  });

  /** El maestro se lee entero; el recorte es solo de lo que se puede elegir. */
  it("no inventa un área que Nómina no tiene", () => {
    expect(areasDePedido([AREAS[0]])).toEqual([]);
  });
});

describe("esAreaDePedido", () => {
  it("acepta Pirólisis y Laboratorio, y nada más", () => {
    expect(esAreaDePedido("SIRIUS-AREA-0009")).toBe(true);
    expect(esAreaDePedido("SIRIUS-AREA-0008")).toBe(true);
    expect(esAreaDePedido("SIRIUS-AREA-0003")).toBe(false);
  });
});
