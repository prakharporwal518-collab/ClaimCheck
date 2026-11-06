"""Evidence integrity check (MVP parts 1 and 3 of the PRD):

1. Cross-source consistency: tracking numbers, order IDs and amounts must agree
   across the invoice, the tracking PDF and the PayPal transaction.
3. Delivery address vs the PayPal shipping address.

ClaimCheck checks consistency, not authenticity: a perfectly forged document
still passes. Live carrier verification is a roadmap item.
"""

from __future__ import annotations

import re

from .extract import AMOUNT_RE, ORDER_RE, TRACKING_RE


def check(dispute, evidence_list) -> dict:
    per_file: dict[int, dict] = {}
    tracking: dict[str, set[int]] = {}
    orders: dict[str, set[int]] = {}
    summary_checks: list[dict] = []

    for ev in evidence_list:
        text = ev.text_masked or ""
        issues, oks = [], []
        for m in TRACKING_RE.finditer(text):
            tracking.setdefault(m.group(1).upper(), set()).add(ev.id)
        for m in ORDER_RE.finditer(text):
            oid = m.group(1).upper()
            orders.setdefault(oid, set()).add(ev.id)
            if dispute.order_id and oid.replace("-", "") != dispute.order_id.upper().replace("-", ""):
                issues.append(f"Order {oid} does not match PayPal invoice {dispute.order_id}")
            elif dispute.order_id:
                oks.append(f"Order {oid} matches the PayPal transaction")
        if ev.tag in ("Invoice", "Order"):
            amounts = {float(a.replace(",", ".")) for a in AMOUNT_RE.findall(text)}
            if amounts and dispute.amount not in amounts and round(dispute.amount, 2) not in amounts:
                if max(amounts) < dispute.amount - 0.01:
                    issues.append(f"Amounts on the invoice ({', '.join(f'${a:.2f}' for a in sorted(amounts))}) "
                                  f"don't include the disputed ${dispute.amount:.2f}")
            elif amounts:
                oks.append(f"Amount ${dispute.amount:.2f} matches the PayPal transaction")
        if ev.tag == "Tracking":
            if "[ADDRESS]" in text:
                oks.append("Delivery address matches the PayPal shipping address")
            elif re.search(r"deliver(?:ed|y)? to|ship to|address", text, re.I):
                issues.append("Delivery address on the tracking record differs from the PayPal shipping address")
        per_file[ev.id] = {"issues": issues, "ok": oks}

    if len(tracking) > 1:
        summary_checks.append({
            "ok": False,
            "text": "Different tracking numbers across files: " + ", ".join(sorted(tracking)),
        })
        for ids in tracking.values():
            for i in ids:
                per_file[i]["issues"].append("Tracking number differs from another file")
    elif len(tracking) == 1:
        (num, ids), = tracking.items()
        summary_checks.append({"ok": True, "text": f"Tracking number {num} is consistent across {len(ids)} file(s)"})
    if len(orders) > 1:
        summary_checks.append({"ok": False, "text": "Different order IDs across files: " + ", ".join(sorted(orders))})

    address_match = any(
        "Delivery address matches" in o for f in per_file.values() for o in f["ok"]
    )
    address_mismatch = any("differs from the PayPal" in i for f in per_file.values() for i in f["issues"])
    for f in per_file.values():
        f["status"] = "Check" if f["issues"] else "OK"
    return {
        "files": per_file,
        "checks": summary_checks,
        "address_match": address_match,
        "address_mismatch": address_mismatch,
        "tracking_numbers": sorted(tracking),
    }
