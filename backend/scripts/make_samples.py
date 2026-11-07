"""Generate the three demo evidence sets (strong / weak / buyer-is-right).

All companies, people and tracking numbers here are fictional.
Run:  python scripts/make_samples.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app import sample_gen  # noqa: E402  (one copy of the drawing code)

OUT = Path(__file__).resolve().parent.parent / "sample_evidence"


def tracking_pdf(path, *args, **kw):
    Path(path).write_bytes(sample_gen.tracking_pdf(*args, **kw))


def invoice_pdf(path, *args, **kw):
    Path(path).write_bytes(sample_gen.invoice_pdf(*args, **kw))


def chat_png(path, *args):
    Path(path).write_bytes(sample_gen.chat_png(*args))


def delivery_photo(path, *args):
    Path(path).write_bytes(sample_gen.delivery_photo(*args))


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
