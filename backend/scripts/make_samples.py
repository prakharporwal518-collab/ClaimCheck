"""Generate the three demo evidence sets (strong / weak / buyer-is-right).

All companies, people and tracking numbers here are fictional.
Run:  python scripts/make_samples.py
"""

from pathlib import Path

from fpdf import FPDF
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "sample_evidence"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
MERCHANT_ADDR = "14 MG Road, Bengaluru 560001"


def tracking_pdf(path, number, order, ship_to, events, footer=""):
    pdf = FPDF(format="A4")
    pdf.add_page()
    pdf.set_fill_color(234, 88, 12)
    pdf.rect(0, 0, 210, 22, "F")
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_xy(12, 6)
    pdf.cell(0, 10, "SwiftParcel Express - Shipment Tracking")
    pdf.set_text_color(20, 20, 20)
    pdf.set_xy(12, 30)
    pdf.set_font("Helvetica", "", 11)
    for line in [f"Tracking number: {number}", f"Order reference: {order}", f"Ship to: {ship_to}",
                 "Service: International Priority", ""]:
        pdf.cell(0, 7, line, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Scan history", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 11)
    for when, what in events:
        pdf.cell(0, 7, f"{when}   {what}", new_x="LMARGIN", new_y="NEXT")
    if footer:
        pdf.ln(4)
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 7, footer, new_x="LMARGIN", new_y="NEXT")
    pdf.set_creator("SwiftParcel tracking export")
    pdf.output(str(path))


def invoice_pdf(path, number, date, buyer, email, phone, ship_to, item, amount, txn):
    pdf = FPDF(format="A4")
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 18)
    pdf.cell(0, 10, "Voltway Electronics - Tax Invoice", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    for line in [MERCHANT_ADDR, "support@voltway.example | voltway.example", ""]:
        pdf.cell(0, 6, line, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 11)
    for line in [
        f"Invoice number: {number}",
        f"Invoice date: {date}",
        f"Bill to: {buyer}, {email}, {phone}",
        f"Ship to: {ship_to}",
        "",
        f"Item: {item}    Qty 1    USD {amount}",
        f"Total paid: USD {amount}",
        f"Paid with PayPal, transaction {txn}",
    ]:
        pdf.cell(0, 7, line, new_x="LMARGIN", new_y="NEXT")
    pdf.output(str(path))


def chat_png(path, title, lines):
    w, h = 1100, 140 + 96 * len(lines)
    img = Image.new("RGB", (w, h), (245, 247, 250))
    d = ImageDraw.Draw(img)
    ft = ImageFont.truetype(FONT_B, 30)
    fb = ImageFont.truetype(FONT, 26)
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
    img.save(path)


def delivery_photo(path, house, stamp):
    w, h = 1200, 900
    img = Image.new("RGB", (w, h), (196, 181, 160))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 700, w, h], fill=(120, 113, 108))  # porch
    d.rectangle([420, 120, 780, 700], fill=(87, 50, 30))  # door
    d.ellipse([735, 400, 755, 420], fill=(234, 179, 8))
    d.rectangle([840, 200, 1000, 300], fill=(255, 255, 255))
    d.text((862, 212), house, fill=(15, 23, 42), font=ImageFont.truetype(FONT_B, 64))
    d.rectangle([470, 560, 700, 720], fill=(180, 130, 70))  # parcel
    d.rectangle([570, 560, 600, 720], fill=(160, 110, 55))
    d.rectangle([0, 820, w, h], fill=(0, 0, 0))
    d.text((24, 836), stamp, fill=(255, 255, 255), font=ImageFont.truetype(FONT, 34))
    img.save(path, quality=82)


def main():
    for name in ("strong", "weak", "buyer_right"):
        (OUT / name).mkdir(parents=True, exist_ok=True)

    # 1. Strong evidence: merchant should win.
    s = OUT / "strong"
    tracking_pdf(
        s / "tracking.pdf", "SPX4821390057", "INV-10482",
        "Rohan Sharma, 418 Maple Avenue, Edison, NJ 08817, US",
        [("28 Oct 2026 10:12", "Picked up - Bengaluru hub"),
         ("30 Oct 2026 22:40", "In transit - arrived at Newark NJ gateway"),
         ("3 Nov 2026 09:41", "Out for delivery - Edison NJ"),
         ("3 Nov 2026 14:07", "Delivered to 418 Maple Avenue, Edison NJ 08817")],
        footer="Signed by: R. Sharma (3 Nov 2026 14:07)",
    )
    chat_png(s / "chat.png", "Order INV-10482 - chat with Voltway Support", [
        ("Rohan Sharma", "Hi, when will my headphones arrive? (1 Nov)", False),
        ("Voltway Support", "Out for delivery on 3 Nov, tracking SPX4821390057 (2 Nov)", True),
        ("Rohan Sharma", "Got it, thanks! Sound is amazing. (4 Nov)", False),
        ("Voltway Support", "Glad you like them! (4 Nov)", True),
    ])
    delivery_photo(s / "delivery_photo.jpg", "418", "SwiftParcel POD  03 Nov 2026 14:07  SPX4821390057")
    invoice_pdf(s / "invoice.pdf", "INV-10482", "27 Oct 2026", "Rohan Sharma", "rohan.sharma@mail.example",
                "+1 732 555 0142", "418 Maple Avenue, Edison, NJ 08817", "Voltway Pulse ANC Wireless Headphones",
                "249.00", "7H482134L2")

    # 2. Weak evidence: delivered scan, but no signature, photo or chat.
    w = OUT / "weak"
    tracking_pdf(
        w / "tracking.pdf", "SPX4837710442", "INV-10511",
        "Emily Carter, 77 Birch Lane, Portland, OR 97205, US",
        [("14 Oct 2026 11:05", "Picked up - Bengaluru hub"),
         ("17 Oct 2026 06:30", "In transit - arrived at Los Angeles CA gateway"),
         ("21 Oct 2026 16:20", "Delivered, left at front porch")],
        footer="No proof of delivery captured for this shipment",
    )
    invoice_pdf(w / "invoice.pdf", "INV-10511", "12 Oct 2026", "Emily Carter", "emily.carter@mail.example",
                "+1 503 555 0188", "77 Birch Lane, Portland, OR 97205", "Voltway MagSafe Charger Bundle",
                "89.99", "7H483774L2")

    # 3. Buyer is right: parcel returned to sender.
    b = OUT / "buyer_right"
    tracking_pdf(
        b / "tracking.pdf", "SPX4840215566", "INV-10530",
        "Liam O'Connor, 1207 Cedar Court, Austin, TX 78704, US",
        [("16 Oct 2026 09:50", "Picked up - Bengaluru hub"),
         ("19 Oct 2026 03:15", "In transit - arrived at Dallas TX gateway"),
         ("22 Oct 2026 12:00", "Delivery exception - address not found"),
         ("2 Nov 2026 08:30", "Returned to sender")],
    )
    invoice_pdf(b / "invoice.pdf", "INV-10530", "14 Oct 2026", "Liam O'Connor", "liam.oconnor@mail.example",
                "+1 512 555 0110", "1207 Cedar Court, Austin, TX 78704", "Voltway Fit 2 Smartwatch",
                "129.50", "7H484024L2")

    # Order CSV export (Shopify/WooCommerce-style) for the order-import feature.
    (OUT / "orders_export.csv").write_text(
        "Order ID,Email,Customer,Item,Total,Carrier,Tracking Number,Fulfilled At\n"
        "INV-10482,rohan.sharma@mail.example,Rohan Sharma,Voltway Pulse ANC Wireless Headphones,249.00,SwiftParcel,SPX4821390057,2026-10-28\n"
        "INV-10511,emily.carter@mail.example,Emily Carter,Voltway MagSafe Charger Bundle,89.99,SwiftParcel,SPX4837710442,2026-10-14\n"
        "INV-10530,liam.oconnor@mail.example,Liam O'Connor,Voltway Fit 2 Smartwatch,129.50,SwiftParcel,SPX4840215566,2026-10-16\n"
        "INV-10547,sofia.rossi@mail.example,Sofia Rossi,Voltway USB-C Hub 7-in-1,59.00,SwiftParcel,SPX4854702218,2026-10-09\n"
    )
    print("Sample evidence written to", OUT)


if __name__ == "__main__":
    main()
