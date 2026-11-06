"""Transparent evidence-strength formula, computed in code (never guessed by the LLM).

Start at 4, then:
  +2 per claim contradicted by strong evidence (signature, delivery photo, carrier status, buyer confirmation)
  +1 per claim contradicted by weak evidence
  -2 per missing critical checklist item
  -3 per claim the buyer is right about
Clamp to 0..10. Labels: High 7-10, Medium 4-6, Low 0-3.
"""

from __future__ import annotations

BASE = 4
STRONG = 2
WEAK = 1
CRITICAL_GAP = -2
BUYER_RIGHT = -3


def label_for(score: int) -> str:
    return "High" if score >= 7 else "Medium" if score >= 4 else "Low"


def score(results: list[dict], gaps: list[dict]) -> dict:
    breakdown = [{"label": "Starting point", "points": BASE}]
    total = BASE
    strong = weak = buyer_right = 0
    for r in results:
        if r["status"] == "contradicted":
            pts = STRONG if r.get("strength") == "strong" else WEAK
            strong += pts == STRONG
            weak += pts == WEAK
            breakdown.append({
                "label": f"{r['claim_id']} contradicted by {r.get('strength', 'weak')} evidence ({', '.join(r['evidence'])})",
                "points": pts,
            })
            total += pts
        elif r["status"] == "supported":
            buyer_right += 1
            breakdown.append({"label": f"{r['claim_id']}: the buyer is right", "points": BUYER_RIGHT})
            total += BUYER_RIGHT
    critical = [g for g in gaps if g["missing"] and g["critical"]]
    for g in critical:
        breakdown.append({"label": f"Missing critical evidence: {g['label']}", "points": CRITICAL_GAP})
        total += CRITICAL_GAP
    raw_total = total
    total = max(0, min(10, total))
    if raw_total != total:
        breakdown.append({"label": f"Clamped to 0-10 (raw {raw_total})", "points": total - raw_total})
    label = label_for(total)

    parts = []
    n_contra = strong + weak
    if n_contra:
        kind = "strong" if strong and not weak else "weak" if weak and not strong else "strong and weak"
        parts.append(f"{n_contra} claim{'s' if n_contra != 1 else ''} contradicted by {kind} evidence")
    if buyer_right:
        parts.append(f"buyer is right on {buyer_right} claim{'s' if buyer_right != 1 else ''}")
    parts.append(f"{len(critical)} critical gap{'s' if len(critical) != 1 else ''}")
    line = f"{label} (Score: {total}/10) – " + ", ".join(parts)
    return {"score": total, "label": label, "line": line, "breakdown": breakdown,
            "buyer_right": buyer_right, "critical_gaps": len(critical)}


def recommend(result: dict) -> dict:
    if result["buyer_right"]:
        return {
            "action": "refund",
            "title": "Recommend refunding",
            "why": "The evidence supports the buyer on at least one claim. Fighting is likely to fail and "
                   "can hurt your seller reputation.",
        }
    if result["label"] == "Low":
        return {
            "action": "refund",
            "title": "Consider refunding or a partial refund",
            "why": "The evidence is too weak to counter the claim. Upload the missing items first, or refund.",
        }
    if result["label"] == "Medium":
        return {
            "action": "fight",
            "title": "Fight, but close the gaps first",
            "why": "You have a case, but missing evidence weakens it. Add the items in the checklist if you can.",
        }
    return {"action": "fight", "title": "Fight this dispute",
            "why": "Strong evidence contradicts the buyer's claims."}
