"""Seeded disputes in the same JSON shape as GET /v1/customer/disputes/{id}.

Dates are relative to "now" so the response deadlines stay meaningful whenever
the demo runs. Fields that start with `x_` are ClaimCheck-only extras that the
real API does not return (sample evidence set, demo history)."""

from __future__ import annotations

import random
from datetime import datetime, timedelta

MERCHANT = {"merchant_id": "VOLTWAY7Q2", "name": "Voltway Electronics", "email": "support@voltway.example"}
INR = "MERCHANDISE_OR_SERVICE_NOT_RECEIVED"


def iso(dt: datetime) -> str:
    return dt.replace(microsecond=0).isoformat() + "Z"


def _dispute(
    dispute_id: str,
    *,
    buyer: str,
    email: str,
    amount: str,
    item: str,
    invoice: str,
    message: str,
    created_days_ago: float,
    due_in_days: float,
    status: str = "WAITING_FOR_SELLER_RESPONSE",
    stage: str = "INQUIRY",
    address: dict | None = None,
    outcome: str | None = None,
    sample_set: str = "",
    history: dict | None = None,
    reason: str = INR,
) -> dict:
    now = datetime.utcnow()
    created = now - timedelta(days=created_days_ago)
    detail = {
        "dispute_id": dispute_id,
        "create_time": iso(created),
        "update_time": iso(created + timedelta(hours=2)),
        "disputed_transactions": [
            {
                "buyer_transaction_id": "B" + dispute_id[-5:] + "9XK",
                "seller_transaction_id": "7H" + dispute_id[-5:] + "4L2",
                "create_time": iso(created - timedelta(days=18)),
                "transaction_status": "COMPLETED",
                "gross_amount": {"currency_code": "USD", "value": amount},
                "invoice_number": invoice,
                "buyer": {"name": buyer, "email": email},
                "seller": MERCHANT,
                "items": [{"item_name": item, "item_quantity": "1"}],
                "shipping_address": address or {},
            }
        ],
        "reason": reason,
        "status": status,
        "dispute_state": "REQUIRED_ACTION" if status == "WAITING_FOR_SELLER_RESPONSE" else "RESOLVED",
        "dispute_amount": {"currency_code": "USD", "value": amount},
        "dispute_life_cycle_stage": stage,
        "dispute_channel": "INTERNAL",
        "messages": [{"posted_by": "BUYER", "time_posted": iso(created), "content": message}],
        "seller_response_due_date": iso(now + timedelta(days=due_in_days)),
        "links": [],
    }
    if outcome:
        detail["dispute_outcome"] = {"outcome_code": outcome}
    if sample_set:
        detail["x_sample_set"] = sample_set
    if history:
        detail["x_claimcheck_history"] = history
    return detail


def build_fixtures() -> list[dict]:
    return [
        # --- The three demo cases (strong / weak / buyer-is-right) ---------------
        _dispute(
            "PP-D-48213",
            buyer="Rohan Sharma",
            email="rohan.sharma@mail.example",
            amount="249.00",
            item="Voltway Pulse ANC Wireless Headphones",
            invoice="INV-10482",
            message=(
                "I never received the headphones I ordered. The tracking says delivered but nothing "
                "came to my house. I messaged the seller twice and they ignored me. Please refund my money."
            ),
            created_days_ago=1,
            due_in_days=9,
            address={
                "address_line_1": "418 Maple Avenue",
                "admin_area_2": "Edison",
                "admin_area_1": "NJ",
                "postal_code": "08817",
                "country_code": "US",
            },
            sample_set="strong",
        ),
        _dispute(
            "PP-D-48377",
            buyer="Emily Carter",
            email="emily.carter@mail.example",
            amount="89.99",
            item="Voltway MagSafe Charger Bundle",
            invoice="INV-10511",
            message="My package never showed up. It's been three weeks and I still have nothing.",
            created_days_ago=8,
            due_in_days=2,
            address={
                "address_line_1": "77 Birch Lane",
                "admin_area_2": "Portland",
                "admin_area_1": "OR",
                "postal_code": "97205",
                "country_code": "US",
            },
            sample_set="weak",
        ),
        _dispute(
            "PP-D-48402",
            buyer="Liam O'Connor",
            email="liam.oconnor@mail.example",
            amount="129.50",
            item="Voltway Fit 2 Smartwatch",
            invoice="INV-10530",
            message=(
                "The watch never arrived. Tracking showed an exception for two weeks and now it says "
                "it went back to the sender. I want a refund."
            ),
            created_days_ago=4,
            due_in_days=6,
            address={
                "address_line_1": "1207 Cedar Court",
                "admin_area_2": "Austin",
                "admin_area_1": "TX",
                "postal_code": "78704",
                "country_code": "US",
            },
            sample_set="buyer_right",
        ),
        _dispute(
            "PP-D-48455",
            buyer="Sofia Rossi",
            email="sofia.rossi@mail.example",
            amount="59.00",
            item="Voltway USB-C Hub 7-in-1",
            invoice="INV-10547",
            message="Item not received yet. I placed the order a month ago and nothing has come.",
            created_days_ago=0.5,
            due_in_days=12,
            address={
                "address_line_1": "5 Via Roma Street",
                "admin_area_2": "Newark",
                "admin_area_1": "NJ",
                "postal_code": "07102",
                "country_code": "US",
            },
        ),
        # --- Resolved history (powers the analytics page) ----------------------
        *[
            _dispute(
                f"PP-D-47{n:03d}",
                buyer=b,
                email=f"{b.split()[0].lower()}@mail.example",
                amount=amt,
                item=item,
                invoice=f"INV-09{n:03d}",
                message="Item not received.",
                created_days_ago=ago,
                due_in_days=-ago + 10,
                status="RESOLVED",
                outcome="RESOLVED_SELLER_FAVOUR" if won else "RESOLVED_BUYER_FAVOUR",
                history={"score": score, "decision": dec, "response_minutes": mins},
            )
            for n, b, amt, item, ago, won, score, dec, mins in [
                (101, "Arjun Nair", "199.00", "Voltway Pulse ANC Wireless Headphones", 40, True, 8, "submitted", 6),
                (117, "Grace Kim", "45.00", "Voltway Braided Cable 3-pack", 36, True, 7, "submitted", 4),
                (132, "Mateo Garcia", "319.00", "Voltway Studio Speaker", 31, False, 3, "refunded", 3),
                (148, "Hannah Lee", "89.99", "Voltway MagSafe Charger Bundle", 27, True, 9, "submitted", 5),
                (163, "Omar Haddad", "129.50", "Voltway Fit 2 Smartwatch", 22, False, 5, "submitted", 9),
                (179, "Priya Iyer", "74.00", "Voltway Power Bank 20k", 18, True, 8, "submitted", 4),
                (186, "Lucas Martin", "249.00", "Voltway Pulse ANC Wireless Headphones", 14, False, 2, "refunded", 2),
                (194, "Chloe Dubois", "59.00", "Voltway USB-C Hub 7-in-1", 9, True, 7, "submitted", 7),
            ]
        ],
    ]


_SIM_BUYERS = [
    ("Noah Williams", "Voltway Pulse ANC Wireless Headphones", "249.00"),
    ("Ava Thompson", "Voltway Fit 2 Smartwatch", "129.50"),
    ("Ethan Brown", "Voltway Power Bank 20k", "74.00"),
]


def simulated_new_dispute() -> dict:
    """A fresh Item Not Received dispute, as if PayPal had just sent CUSTOMER.DISPUTE.CREATED."""
    buyer, item, amount = random.choice(_SIM_BUYERS)
    n = random.randint(48500, 49999)
    return _dispute(
        f"PP-D-{n}",
        buyer=buyer,
        email=f"{buyer.split()[0].lower()}.{buyer.split()[1].lower()}@mail.example",
        amount=amount,
        item=item,
        invoice=f"INV-1{n % 10000:04d}",
        message=(
            f"I paid for the {item.replace('Voltway ', '')} but it never arrived. "
            "The seller has not responded to me."
        ),
        created_days_ago=0,
        due_in_days=10,
        address={
            "address_line_1": "31 Elm Street",
            "admin_area_2": "Hoboken",
            "admin_area_1": "NJ",
            "postal_code": "07030",
            "country_code": "US",
        },
    )
