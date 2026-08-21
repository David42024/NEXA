"""Reporte PDF del ofrecimiento E2E (solo stdlib, sin dependencias externas).

Genera un PDF A4 con el flujo completo del ofrecimiento: datos del cliente,
oferta recomendada, etapas E2E recorridas, medios probatorios, rebates,
resultado y estadisticas relevantes.
"""
import zlib
from datetime import datetime

from app import models
from app.services.nbo_engine import OFFER_CATALOG

PAGE_W = 595.28
PAGE_H = 841.89
MARGIN = 46
CONTENT_W = PAGE_W - 2 * MARGIN
LINE_H = 13.5

FONT_REG = "F1"
FONT_BOLD = "F2"

_EVIDENCE_LABELS = {
    "call_audio": "Audio de llamada",
    "platform_register": "Registro en plataforma",
}
_STAGE_LABELS = {
    "classified": "Clasificado",
    "planned": "Canal y mensaje",
    "contacted": "Contactado",
    "objection": "Objeciones",
    "evidence": "Evidencia",
    "result": "Resultado",
}
_CONTACT_LABELS = {
    "answered": "Contestó",
    "read": "Leyó",
    "unanswered": "No respondió",
}


def _esc(s: str) -> str:
    return (
        str(s)
        .replace("\\", "\\\\")
        .replace("(", "\\(")
        .replace(")", "\\)")
    )


def _fmt_money(v) -> str:
    return f"S/ {v:.2f}" if v is not None else "—"


def _char_w(ch: str, size: float, bold: bool) -> float:
    f = 0.6 if bold else 0.5
    if ch == " ":
        return size * 0.3
    if ch in "WMm@":
        return size * 0.85
    if ch in "il.,;:!|'":
        return size * 0.25
    if ch.isupper():
        return size * 0.65
    return size * f


def _text_width(s: str, size: float, bold: bool) -> float:
    return sum(_char_w(c, size, bold) for c in s)


class _Page:
    def __init__(self):
        self.ops: list = []
        self.y = PAGE_H - MARGIN


class PDF:
    def __init__(self):
        self.pages: list = [_Page()]

    @property
    def cur(self) -> _Page:
        return self.pages[-1]

    def _ensure(self, h: float = LINE_H):
        if self.cur.y - h < MARGIN:
            self.pages.append(_Page())

    def rule(self, color=(0.88, 0.9, 0.94)):
        self._ensure(LINE_H)
        self.cur.y -= 6
        r, g, b = color
        self.cur.ops.append(f"{MARGIN:.2f} {self.cur.y:.2f} {CONTENT_W:.2f} 1.1 re {r} {g} {b} f")

    def band(self, color=(0.04, 0.14, 0.23)):
        h = 22
        self._ensure(h + 8)
        self.cur.y -= 8
        r, g, b = color
        self.cur.ops.append(f"{MARGIN:.2f} {self.cur.y - h:.2f} {CONTENT_W:.2f} {h:.2f} re {r} {g} {b} f")

    def text(self, s: str, x: float = MARGIN, size: float = 9.5, bold: bool = False,
             color=(0.1, 0.12, 0.16), max_w: float | None = None):
        max_w = max_w or (PAGE_W - 2 * MARGIN - (x - MARGIN))
        words = str(s).split(" ")
        line = ""
        first = True
        for w in words:
            trial = w if not line else f"{line} {w}"
            if _text_width(trial, size, bold) > max_w and line:
                self._draw_line(line, x, size, bold, color)
                line = w
            else:
                line = trial
        if line or first:
            self._draw_line(line, x, size, bold, color)

    def _draw_line(self, s: str, x: float, size: float, bold: bool, color):
        self._ensure(LINE_H)
        self.cur.y -= LINE_H
        font = FONT_BOLD if bold else FONT_REG
        r, g, b = color
        self.cur.ops.extend([
            "BT",
            f"/{font} {size:.1f} Tf",
            f"{r} {g} {b} rg",
            f"{x:.2f} {self.cur.y:.2f} Td",
            f"({_esc(s)}) Tj",
            "ET",
        ])

    def kv(self, label: str, value: str, x: float = MARGIN, value_x: float = MARGIN + 170):
        self.text(label, x=x, bold=True)
        self.text(value, x=value_x)

    def spacer(self, h: float = 8):
        self._ensure(h)
        self.cur.y -= h

    def render(self) -> bytes:
        streams = []
        for page in self.pages:
            data = " ".join(page.ops).encode("latin-1", errors="replace")
            streams.append(zlib.compress(data))

        n = len(streams)
        page_objs = list(range(3, 3 + n))
        obj_f1 = 3 + n
        obj_f2 = obj_f1 + 1
        stream_objs = [obj_f2 + 1 + i for i in range(n)]
        total_objs = stream_objs[-1] if stream_objs else obj_f2

        out = bytearray()
        offsets: dict[int, int] = {}

        def begin_obj(num: int):
            offsets[num] = len(out)
            out.extend(f"{num} 0 obj\n".encode("latin-1"))

        def end_obj():
            out.extend(b"endobj\n")

        out.extend(b"%PDF-1.4\n")

        begin_obj(1)
        out.extend(b"<< /Type /Catalog /Pages 2 0 R >>\n")
        end_obj()

        kids = " ".join(f"{p} 0 R" for p in page_objs)
        begin_obj(2)
        out.extend(f"<< /Type /Pages /Kids [{kids}] /Count {n} >>\n".encode("latin-1"))
        end_obj()

        for i, po in enumerate(page_objs):
            begin_obj(po)
            out.extend(
                (
                    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] "
                    f"/Resources << /Font << /F1 {obj_f1} 0 R /F2 {obj_f2} 0 R >> >> "
                    f"/Contents {stream_objs[i]} 0 R >>\n"
                ).encode("latin-1")
            )
            end_obj()

        begin_obj(obj_f1)
        out.extend(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\n")
        end_obj()
        begin_obj(obj_f2)
        out.extend(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\n")
        end_obj()

        for i, so in enumerate(stream_objs):
            begin_obj(so)
            out.extend(
                f"<< /Length {len(streams[i])} /Filter /FlateDecode >>\nstream\n".encode("latin-1")
            )
            out.extend(streams[i])
            out.extend(b"\nendstream\n")
            end_obj()

        xref_pos = len(out)
        out.extend(f"xref\n0 {total_objs + 1}\n".encode("latin-1"))
        out.extend(b"0000000000 65535 f \n")
        for num in range(1, total_objs + 1):
            out.extend(f"{offsets.get(num, 0):010d} 00000 n \n".encode("latin-1"))
        out.extend(
            f"trailer\n<< /Size {total_objs + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF".encode("latin-1")
        )
        return bytes(out)


def _evidence_text(evidence_type: str | None) -> str:
    if not evidence_type:
        return "Pendiente de registrar"
    parts = [e.strip() for e in evidence_type.split(",") if e.strip()]
    return ", ".join(_EVIDENCE_LABELS.get(p, p) for p in parts) or "—"


def build_offering_report(db, offering: models.Offering) -> bytes:
    client = db.query(models.Client).filter(models.Client.id == offering.client_id).first()
    offer = db.query(models.Offer).filter(models.Offer.id == offering.offer_id).first() if offering.offer_id else None
    profile = client.profile or {} if client else {}
    p = profile
    servicio = p.get("servicio") or {}
    consumo = p.get("consumo") or {}
    comp = p.get("comportamiento") or {}
    fact = p.get("facturacion") or {}

    cat = None
    if offer:
        cat = next((o for o in OFFER_CATALOG if o["code"] == offer.code), None)

    monto = fact.get("monto_facturado_prom") or fact.get("monto_promedio_6m")
    ahorro_pct = cat.get("ahorro_pct") if cat else None
    ahorro_mes = (monto * ahorro_pct) if (monto and ahorro_pct is not None) else None

    rec = (
        db.query(models.Recommendation)
        .filter(models.Recommendation.client_id == offering.client_id)
        .filter(models.Recommendation.offer_id == offering.offer_id)
        .order_by(models.Recommendation.created_at.desc())
        .first()
    ) if offering.offer_id else None

    prob = round(float(rec.probability) * 100) if rec and rec.probability is not None else None
    score = round(float(rec.score) * 100) if rec and rec.score is not None else None

    nombre = (client.name if client else "Cliente") or "Cliente"
    doc = p.get("documento") or (client.document_last4 if client else None) or "—"
    canal = comp.get("canal_mas_usado") or comp.get("canal_principal") or "—"
    franja = consumo.get("mejor_franja_horaria_contacto") or consumo.get("horario_pico") or "—"
    n_reclamos = comp.get("n_reclamos") or comp.get("reclamos_12m") or 0
    dias_mora = fact.get("dias_mora_prom") or 0
    dias_datos = consumo.get("dias_agotamiento_datos_promedio")
    datos_gb = consumo.get("datos_gb")

    rebates = 1 if offering.objection_status == "rebate" else 0
    stage_idx = list(_STAGE_LABELS).index(offering.stage) + 1 if offering.stage in _STAGE_LABELS else 0

    now = datetime.now().strftime("%d/%m/%Y %H:%M")
    created = offering.created_at.strftime("%d/%m/%Y %H:%M") if offering.created_at else "—"

    pdf = PDF()

    # Cabecera
    pdf.band()
    pdf.cur.y -= 2
    pdf.text("NEXA · Reporte de Ofrecimiento", size=15, bold=True, color=(1, 1, 1))
    pdf.cur.y -= 16
    pdf.text(f"Generado el {now}", size=9, color=(0.85, 0.9, 0.95))

    # Cliente
    pdf.spacer(14)
    pdf.text("1. Cliente", size=11, bold=True)
    pdf.rule()
    pdf.spacer(4)
    pdf.kv("Nombre", nombre)
    pdf.kv("Documento", str(doc))
    pdf.kv("Plan actual", servicio.get("plan") or "—")
    pdf.kv("Antigüedad", f"{servicio.get('antiguedad_meses') or '—'} meses")
    pdf.kv("Factura promedio", _fmt_money(monto))
    if dias_datos is None:
        consumo_txt = f"{datos_gb or '—'} GB"
    elif dias_datos >= 30:
        consumo_txt = f"{datos_gb or '—'} GB · cubre el ciclo (datos para {dias_datos} días)"
    else:
        consumo_txt = f"{datos_gb or '—'} GB · agota en {dias_datos} días (antes del fin de ciclo)"
    pdf.kv("Consumo de datos", consumo_txt)
    pdf.kv("Reclamos (12m)", str(n_reclamos))
    pdf.kv("Mora promedio", f"{dias_mora} días")
    pdf.kv("Canal preferido", str(canal))
    pdf.kv("Mejor horario", str(franja))

    # Oferta
    pdf.spacer(14)
    pdf.text("2. Oferta recomendada", size=11, bold=True)
    pdf.rule()
    pdf.spacer(4)
    pdf.kv("Oferta", offer.name if offer else "—")
    if cat:
        pdf.kv("Precio", _fmt_money(cat["precio"]) + " / mes")
    pdf.kv("Ahorro mensual", _fmt_money(ahorro_mes) + (f" ({round(ahorro_pct * 100)}%)" if ahorro_pct is not None else ""))
    pdf.kv("Ahorro anual", _fmt_money(ahorro_mes * 12) if ahorro_mes else "—")
    pdf.kv("Probabilidad de aceptación", f"{prob}%" if prob is not None else "—")
    pdf.kv("Score comercial", f"{score}%" if score is not None else "—")

    # Flujo E2E
    pdf.spacer(14)
    pdf.text("3. Flujo E2E (etapas recorridas)", size=11, bold=True)
    pdf.rule()
    pdf.spacer(4)
    pdf.kv("Canal de contacto", offering.channel or "—")
    pdf.kv("Estado de contacto", _CONTACT_LABELS.get(offering.contact_status or "", offering.contact_status or "—"))
    pdf.kv("Etapa alcanzada", f"{_STAGE_LABELS.get(offering.stage, offering.stage)} ({stage_idx} de 6)")
    pdf.kv("Medios probatorios", _evidence_text(offering.evidence_type))
    pdf.kv("Rebates aplicados", str(rebates))
    if offering.speech_rebate:
        pdf.kv("Speech de rebate", f'"{offering.speech_rebate[:140]}"')
    if offering.evidence_ref:
        pdf.kv("Referencia de evidencia", offering.evidence_ref)

    # Resultado
    pdf.spacer(14)
    pdf.text("4. Resultado de la venta", size=11, bold=True)
    pdf.rule()
    pdf.spacer(4)
    if offering.result == "accepted":
        pdf.kv("Resultado", "ACEPTADA")
        pdf.kv("Monto adicional (ARPÚ)", "Ver detalle comercial")
    elif offering.result == "rejected":
        pdf.kv("Resultado", "RECHAZADA")
        pdf.kv("Motivo", offering.rejection_reason or "—")
    else:
        pdf.kv("Resultado", "En proceso")
    pdf.kv("Registrado el", created)

    # Pie
    pdf.spacer(14)
    pdf.rule()
    pdf.spacer(4)
    pdf.text("Documento generado automáticamente por NEXA · MVP demo.", size=8, color=(0.55, 0.58, 0.62))

    return pdf.render()