"""Generate printable PDF triage reports for ER handoff."""

import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
)

from app.logging_config import get_logger

logger = get_logger(__name__)

# Priority colors for the report
_PRIORITY_COLORS = {
    "immediate": colors.HexColor("#ef4444"),
    "emergent": colors.HexColor("#f97316"),
    "urgent": colors.HexColor("#eab308"),
    "less_urgent": colors.HexColor("#22c55e"),
    "non_urgent": colors.HexColor("#3b82f6"),
    "unknown": colors.HexColor("#6e6e73"),
}


def generate_triage_pdf(patient_record) -> bytes:
    """Generate a PDF triage report and return it as bytes.

    Args:
        patient_record: A PatientRecord (from mysql_db or patient_db).

    Returns:
        PDF file content as bytes.
    """
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "CustomTitle", parent=styles["Title"], fontSize=20, spaceAfter=6
    )
    heading = ParagraphStyle(
        "CustomH2", parent=styles["Heading2"], fontSize=13, spaceBefore=12, spaceAfter=4,
        textColor=colors.HexColor("#f97316"),
    )
    body = ParagraphStyle("CustomBody", parent=styles["BodyText"], fontSize=10, leading=14)
    small = ParagraphStyle("Small", parent=styles["BodyText"], fontSize=8, textColor=colors.grey)

    elements = []
    triage = patient_record.triage

    # ── Header
    elements.append(Paragraph("VoxTriage — ER Handoff Report", title_style))
    elements.append(Spacer(1, 2 * mm))

    pcolor = _PRIORITY_COLORS.get(triage.priority.value if hasattr(triage.priority, 'value') else triage.priority, colors.grey)
    priority_label = (triage.priority.value if hasattr(triage.priority, 'value') else triage.priority).replace("_", " ").upper()

    meta_data = [
        ["Patient ID", patient_record.id],
        ["Session", patient_record.session_id],
        ["Date", patient_record.saved_at.strftime("%Y-%m-%d %H:%M UTC") if isinstance(patient_record.saved_at, datetime) else str(patient_record.saved_at)],
        ["Priority", priority_label],
    ]
    meta_table = Table(meta_data, colWidths=[30 * mm, 140 * mm])
    meta_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("TEXTCOLOR", (1, 3), (1, 3), pcolor),
        ("FONTNAME", (1, 3), (1, 3), "Helvetica-Bold"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    elements.append(meta_table)
    elements.append(Spacer(1, 3 * mm))
    elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.lightgrey))

    # ── Chief Complaint
    if triage.chief_complaint:
        elements.append(Paragraph("Chief Complaint", heading))
        elements.append(Paragraph(triage.chief_complaint, body))

    # ── Patient Info
    pi = triage.patient_info
    elements.append(Paragraph("Patient Information", heading))
    info_rows = []
    if pi.age:
        info_rows.append(["Age", str(pi.age)])
    if pi.gender:
        info_rows.append(["Gender", pi.gender])
    if pi.weight_kg:
        info_rows.append(["Weight", f"{pi.weight_kg} kg"])
    if pi.known_allergies:
        info_rows.append(["Allergies", ", ".join(pi.known_allergies)])
    if pi.known_conditions:
        info_rows.append(["Conditions", ", ".join(pi.known_conditions)])
    if pi.medications:
        info_rows.append(["Medications", ", ".join(pi.medications)])
    if not info_rows:
        info_rows.append(["—", "No patient information available"])
    pt_table = Table(info_rows, colWidths=[35 * mm, 135 * mm])
    pt_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    elements.append(pt_table)

    # ── Vital Signs
    vs = triage.vital_signs
    elements.append(Paragraph("Vital Signs", heading))
    vitals = [
        ("HR", vs.heart_rate, "bpm"),
        ("BP", f"{vs.blood_pressure_systolic}/{vs.blood_pressure_diastolic}" if vs.blood_pressure_systolic else None, "mmHg"),
        ("RR", vs.respiratory_rate, "/min"),
        ("SpO₂", vs.spo2, "%"),
        ("Temp", vs.temperature, "°F"),
        ("GCS", vs.gcs, "/15"),
    ]
    v_data = [["Vital", "Value"]]
    for label, val, unit in vitals:
        v_data.append([label, f"{val} {unit}" if val else "—"])
    vt = Table(v_data, colWidths=[30 * mm, 50 * mm])
    vt.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f0f0f0")),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
    ]))
    elements.append(vt)

    # ── Symptoms
    if triage.symptoms:
        elements.append(Paragraph("Symptoms", heading))
        for i, s in enumerate(triage.symptoms, 1):
            meta = " · ".join(filter(None, [s.severity, s.location, s.onset]))
            text = f"<b>{i}.</b> {s.description}"
            if meta:
                text += f"  <i>({meta})</i>"
            elements.append(Paragraph(text, body))

    # ── Interventions
    if triage.interventions:
        elements.append(Paragraph("Interventions", heading))
        for iv in triage.interventions:
            elements.append(Paragraph(f"• {iv.action} — <i>{iv.status}</i>", body))

    # ── Mechanism of Injury
    if triage.mechanism_of_injury:
        elements.append(Paragraph("Mechanism of Injury", heading))
        elements.append(Paragraph(triage.mechanism_of_injury, body))

    # ── AI Summary
    if triage.ai_summary:
        elements.append(Paragraph("AI Clinical Summary", heading))
        elements.append(Paragraph(triage.ai_summary, body))

    # ── Confidence
    if triage.confidence_score is not None:
        elements.append(Spacer(1, 4 * mm))
        elements.append(
            Paragraph(f"AI Confidence: {round(triage.confidence_score * 100)}%", small)
        )

    # ── Transcript
    if patient_record.transcript:
        elements.append(Spacer(1, 4 * mm))
        elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.lightgrey))
        elements.append(Paragraph("Full Transcript", heading))
        # Truncate very long transcripts
        t = patient_record.transcript[:3000]
        if len(patient_record.transcript) > 3000:
            t += "… [truncated]"
        elements.append(Paragraph(t, ParagraphStyle(
            "Transcript", parent=body, fontSize=8, leading=11,
            textColor=colors.HexColor("#555555"),
        )))

    # ── Footer
    elements.append(Spacer(1, 8 * mm))
    elements.append(HRFlowable(width="100%", thickness=0.25, color=colors.lightgrey))
    elements.append(Paragraph(
        f"Generated by VoxTriage AI Paramedic Copilot — {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
        small,
    ))

    doc.build(elements)
    return buf.getvalue()
