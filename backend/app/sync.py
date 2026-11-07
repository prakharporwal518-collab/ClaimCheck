"""Sync disputes from PayPal (Sandbox or the seeded mock) into the database."""

from __future__ import annotations

from .db import Analysis, Dispute, audit
from .paypal.client import PayPalClient, normalise_dispute
from .pipeline import scoring


def upsert_dispute(s, client: PayPalClient, detail: dict) -> tuple[Dispute, bool]:
    fields = normalise_dispute(detail)
    d = s.get(Dispute, fields["id"])
    created = d is None
    if created:
        d = Dispute(id=fields["id"], source=client.mode)
        s.add(d)
    for k, v in fields.items():
        if k == "id" or v is None:
            continue
        if k == "outcome" and not v:
            continue
        setattr(d, k, v)
    d.raw = detail
    d.sample_set = detail.get("x_sample_set", d.sample_set or "")
    if d.status == "RESOLVED" and d.outcome:
        if d.decision in (None, "open"):
            d.decision = (detail.get("x_claimcheck_history") or {}).get("decision", "submitted")
    hist = detail.get("x_claimcheck_history")
    if created and hist:
        # Seeded demo history for the analytics page (clearly labelled).
        sc = hist["score"]
        label = scoring.label_for(sc)
        d.response_minutes = hist.get("response_minutes")
        d.analysis_state = "done"
        s.add(Analysis(
            dispute_id=d.id, strength_score=sc, strength_label=label,
            strength_line=f"{label} (Score: {sc}/10) – seeded history",
            engine="seeded history", recommendation={"action": "fight" if sc >= 4 else "refund"},
        ))
    if created:
        audit(s, d.id, "synced", source=client.mode)
    return d, created


def sync_sources(s, sources: list[str]) -> dict:
    """Sync every enabled source; one failing source does not stop the others."""
    from .paypal.client import get_client

    results = {}
    for src in sources:
        try:
            results[src] = sync_all(s, get_client(src))
        except Exception as e:
            s.rollback()
            results[src] = {"error": str(e)[:300], "mode": src}
    return results


def sync_all(s, client: PayPalClient) -> dict:
    items = client.list_disputes()
    new = 0
    for item in items:
        existing = s.get(Dispute, item["dispute_id"])
        if existing and existing.status == item.get("status") and existing.raw:
            continue
        detail = client.get_dispute(item["dispute_id"])
        _, created = upsert_dispute(s, client, detail)
        new += created
    s.commit()
    return {"listed": len(items), "new": new, "mode": client.mode}
