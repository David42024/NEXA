/**
 * Jerarquia geografica de Peru con posiciones de grilla para el tile-grid map.
 *
 * Cada departamento tiene una posicion (row, col) en una grilla que
 * represente approximadamente la forma de Peru.
 *
 * Tile grid layout (10 cols x 11 rows):
 *
 *        0    1    2    3    4    5    6    7    8    9
 *  0:                         [TUM]
 *  1:                    [PIU] [LAM]
 *  2:         [AMA]  [CAJ]  [LAL]
 *  3:         [SAN]  [ANC]  [JUN]
 *  4:         [UCU]  [PAS]  [HNU]  [LIM]  [CAL]
 *  5:         [MDD]  [HVC]         [ICA]
 *  6:                      [AYA]  [CUS]
 *  7:                      [APU]  [PUN]
 *  8:                             [ARE]
 *  9:                             [MOQ]  [TAC]
 * 10:                             [LORETO...]
 */

export const DEPARTAMENTOS = [
  { id: 1,  nombre: "Amazonas",      row: 2, col: 1, abbr: "AMA" },
  { id: 2,  nombre: "Ancash",        row: 3, col: 3, abbr: "ANC" },
  { id: 3,  nombre: "Apurimac",      row: 7, col: 4, abbr: "APU" },
  { id: 4,  nombre: "Arequipa",      row: 8, col: 5, abbr: "ARE" },
  { id: 5,  nombre: "Ayacucho",      row: 6, col: 4, abbr: "AYA" },
  { id: 6,  nombre: "Cajamarca",     row: 2, col: 3, abbr: "CAJ" },
  { id: 7,  nombre: "Callao",        row: 4, col: 8, abbr: "CAL" },
  { id: 8,  nombre: "Cusco",         row: 6, col: 5, abbr: "CUS" },
  { id: 9,  nombre: "Huancavelica",  row: 5, col: 3, abbr: "HVC" },
  { id: 10, nombre: "Huanuco",       row: 4, col: 6, abbr: "HNU" },
  { id: 11, nombre: "Ica",           row: 5, col: 7, abbr: "ICA" },
  { id: 12, nombre: "Junin",         row: 3, col: 5, abbr: "JUN" },
  { id: 13, nombre: "La Libertad",   row: 2, col: 4, abbr: "LAL" },
  { id: 14, nombre: "Lambayeque",    row: 1, col: 5, abbr: "LAM" },
  { id: 15, nombre: "Lima",          row: 4, col: 7, abbr: "LIM" },
  { id: 16, nombre: "Loreto",        row: 10, col: 1, abbr: "LOR" },
  { id: 17, nombre: "Madre de Dios", row: 5, col: 2, abbr: "MDD" },
  { id: 18, nombre: "Moquegua",      row: 9, col: 5, abbr: "MOQ" },
  { id: 19, nombre: "Pasco",         row: 4, col: 4, abbr: "PAS" },
  { id: 20, nombre: "Piura",         row: 1, col: 4, abbr: "PIU" },
  { id: 21, nombre: "Puno",          row: 7, col: 5, abbr: "PUN" },
  { id: 22, nombre: "San Martin",    row: 3, col: 1, abbr: "SMA" },
  { id: 23, nombre: "Tacna",         row: 9, col: 6, abbr: "TAC" },
  { id: 24, nombre: "Tumbes",        row: 0, col: 5, abbr: "TUM" },
  { id: 25, nombre: "Ucayali",       row: 4, col: 2, abbr: "UCU" },
]

export const PROVINCIAS = [
  // Amazonas
  { id: 101,  id_departamento: 1,  nombre: "Chachapoyas",   row: 0, col: 0, abbr: "CHA" },
  { id: 102,  id_departamento: 1,  nombre: "Bagua",         row: 0, col: 1, abbr: "BAG" },
  // Ancash
  { id: 201,  id_departamento: 2,  nombre: "Huaraz",        row: 0, col: 0, abbr: "HZA" },
  { id: 202,  id_departamento: 2,  nombre: "Santa",         row: 0, col: 1, abbr: "STR" },
  { id: 203,  id_departamento: 2,  nombre: "Chimbote",      row: 0, col: 2, abbr: "CHI" },
  // Apurimac
  { id: 301,  id_departamento: 3,  nombre: "Abancay",       row: 0, col: 0, abbr: "ABA" },
  { id: 302,  id_departamento: 3,  nombre: "Andahuaylas",   row: 0, col: 1, abbr: "AND" },
  // Arequipa
  { id: 401,  id_departamento: 4,  nombre: "Arequipa",      row: 0, col: 0, abbr: "AQP" },
  { id: 402,  id_departamento: 4,  nombre: "Caylloma",      row: 0, col: 1, abbr: "CAY" },
  { id: 403,  id_departamento: 4,  nombre: "Camana",        row: 0, col: 2, abbr: "CAM" },
  // Ayacucho
  { id: 501,  id_departamento: 5,  nombre: "Ayacucho",      row: 0, col: 0, abbr: "AYC" },
  { id: 502,  id_departamento: 5,  nombre: "Huamanga",      row: 0, col: 1, abbr: "HMA" },
  { id: 503,  id_departamento: 5,  nombre: "Cangallo",      row: 0, col: 2, abbr: "CGO" },
  // Cajamarca
  { id: 601,  id_departamento: 6,  nombre: "Cajamarca",     row: 0, col: 0, abbr: "CJA" },
  { id: 602,  id_departamento: 6,  nombre: "Celendin",      row: 0, col: 1, abbr: "CEL" },
  { id: 603,  id_departamento: 6,  nombre: "Jaen",          row: 0, col: 2, abbr: "JAE" },
  // Callao
  { id: 701,  id_departamento: 7,  nombre: "Callao",        row: 0, col: 0, abbr: "CLO" },
  // Cusco
  { id: 801,  id_departamento: 8,  nombre: "Cusco",         row: 0, col: 0, abbr: "CUZ" },
  { id: 802,  id_departamento: 8,  nombre: "Urubamba",      row: 0, col: 1, abbr: "URU" },
  { id: 803,  id_departamento: 8,  nombre: "La Convencion", row: 0, col: 2, abbr: "LCV" },
  // Huancavelica
  { id: 901,  id_departamento: 9,  nombre: "Huancavelica",  row: 0, col: 0, abbr: "HVC" },
  { id: 902,  id_departamento: 9,  nombre: "Castrovirreyna",row: 0, col: 1, abbr: "CAS" },
  // Huanuco
  { id: 1001, id_departamento: 10, nombre: "Huanuco",       row: 0, col: 0, abbr: "HUC" },
  { id: 1002, id_departamento: 10, nombre: "Leoncio Prado", row: 0, col: 1, abbr: "LPD" },
  // Ica
  { id: 1101, id_departamento: 11, nombre: "Ica",           row: 0, col: 0, abbr: "ICA" },
  { id: 1102, id_departamento: 11, nombre: "Chincha",       row: 0, col: 1, abbr: "CHN" },
  { id: 1103, id_departamento: 11, nombre: "Pisco",         row: 0, col: 2, abbr: "PSI" },
  // Junin
  { id: 1201, id_departamento: 12, nombre: "Junin",         row: 0, col: 0, abbr: "JUN" },
  { id: 1202, id_departamento: 12, nombre: "Huancayo",      row: 0, col: 1, abbr: "HAY" },
  { id: 1203, id_departamento: 12, nombre: "Tarma",         row: 0, col: 2, abbr: "TAR" },
  // La Libertad
  { id: 1301, id_departamento: 13, nombre: "Trujillo",      row: 0, col: 0, abbr: "TRU" },
  { id: 1302, id_departamento: 13, nombre: "Chiclayo",      row: 0, col: 1, abbr: "CHL" },
  { id: 1303, id_departamento: 13, nombre: "Otuzco",        row: 0, col: 2, abbr: "OTZ" },
  // Lambayeque
  { id: 1401, id_departamento: 14, nombre: "Chiclayo",      row: 0, col: 0, abbr: "CHI" },
  { id: 1402, id_departamento: 14, nombre: "Ferrenafe",     row: 0, col: 1, abbr: "FER" },
  { id: 1403, id_departamento: 14, nombre: "Lambayeque",    row: 0, col: 2, abbr: "LMY" },
  // Lima
  { id: 1501, id_departamento: 15, nombre: "Lima",          row: 0, col: 0, abbr: "LIM" },
  { id: 1502, id_departamento: 15, nombre: "Huarochiri",    row: 0, col: 1, abbr: "HRC" },
  { id: 1503, id_departamento: 15, nombre: "Caete",         row: 0, col: 2, abbr: "CTE" },
  { id: 1504, id_departamento: 15, nombre: "Canta",         row: 0, col: 3, abbr: "CNT" },
  // Loreto
  { id: 1601, id_departamento: 16, nombre: "Maynas",        row: 0, col: 0, abbr: "MAY" },
  { id: 1602, id_departamento: 16, nombre: "Loreto",        row: 0, col: 1, abbr: "LOR" },
  // Madre de Dios
  { id: 1701, id_departamento: 17, nombre: "Tambopata",     row: 0, col: 0, abbr: "TAM" },
  { id: 1702, id_departamento: 17, nombre: "Manu",          row: 0, col: 1, abbr: "MAN" },
  // Moquegua
  { id: 1801, id_departamento: 18, nombre: "Mariscal Nieto",row: 0, col: 0, abbr: "MNI" },
  { id: 1802, id_departamento: 18, nombre: "Ilo",           row: 0, col: 1, abbr: "ILO" },
  // Pasco
  { id: 1901, id_departamento: 19, nombre: "Daniel Alcides Carrión", row: 0, col: 0, abbr: "DAC" },
  { id: 1902, id_departamento: 19, nombre: "Oxapampa",      row: 0, col: 1, abbr: "OXA" },
  // Piura
  { id: 2001, id_departamento: 20, nombre: "Piura",         row: 0, col: 0, abbr: "PIU" },
  { id: 2002, id_departamento: 20, nombre: "Sullana",       row: 0, col: 1, abbr: "SUL" },
  { id: 2003, id_departamento: 20, nombre: "Talara",        row: 0, col: 2, abbr: "TAL" },
  // Puno
  { id: 2101, id_departamento: 21, nombre: "Puno",          row: 0, col: 0, abbr: "PNO" },
  { id: 2102, id_departamento: 21, nombre: "Azangaro",      row: 0, col: 1, abbr: "AZG" },
  { id: 2103, id_departamento: 21, nombre: "Chucuito",      row: 0, col: 2, abbr: "CHC" },
  // San Martin
  { id: 2201, id_departamento: 22, nombre: "Moyobamba",     row: 0, col: 0, abbr: "MOY" },
  { id: 2202, id_departamento: 22, nombre: "Tarapoto",      row: 0, col: 1, abbr: "TPT" },
  { id: 2203, id_departamento: 22, nombre: "Rioja",         row: 0, col: 2, abbr: "RJA" },
  // Tacna
  { id: 2301, id_departamento: 23, nombre: "Tacna",         row: 0, col: 0, abbr: "TAC" },
  { id: 2302, id_departamento: 23, nombre: "Jorge Basadre", row: 0, col: 1, abbr: "JBA" },
  // Tumbes
  { id: 2401, id_departamento: 24, nombre: "Tumbes",        row: 0, col: 0, abbr: "TMB" },
  { id: 2402, id_departamento: 24, nombre: "Zarumilla",     row: 0, col: 1, abbr: "ZAR" },
  // Ucayali
  { id: 2501, id_departamento: 25, nombre: "Coronel Portillo", row: 0, col: 0, abbr: "CPT" },
  { id: 2502, id_departamento: 25, nombre: "Atalaya",       row: 0, col: 1, abbr: "ATA" },
]

export const DISTRITOS = [
  // Lima capital
  { id: 150101, id_provincia: 1501, nombre: "Lima",                    row: 0, col: 0 },
  { id: 150102, id_provincia: 1501, nombre: "San Isidro",              row: 0, col: 1 },
  { id: 150103, id_provincia: 1501, nombre: "Miraflores",              row: 0, col: 2 },
  { id: 150104, id_provincia: 1501, nombre: "Surco",                   row: 0, col: 3 },
  { id: 150105, id_provincia: 1501, nombre: "San Borja",               row: 0, col: 4 },
  { id: 150106, id_provincia: 1501, nombre: "La Molina",               row: 1, col: 0 },
  { id: 150107, id_provincia: 1501, nombre: "Jesus Maria",             row: 1, col: 1 },
  { id: 150108, id_provincia: 1501, nombre: "Lince",                   row: 1, col: 2 },
  { id: 150109, id_provincia: 1501, nombre: "Pueblo Libre",            row: 1, col: 3 },
  { id: 150110, id_provincia: 1501, nombre: "San Miguel",              row: 1, col: 4 },
  { id: 150111, id_provincia: 1501, nombre: "Brena",                   row: 2, col: 0 },
  { id: 150112, id_provincia: 1501, nombre: "Rimac",                   row: 2, col: 1 },
  { id: 150113, id_provincia: 1501, nombre: "San Martin de Porres",    row: 2, col: 2 },
  { id: 150114, id_provincia: 1501, nombre: "Los Olivos",              row: 2, col: 3 },
  { id: 150115, id_provincia: 1501, nombre: "Comas",                   row: 2, col: 4 },
  { id: 150116, id_provincia: 1501, nombre: "Carabayllo",              row: 3, col: 0 },
  { id: 150117, id_provincia: 1501, nombre: "San Juan de Lurigancho",  row: 3, col: 1 },
  { id: 150118, id_provincia: 1501, nombre: "Ate",                     row: 3, col: 2 },
  { id: 150119, id_provincia: 1501, nombre: "Santa Anita",             row: 3, col: 3 },
  // Callao
  { id: 70101, id_provincia: 701,  nombre: "Callao",                   row: 0, col: 0 },
  { id: 70102, id_provincia: 701,  nombre: "Bellavista",               row: 0, col: 1 },
  { id: 70103, id_provincia: 701,  nombre: "Carmen de la Legua",       row: 0, col: 2 },
  { id: 70104, id_provincia: 701,  nombre: "La Perla",                 row: 1, col: 0 },
  { id: 70105, id_provincia: 701,  nombre: "Ventanilla",               row: 1, col: 1 },
  // Arequipa
  { id: 40101, id_provincia: 401,  nombre: "Arequipa",                 row: 0, col: 0 },
  { id: 40102, id_provincia: 401,  nombre: "Cayma",                    row: 0, col: 1 },
  { id: 40103, id_provincia: 401,  nombre: "Cerro Colorado",           row: 0, col: 2 },
  { id: 40104, id_provincia: 401,  nombre: "Socabaya",                 row: 1, col: 0 },
  { id: 40201, id_provincia: 402,  nombre: "Chivay",                   row: 1, col: 1 },
  { id: 40202, id_provincia: 402,  nombre: "Caylloma",                 row: 1, col: 2 },
  // Cusco
  { id: 80101, id_provincia: 801,  nombre: "Cusco",                    row: 0, col: 0 },
  { id: 80102, id_provincia: 801,  nombre: "San Sebastian",            row: 0, col: 1 },
  { id: 80103, id_provincia: 801,  nombre: "Santiago",                 row: 0, col: 2 },
  { id: 80201, id_provincia: 802,  nombre: "Urubamba",                 row: 1, col: 0 },
  { id: 80202, id_provincia: 802,  nombre: "Ollantaytambo",            row: 1, col: 1 },
  // Trujillo
  { id: 130101, id_provincia: 1301, nombre: "Trujillo",                row: 0, col: 0 },
  { id: 130102, id_provincia: 1301, nombre: "Huanchaco",               row: 0, col: 1 },
  { id: 130103, id_provincia: 1301, nombre: "Laredo",                  row: 0, col: 2 },
  // Chiclayo
  { id: 140101, id_provincia: 1401, nombre: "Chiclayo",                row: 0, col: 0 },
  { id: 140102, id_provincia: 1401, nombre: "Pimentel",                row: 0, col: 1 },
  { id: 140103, id_provincia: 1401, nombre: "Lambayeque",              row: 0, col: 2 },
  // Piura
  { id: 200101, id_provincia: 2001, nombre: "Piura",                   row: 0, col: 0 },
  { id: 200102, id_provincia: 2001, nombre: "Castilla",                row: 0, col: 1 },
  { id: 200201, id_provincia: 2002, nombre: "Sullana",                 row: 0, col: 2 },
  { id: 200301, id_provincia: 2003, nombre: "Talara",                  row: 0, col: 3 },
  // Ica
  { id: 110101, id_provincia: 1101, nombre: "Ica",                     row: 0, col: 0 },
  { id: 110102, id_provincia: 1101, nombre: "La Tinguiña",             row: 0, col: 1 },
  { id: 110201, id_provincia: 1102, nombre: "Chincha Alta",            row: 0, col: 2 },
  { id: 110301, id_provincia: 1103, nombre: "Pisco",                   row: 0, col: 3 },
  // Puno
  { id: 210101, id_provincia: 2101, nombre: "Puno",                    row: 0, col: 0 },
  { id: 210102, id_provincia: 2101, nombre: "San Carlos",              row: 0, col: 1 },
  { id: 210201, id_provincia: 2102, nombre: "Azangaro",                row: 0, col: 2 },
  // Huancayo
  { id: 120201, id_provincia: 1202, nombre: "Huancayo",                row: 0, col: 0 },
  { id: 120202, id_provincia: 1202, nombre: "Sapallanga",              row: 0, col: 1 },
  // Huaraz
  { id: 20101,  id_provincia: 201,  nombre: "Huaraz",                  row: 0, col: 0 },
  { id: 20102,  id_provincia: 201,  nombre: "Independencia",           row: 0, col: 1 },
  // Tarapoto
  { id: 220201, id_provincia: 2202, nombre: "Tarapoto",                row: 0, col: 0 },
  { id: 220202, id_provincia: 2202, nombre: "Cacatachi",               row: 0, col: 1 },
  // Tacna
  { id: 230101, id_provincia: 2301, nombre: "Tacna",                   row: 0, col: 0 },
  { id: 230102, id_provincia: 2301, nombre: "Calana",                  row: 0, col: 1 },
  // Tumbes
  { id: 240101, id_provincia: 2401, nombre: "Tumbes",                  row: 0, col: 0 },
  { id: 240102, id_provincia: 2401, nombre: "El Porvenir",             row: 0, col: 1 },
  // Moyobamba
  { id: 220101, id_provincia: 2201, nombre: "Moyobamba",               row: 0, col: 0 },
  // Cajamarca
  { id: 60101,  id_provincia: 601,  nombre: "Cajamarca",               row: 0, col: 0 },
  { id: 60102,  id_provincia: 601,  nombre: "Los Banos del Inca",      row: 0, col: 1 },
  { id: 60201,  id_provincia: 602,  nombre: "Celendin",                row: 0, col: 2 },
  { id: 60301,  id_provincia: 603,  nombre: "Jaen",                    row: 0, col: 3 },
  // Others
  { id: 10101,  id_provincia: 101,  nombre: "Chachapoyas",             row: 0, col: 0 },
  { id: 30101,  id_provincia: 301,  nombre: "Abancay",                 row: 0, col: 0 },
  { id: 50101,  id_provincia: 501,  nombre: "Ayacucho",                row: 0, col: 0 },
  { id: 100101, id_provincia: 1001, nombre: "Huanuco",                 row: 0, col: 0 },
  { id: 90101,  id_provincia: 901,  nombre: "Huancavelica",            row: 0, col: 0 },
  { id: 180201, id_provincia: 1802, nombre: "Ilo",                     row: 0, col: 0 },
  { id: 190201, id_provincia: 1902, nombre: "Oxapampa",                row: 0, col: 0 },
  { id: 250101, id_provincia: 2501, nombre: "Calleri",                 row: 0, col: 0 },
  { id: 250102, id_provincia: 2501, nombre: "Yarinacocha",             row: 0, col: 1 },
  { id: 170101, id_provincia: 1701, nombre: "Puerto Maldonado",        row: 0, col: 0 },
  { id: 160101, id_provincia: 1601, nombre: "Iquitos",                 row: 0, col: 0 },
]

/**
 * Normaliza un nombre geografico para hacer join con GeoJSON externo.
 * Quita tildes, pasa a mayusculas, elimina espacios extra.
 */
export function normalizarNombre(nombre) {
  if (!nombre) return ''
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Mapa de IDs de departamentos a sus provincias */
export const DEPTO_PROVINCIAS = {}
PROVINCIAS.forEach(p => {
  if (!DEPTO_PROVINCIAS[p.id_departamento]) DEPTO_PROVINCIAS[p.id_departamento] = []
  DEPTO_PROVINCIAS[p.id_departamento].push(p)
})

/** Mapa de IDs de provincias a sus distritos */
export const PROV_DISTRITOS = {}
DISTRITOS.forEach(d => {
  if (!PROV_DISTRITOS[d.id_provincia]) PROV_DISTRITOS[d.id_provincia] = []
  PROV_DISTRITOS[d.id_provincia].push(d)
})
