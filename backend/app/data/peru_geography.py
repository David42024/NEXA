"""Jerarquia geografica de Peru: departamentos -> provincias -> distritos.

Cada nivel tiene un id unico, un nombre normalizado (sin tildes, mayusculas)
y una referencia al padre. El frontend usa `nombre_normalizado` para el join
con archivos GeoJSON/TopoJSON externos.
"""
import unicodedata
import re


def normalizar(nombre: str) -> str:
    """Elimina tildes, pasa a mayusculas y quita espacios extra."""
    nfkd = unicodedata.normalize("NFKD", nombre)
    sin_tilde = "".join(c for c in nfkd if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", sin_tilde.strip().upper())


# --- Departamentos ---
DEPARTAMENTOS = [
    {"id": 1,  "nombre": "Amazonas",       "id_pais": 1},
    {"id": 2,  "nombre": "Ancash",          "id_pais": 1},
    {"id": 3,  "nombre": "Apurimac",        "id_pais": 1},
    {"id": 4,  "nombre": "Arequipa",         "id_pais": 1},
    {"id": 5,  "nombre": "Ayacucho",         "id_pais": 1},
    {"id": 6,  "nombre": "Cajamarca",        "id_pais": 1},
    {"id": 7,  "nombre": "Callao",           "id_pais": 1},
    {"id": 8,  "nombre": "Cusco",            "id_pais": 1},
    {"id": 9,  "nombre": "Huancavelica",     "id_pais": 1},
    {"id": 10, "nombre": "Huanuco",          "id_pais": 1},
    {"id": 11, "nombre": "Ica",              "id_pais": 1},
    {"id": 12, "nombre": "Junin",            "id_pais": 1},
    {"id": 13, "nombre": "La Libertad",      "id_pais": 1},
    {"id": 14, "nombre": "Lambayeque",       "id_pais": 1},
    {"id": 15, "nombre": "Lima",             "id_pais": 1},
    {"id": 16, "nombre": "Loreto",           "id_pais": 1},
    {"id": 17, "nombre": "Madre de Dios",    "id_pais": 1},
    {"id": 18, "nombre": "Moquegua",         "id_pais": 1},
    {"id": 19, "nombre": "Pasco",            "id_pais": 1},
    {"id": 20, "nombre": "Piura",            "id_pais": 1},
    {"id": 21, "nombre": "Puno",             "id_pais": 1},
    {"id": 22, "nombre": "San Martin",       "id_pais": 1},
    {"id": 23, "nombre": "Tacna",            "id_pais": 1},
    {"id": 24, "nombre": "Tumbes",           "id_pais": 1},
    {"id": 25, "nombre": "Ucayali",          "id_pais": 1},
]

# --- Provincias (capital de cada departamento + principales) ---
PROVINCIAS = [
    # Amazonas
    {"id": 101, "id_departamento": 1,  "nombre": "Chachapoyas"},
    {"id": 102, "id_departamento": 1,  "nombre": "Bagua"},
    # Ancash
    {"id": 201, "id_departamento": 2,  "nombre": "Huaraz"},
    {"id": 202, "id_departamento": 2,  "nombre": "Santa"},
    {"id": 203, "id_departamento": 2,  "nombre": "Chimbote"},
    # Apurimac
    {"id": 301, "id_departamento": 3,  "nombre": "Abancay"},
    {"id": 302, "id_departamento": 3,  "nombre": "Andahuaylas"},
    # Arequipa
    {"id": 401, "id_departamento": 4,  "nombre": "Arequipa"},
    {"id": 402, "id_departamento": 4,  "nombre": "Caylloma"},
    {"id": 403, "id_departamento": 4,  "nombre": "Camana"},
    # Ayacucho
    {"id": 501, "id_departamento": 5,  "nombre": "Ayacucho"},
    {"id": 502, "id_departamento": 5,  "nombre": "Huamanga"},
    {"id": 503, "id_departamento": 5,  "nombre": "Cangallo"},
    # Cajamarca
    {"id": 601, "id_departamento": 6,  "nombre": "Cajamarca"},
    {"id": 602, "id_departamento": 6,  "nombre": "Celendin"},
    {"id": 603, "id_departamento": 6,  "nombre": "Jaen"},
    # Callao
    {"id": 701, "id_departamento": 7,  "nombre": "Callao"},
    # Cusco
    {"id": 801, "id_departamento": 8,  "nombre": "Cusco"},
    {"id": 802, "id_departamento": 8,  "nombre": "Urubamba"},
    {"id": 803, "id_departamento": 8,  "nombre": "La Convencion"},
    # Huancavelica
    {"id": 901, "id_departamento": 9,  "nombre": "Huancavelica"},
    {"id": 902, "id_departamento": 9,  "nombre": "Castrovirreyna"},
    # Huanuco
    {"id": 1001, "id_departamento": 10, "nombre": "Huanuco"},
    {"id": 1002, "id_departamento": 10, "nombre": "Leoncio Prado"},
    # Ica
    {"id": 1101, "id_departamento": 11, "nombre": "Ica"},
    {"id": 1102, "id_departamento": 11, "nombre": "Chincha"},
    {"id": 1103, "id_departamento": 11, "nombre": "Pisco"},
    # Junin
    {"id": 1201, "id_departamento": 12, "nombre": "Junin"},
    {"id": 1202, "id_departamento": 12, "nombre": "Huancayo"},
    {"id": 1203, "id_departamento": 12, "nombre": "Tarma"},
    # La Libertad
    {"id": 1301, "id_departamento": 13, "nombre": "Trujillo"},
    {"id": 1302, "id_departamento": 13, "nombre": "Chiclayo"},
    {"id": 1303, "id_departamento": 13, "nombre": "Otuzco"},
    # Lambayeque
    {"id": 1401, "id_departamento": 14, "nombre": "Chiclayo"},
    {"id": 1402, "id_departamento": 14, "nombre": "Ferrenafe"},
    {"id": 1403, "id_departamento": 14, "nombre": "Lambayeque"},
    # Lima
    {"id": 1501, "id_departamento": 15, "nombre": "Lima"},
    {"id": 1502, "id_departamento": 15, "nombre": "Huarochiri"},
    {"id": 1503, "id_departamento": 15, "nombre": "Caete"},
    {"id": 1504, "id_departamento": 15, "nombre": "Canta"},
    # Loreto
    {"id": 1601, "id_departamento": 16, "nombre": "Maynas"},
    {"id": 1602, "id_departamento": 16, "nombre": "Loreto"},
    # Madre de Dios
    {"id": 1701, "id_departamento": 17, "nombre": "Tambopata"},
    {"id": 1702, "id_departamento": 17, "nombre": "Manu"},
    # Moquegua
    {"id": 1801, "id_departamento": 18, "nombre": "Mariscal Nieto"},
    {"id": 1802, "id_departamento": 18, "nombre": "Ilo"},
    # Pasco
    {"id": 1901, "id_departamento": 19, "nombre": "Daniel Alcides Carrión"},
    {"id": 1902, "id_departamento": 19, "nombre": "Oxapampa"},
    # Piura
    {"id": 2001, "id_departamento": 20, "nombre": "Piura"},
    {"id": 2002, "id_departamento": 20, "nombre": "Sullana"},
    {"id": 2003, "id_departamento": 20, "nombre": "Talara"},
    # Puno
    {"id": 2101, "id_departamento": 21, "nombre": "Puno"},
    {"id": 2102, "id_departamento": 21, "nombre": "Azangaro"},
    {"id": 2103, "id_departamento": 21, "nombre": "Chucuito"},
    # San Martin
    {"id": 2201, "id_departamento": 22, "nombre": "Moyobamba"},
    {"id": 2202, "id_departamento": 22, "nombre": "Tarapoto"},
    {"id": 2203, "id_departamento": 22, "nombre": "Rioja"},
    # Tacna
    {"id": 2301, "id_departamento": 23, "nombre": "Tacna"},
    {"id": 2302, "id_departamento": 23, "nombre": "Jorge Basadre"},
    # Tumbes
    {"id": 2401, "id_departamento": 24, "nombre": "Tumbes"},
    {"id": 2402, "id_departamento": 24, "nombre": "Zarumilla"},
    # Ucayali
    {"id": 2501, "id_departamento": 25, "nombre": "Coronel Portillo"},
    {"id": 2502, "id_departamento": 25, "nombre": "Atalaya"},
]

# --- Distritos (capital de cada provincia + principales) ---
DISTRITOS = [
    # Lima
    {"id": 150101, "id_provincia": 1501, "nombre": "Lima"},
    {"id": 150102, "id_provincia": 1501, "nombre": "San Isidro"},
    {"id": 150103, "id_provincia": 1501, "nombre": "Miraflores"},
    {"id": 150104, "id_provincia": 1501, "nombre": "Surco"},
    {"id": 150105, "id_provincia": 1501, "nombre": "San Borja"},
    {"id": 150106, "id_provincia": 1501, "nombre": "La Molina"},
    {"id": 150107, "id_provincia": 1501, "nombre": "Jesus Maria"},
    {"id": 150108, "id_provincia": 1501, "nombre": "Lince"},
    {"id": 150109, "id_provincia": 1501, "nombre": "Pueblo Libre"},
    {"id": 150110, "id_provincia": 1501, "nombre": "San Miguel"},
    {"id": 150111, "id_provincia": 1501, "nombre": "Breña"},
    {"id": 150112, "id_provincia": 1501, "nombre": "Rimac"},
    {"id": 150113, "id_provincia": 1501, "nombre": "San Martin de Porres"},
    {"id": 150114, "id_provincia": 1501, "nombre": "Los Olivos"},
    {"id": 150115, "id_provincia": 1501, "nombre": "Comas"},
    {"id": 150116, "id_provincia": 1501, "nombre": "Carabayllo"},
    {"id": 150117, "id_provincia": 1501, "nombre": "San Juan de Lurigancho"},
    {"id": 150118, "id_provincia": 1501, "nombre": "Ate"},
    {"id": 150119, "id_provincia": 1501, "nombre": "Santa Anita"},
    # Callao
    {"id": 70101, "id_provincia": 701, "nombre": "Callao"},
    {"id": 70102, "id_provincia": 701, "nombre": "Bellavista"},
    {"id": 70103, "id_provincia": 701, "nombre": "Carmen de la Legua"},
    {"id": 70104, "id_provincia": 701, "nombre": "La Perla"},
    {"id": 70105, "id_provincia": 701, "nombre": "Ventanilla"},
    # Arequipa
    {"id": 40101, "id_provincia": 401, "nombre": "Arequipa"},
    {"id": 40102, "id_provincia": 401, "nombre": "Cayma"},
    {"id": 40103, "id_provincia": 401, "nombre": "Cerro Colorado"},
    {"id": 40104, "id_provincia": 401, "nombre": "Socabaya"},
    {"id": 40201, "id_provincia": 402, "nombre": "Chivay"},
    {"id": 40202, "id_provincia": 402, "nombre": "Caylloma"},
    # Cusco
    {"id": 80101, "id_provincia": 801, "nombre": "Cusco"},
    {"id": 80102, "id_provincia": 801, "nombre": "San Sebastian"},
    {"id": 80103, "id_provincia": 801, "nombre": "Santiago"},
    {"id": 80201, "id_provincia": 802, "nombre": "Urubamba"},
    {"id": 80202, "id_provincia": 802, "nombre": "Ollantaytambo"},
    # Trujillo
    {"id": 130101, "id_provincia": 1301, "nombre": "Trujillo"},
    {"id": 130102, "id_provincia": 1301, "nombre": "Huanchaco"},
    {"id": 130103, "id_provincia": 1301, "nombre": "Laredo"},
    # Chiclayo
    {"id": 140101, "id_provincia": 1401, "nombre": "Chiclayo"},
    {"id": 140102, "id_provincia": 1401, "nombre": "Pimentel"},
    {"id": 140103, "id_provincia": 1401, "nombre": "Lambayeque"},
    # Piura
    {"id": 200101, "id_provincia": 2001, "nombre": "Piura"},
    {"id": 200102, "id_provincia": 2001, "nombre": "Castilla"},
    {"id": 200201, "id_provincia": 2002, "nombre": "Sullana"},
    {"id": 200301, "id_provincia": 2003, "nombre": "Talara"},
    # Ica
    {"id": 110101, "id_provincia": 1101, "nombre": "Ica"},
    {"id": 110102, "id_provincia": 1101, "nombre": "La Tinguiña"},
    {"id": 110201, "id_provincia": 1102, "nombre": "Chincha Alta"},
    {"id": 110301, "id_provincia": 1103, "nombre": "Pisco"},
    # Puno
    {"id": 210101, "id_provincia": 2101, "nombre": "Puno"},
    {"id": 210102, "id_provincia": 2101, "nombre": "San Carlos"},
    {"id": 210201, "id_provincia": 2102, "nombre": "Azangaro"},
    # Huancayo
    {"id": 120201, "id_provincia": 1202, "nombre": "Huancayo"},
    {"id": 120202, "id_provincia": 1202, "nombre": "Sapallanga"},
    # Huaraz
    {"id": 20101, "id_provincia": 201, "nombre": "Huaraz"},
    {"id": 20102, "id_provincia": 201, "nombre": "Independencia"},
    # Tarapoto
    {"id": 220201, "id_provincia": 2202, "nombre": "Tarapoto"},
    {"id": 220202, "id_provincia": 2202, "nombre": "Cacatachi"},
    # Tacna
    {"id": 230101, "id_provincia": 2301, "nombre": "Tacna"},
    {"id": 230102, "id_provincia": 2301, "nombre": "Calana"},
    # Tumbes
    {"id": 240101, "id_provincia": 2401, "nombre": "Tumbes"},
    {"id": 240102, "id_provincia": 2401, "nombre": "El Porvenir"},
    # Moyobamba
    {"id": 220101, "id_provincia": 2201, "nombre": "Moyobamba"},
    # Cajamarca
    {"id": 60101, "id_provincia": 601, "nombre": "Cajamarca"},
    {"id": 60102, "id_provincia": 601, "nombre": "Los Banos del Inca"},
    {"id": 60201, "id_provincia": 602, "nombre": "Celendin"},
    {"id": 60301, "id_provincia": 603, "nombre": "Jaen"},
    # Chachapoyas
    {"id": 10101, "id_provincia": 101, "nombre": "Chachapoyas"},
    # Abancay
    {"id": 30101, "id_provincia": 301, "nombre": "Abancay"},
    # Ayacucho
    {"id": 50101, "id_provincia": 501, "nombre": "Ayacucho"},
    # Huanuco
    {"id": 100101, "id_provincia": 1001, "nombre": "Huanuco"},
    # Huancavelica
    {"id": 90101, "id_provincia": 901, "nombre": "Huancavelica"},
    # Ilo
    {"id": 180201, "id_provincia": 1802, "nombre": "Ilo"},
    # Oxapampa
    {"id": 190201, "id_provincia": 1902, "nombre": "Oxapampa"},
    # Coronel Portillo
    {"id": 250101, "id_provincia": 2501, "nombre": "Calleri"},
    {"id": 250102, "id_provincia": 2501, "nombre": "Yarinacocha"},
    # Tambopata
    {"id": 170101, "id_provincia": 1701, "nombre": "Puerto Maldonado"},
    # Maynas
    {"id": 160101, "id_provincia": 1601, "nombre": "Iquitos"},
]


def _build_index():
    """Construye indices de busqueda para acceso rapido."""
    by_norm_depto = {}
    for d in DEPARTAMENTOS:
        by_norm_depto[normalizar(d["nombre"])] = d

    by_depto_provincias = {}
    for p in PROVINCIAS:
        by_depto_provincias.setdefault(p["id_departamento"], []).append(p)

    by_prov_distritos = {}
    for d in DISTRITOS:
        by_prov_distritos.setdefault(d["id_provincia"], []).append(d)

    return by_norm_depto, by_depto_provincias, by_prov_distritos


NORM_DEPTO, DEPTO_PROVINCIAS, PROV_DISTRITOS = _build_index()


def get_provincias(depto_id: int) -> list:
    return DEPTO_PROVINCIAS.get(depto_id, [])


def get_distritos(prov_id: int) -> list:
    return PROV_DISTRITOS.get(prov_id, [])


def resolve_departamento(nombre: str) -> dict | None:
    return NORM_DEPTO.get(normalizar(nombre))
