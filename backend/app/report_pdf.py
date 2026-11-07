"""Export the defence report as a PDF (fpdf2, pure Python)."""

from __future__ import annotations

from fpdf import FPDF


def _latin(text: str) -> str:
    repl = {"–": "-", "—": "-", "‘": "'", "’": "'", "“": '"', "”": '"', "→": "->", "•": "-", "…": "...", "₹": "Rs."}
    for a, b in repl.items():
        text = text.replace(a, b)
    return text.encode("latin-1", "replace").decode("latin-1")


def build_pdf(dispute, analysis, merchant) -> bytes:
    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(True, margin=15)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 10, "ClaimCheck defence report", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(71, 85, 105)
    meta = (
        f"Dispute {dispute.id}  |  {dispute.currency} {dispute.amount:.2f}  |  Item Not Received  |  "
        f"Merchant: {merchant.business_name}"
    )
    pdf.multi_cell(0, 5, _latin(meta), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    colour = {"High": (22, 163, 74), "Medium": (217, 119, 6), "Low": (220, 38, 38)}.get(
        analysis.strength_label, (71, 85, 105)
    )
    pdf.set_fill_color(*colour)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 11)
    pdf.multi_cell(0, 8, _latin(" Evidence strength: " + analysis.strength_line), fill=True,
                   new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    pdf.set_text_color(15, 23, 42)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 7, "Claim vs evidence", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    for r in analysis.results:
        status = r["status"].upper()
        pdf.set_font("Helvetica", "B", 10)
        pdf.multi_cell(0, 5, _latin(f"[{status}] {r.get('claim_text', '')}"), new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 9)
        cites = ", ".join(r.get("evidence", [])) or "none"
        pdf.multi_cell(0, 5, _latin(f"   {r.get('why', '')}  (evidence: {cites})"), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(1)

    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 7, "Response sent to PayPal", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.multi_cell(0, 5, _latin(analysis.report_final or analysis.report_text), new_x="LMARGIN", new_y="NEXT")

    pdf.ln(3)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 7, "Score breakdown", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    for b in analysis.score_breakdown:
        pdf.multi_cell(0, 5, _latin(f"{b['points']:+d}  {b['label']}"), new_x="LMARGIN", new_y="NEXT")

    pdf.ln(4)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(100, 116, 139)
    pdf.multi_cell(
        0, 4,
        _latin("ClaimCheck checks consistency, not authenticity. Evidence strength is a heuristic, not a promise: "
               "PayPal decides the outcome. This is not legal advice."),
        new_x="LMARGIN", new_y="NEXT",
    )
    return bytes(pdf.output())
