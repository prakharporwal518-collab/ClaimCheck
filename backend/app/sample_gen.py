"""Sample evidence, drawn on the fly so it always matches the dispute it is loaded into.

Every file uses that dispute's own buyer name, shipping address, order number, item,
amount and dates, and the merchant's own details from Settings, so the integrity check
sees a consistent set. Three scenarios:

  strong       delivered + signature, delivery photo, chat (seller replied, buyer said "got it")
  weak         delivered scan but "no proof of delivery captured"
  buyer_right  delivery exception, then returned to sender

All companies, people and tracking numbers produced here are fictional.
"""

from __future__ import annotations

import hashlib
import io
import re
from datetime import datetime, timedelta
from pathlib import Path

from fpdf import FPDF
from PIL import Image, ImageDraw, ImageFont

SCENARIOS = {
    "strong": "Delivered, with signature, delivery photo and chat",
    "weak": "Delivered, but no proof of delivery",
    "buyer_right": "Returned to sender (the buyer is right)",
}
CARRIER = "SwiftParcel Express"

_FONT_DIRS = ["/usr/share/fonts/truetype/dejavu", "/usr/share/fonts/dejavu", "/usr/share/fonts/TTF"]


def _font(size: int, bold: bool = False):
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    for d in _FONT_DIRS:
        p = Path(d) / name
        if p.exists():
            return ImageFont.truetype(str(p), size)
    return ImageFont.load_default(size=size)  # Pillow's bundled font, if DejaVu is missing


def _latin(text: str) -> str:
    """fpdf core fonts are Latin-1 only; never crash on other scripts."""
    for a, b in {"–": "-", "—": "-", "‘": "'", "’": "'", "“": '"', "”": '"'}.items():
        text = text.replace(a, b)
    return text.encode("latin-1", "replace").decode("latin-1")


def _when(dt: datetime) -> str:
    return f"{dt.day} {dt.strftime('%b %Y %H:%M')}"


# ---------------------------------------------------------------------------
# Drawing (also used by scripts/make_samples.py for the prepared story sets)
# ---------------------------------------------------------------------------
def tracking_pdf(number, order, ship_to, events, footer="") -> bytes:
    pdf = FPDF(format="A4")
    pdf.add_page()
    pdf.set_fill_color(234, 88, 12)
    pdf.rect(0, 0, 210, 22, "F")
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_xy(12, 6)
    pdf.cell(0, 10, f"{CARRIER} - Shipment Tracking")
    pdf.set_text_color(20, 20, 20)
    pdf.set_xy(12, 30)
    pdf.set_font("Helvetica", "", 11)
    for line in [f"Tracking number: {number}", f"Order reference: {order}", f"Ship to: {ship_to}",
                 "Service: International Priority", ""]:
        pdf.cell(0, 7, _latin(line), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Scan history", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 11)
    for when, what in events:
        pdf.cell(0, 7, _latin(f"{when}   {what}"), new_x="LMARGIN", new_y="NEXT")
    if footer:
        pdf.ln(4)
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 7, _latin(footer), new_x="LMARGIN", new_y="NEXT")
    pdf.set_creator("SwiftParcel tracking export")
    return bytes(pdf.output())


def invoice_pdf(number, date, buyer, email, phone, ship_to, item, amount, txn, merchant=None) -> bytes:
    m = merchant or {}
    business = m.get("business_name") or "Voltway Electronics"
    address = m.get("business_address") or "14 MG Road, Bengaluru 560001"
    contact = " | ".join(x for x in [m.get("support_email") or "support@voltway.example",
                                       m.get("website") or "voltway.example"] if x)
    pdf = FPDF(format="A4")
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 18)
    pdf.cell(0, 10, _latin(f"{business} - Tax Invoice"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    for line in [address, contact, ""]:
        pdf.cell(0, 6, _latin(line), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 11)
    bill_to = ", ".join(x for x in [buyer, email, phone] if x)
    for line in [
        f"Invoice number: {number}",
        f"Invoice date: {date}",
        f"Bill to: {bill_to}",
        f"Ship to: {ship_to}",
        "",
        f"Item: {item}    Qty 1    USD {amount}",
        f"Total paid: USD {amount}",
        f"Paid with PayPal, transaction {txn}",
    ]:
        pdf.cell(0, 7, _latin(line), new_x="LMARGIN", new_y="NEXT")
    return bytes(pdf.output())


def chat_png(title, lines) -> bytes:
    w, h = 1100, 140 + 96 * len(lines)
    img = Image.new("RGB", (w, h), (245, 247, 250))
    d = ImageDraw.Draw(img)
    ft, fb = _font(30, True), _font(26)
    d.rectangle([0, 0, w, 90], fill=(30, 41, 59))
    d.text((32, 26), title, fill=(255, 255, 255), font=ft)
    y = 120
    for who, text, mine in lines:
        msg = f"{who}: {text}"
        tw = d.textlength(msg, font=fb)
        x = w - tw - 60 if mine else 30
        fill = (219, 234, 254) if mine else (255, 255, 255)
        d.rounded_rectangle([x - 18, y - 14, x + tw + 18, y + 50], 18, fill=fill, outline=(203, 213, 225))
        d.text((x, y), msg, fill=(15, 23, 42), font=fb)
        y += 96
    out = io.BytesIO()
    img.save(out, "PNG")
    return out.getvalue()


def delivery_photo(house, stamp) -> bytes:
    w, h = 1200, 900
    img = Image.new("RGB", (w, h), (196, 181, 160))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 700, w, h], fill=(120, 113, 108))  # porch
    d.rectangle([420, 120, 780, 700], fill=(87, 50, 30))  # door
    d.ellipse([735, 400, 755, 420], fill=(234, 179, 8))
    d.rectangle([840, 200, 1000, 300], fill=(255, 255, 255))
    d.text((862, 212), house, fill=(15, 23, 42), font=_font(64, True))
    d.rectangle([470, 560, 700, 720], fill=(180, 130, 70))  # parcel
    d.rectangle([570, 560, 600, 720], fill=(160, 110, 55))
    d.rectangle([0, 820, w, h], fill=(0, 0, 0))
    d.text((24, 836), stamp, fill=(255, 255, 255), font=_font(34))
    out = io.BytesIO()
    img.save(out, "JPEG", quality=82)
    return out.getvalue()


# ---------------------------------------------------------------------------
# Per-dispute generation
# ---------------------------------------------------------------------------
def _digits(seed: str, n: int) -> str:
    return str(int(hashlib.sha256(seed.encode()).hexdigest(), 16))[:n]


def generate(dispute, merchant, scenario: str, now: datetime | None = None) -> list[tuple[str, bytes, str, str]]:
    """Returns [(filename, bytes, mime, tag)] matching this dispute."""
    if scenario not in SCENARIOS:
        raise ValueError(f"scenario must be one of {list(SCENARIOS)}")
    now = now or datetime.utcnow()
    m = {k: getattr(merchant, k, "") for k in ("business_name", "business_address", "support_email",
                                                "website", "support_name")}
    support = m["support_name"] or m["business_name"] or "Support"

    buyer = (dispute.buyer_name or "Customer").strip()
    first, last = (buyer.split()[0], buyer.split()[-1]) if buyer.split() else ("C", "Customer")
    addr = dispute.shipping_address or {}
    line1 = addr.get("address_line_1", "")
    city = ", ".join(x for x in [addr.get("admin_area_2", ""),
                                 " ".join(x for x in [addr.get("admin_area_1", ""), addr.get("postal_code", "")] if x)]
                     if x)
    full_address = ", ".join(x for x in [line1, city] if x) or "the buyer's shipping address"
    num = re.match(r"\s*(\d+)", line1)
    house = num.group(1)[:4] if num else "12"

    order = dispute.order_id or f"INV-{_digits(dispute.id, 5)}"
    tracking = "SPX" + _digits(dispute.id + scenario, 10)
    item = dispute.item_title or "the ordered item"
    amount = f"{dispute.amount:.2f}"
    txn = dispute.transaction_id or ("7H" + _digits(dispute.id, 8))

    # Dates: order well before the dispute; scans in between, never in the future.
    created = dispute.created_at or now
    tx_time = None
    try:
        tx = (dispute.raw or {}).get("disputed_transactions", [{}])[0].get("create_time")
        tx_time = datetime.fromisoformat(tx.replace("Z", "+00:00")).replace(tzinfo=None) if tx else None
    except (ValueError, AttributeError, IndexError):
        tx_time = None
    ordered = tx_time or (created - timedelta(days=18))
    latest = max(min(now, created) - timedelta(hours=2), ordered + timedelta(hours=3))
    step = (latest - ordered) / 5
    t = [ordered + step * i for i in range(1, 6)]  # five increasing scan times

    files: list[tuple[str, bytes, str, str]] = []
    invoice = invoice_pdf(order, ordered.strftime("%d %b %Y").lstrip("0"), buyer, dispute.buyer_email or "",
                          "", full_address, item, amount, txn, m)
    ship_to = f"{buyer}, {full_address}"

    if scenario == "buyer_right":
        events = [(_when(t[0]), "Picked up - origin hub"), (_when(t[1]), "In transit - arrived at destination gateway"),
                  (_when(t[2]), "Delivery exception - address not found"), (_when(t[4]), "Returned to sender")]
        files.append(("tracking.pdf", tracking_pdf(tracking, order, ship_to, events), "application/pdf", "Tracking"))
        files.append(("invoice.pdf", invoice, "application/pdf", "Invoice"))
        return files

    delivered = t[3]
    if scenario == "weak":
        events = [(_when(t[0]), "Picked up - origin hub"), (_when(t[1]), "In transit - arrived at destination gateway"),
                  (_when(delivered), "Delivered, left at front porch")]
        files.append(("tracking.pdf", tracking_pdf(tracking, order, ship_to, events,
                                                   footer="No proof of delivery captured for this shipment"),
                      "application/pdf", "Tracking"))
        files.append(("invoice.pdf", invoice, "application/pdf", "Invoice"))
        return files

    # strong
    events = [(_when(t[0]), "Picked up - origin hub"), (_when(t[1]), "In transit - arrived at destination gateway"),
              (_when(t[2]), "Out for delivery"), (_when(delivered), f"Delivered to {line1 or full_address}")]
    files.append(("tracking.pdf", tracking_pdf(tracking, order, ship_to, events,
                                               footer=f"Signed by: {first[0]}. {last} ({_when(delivered)})"),
                  "application/pdf", "Tracking"))
    day = lambda d: d.strftime("%d %b").lstrip("0")  # noqa: E731
    after = delivered + timedelta(hours=20)
    chat = chat_png(f"Order {order} - chat with {support}", [
        (buyer, f"Hi, when will my order arrive? ({day(t[1])})", False),
        (support, f"Out for delivery soon, tracking {tracking} ({day(t[2])})", True),
        (buyer, f"Got it, thanks! Works great. ({day(after)})", False),
        (support, f"Glad you like it! ({day(after)})", True),
    ])
    files.append(("chat.png", chat, "image/png", "Chat"))
    stamp = f"SwiftParcel POD  {delivered.strftime('%d %b %Y %H:%M')}  {tracking}"
    files.append(("delivery_photo.jpg", delivery_photo(house, stamp), "image/jpeg", "Delivery photo"))
    files.append(("invoice.pdf", invoice, "application/pdf", "Invoice"))
    return files
