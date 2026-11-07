"""Hindi OCR, per-fact OCR confidence, and batching small files into one LLM call."""

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.pipeline import extract
from app.pipeline.masking import Masker

HERE = Path(__file__).parent
MERCHANT = SimpleNamespace(business_name="Voltway Electronics", business_address="14 MG Road, Bengaluru 560001",
                           support_email="support@voltway.example", website="voltway.example",
                           support_name="Voltway Support")
DISPUTE = SimpleNamespace(id="PP-D-1", buyer_name="Rohan Sharma", buyer_email="r@mail.example",
                          shipping_address={"address_line_1": "418 Maple Avenue", "postal_code": "08817"})


def _hindi_available():
    return extract.TESSERACT_AVAILABLE and "hin" in extract._langs()


@pytest.mark.skipif(not _hindi_available(), reason="Tesseract Hindi pack not installed")
def test_hindi_chat_is_read_and_understood():
    lines, conf, _ = extract.image_text((HERE / "hindi_chat.png").read_bytes())
    text = "\n".join(t for t, _ in lines)
    assert "मिल गया" in text and "धन्यवाद" in text
    masked = Masker.for_dispute(DISPUTE, MERCHANT).mask(text)
    facts = extract.rules_facts(masked, "Chat", ["Voltway Electronics", "Voltway Support"])
    kinds = {f["kind"] for f in facts}
    assert "buyer_confirmation" in kinds  # "parcel mil gaya, dhanyavaad" = got it, thanks
    assert "seller_message" in kinds


def test_hinglish_confirmation_and_negation():
    got = extract.rules_facts("[BUYER]: parcel mil gaya, shukriya", "Chat", [])
    assert got[0]["kind"] == "buyer_confirmation"
    not_got = extract.rules_facts("[BUYER]: parcel nahi mila", "Chat", [])
    assert not_got[0]["kind"] == "buyer_message"


def test_only_low_confidence_facts_need_confirmation(monkeypatch):
    """Per-line OCR confidence: a blurry line flags its own fact, not the whole file."""
    read = {
        "lines": [("[BUYER]: Got it, thanks! (4 Nov)", 41.0), ("Voltway Support: Glad you like them!", 94.0)],
        "conf": 67.5, "meta": {}, "extractor": "tesseract", "is_image": True, "use_vision": False,
    }
    read["masked"] = "\n".join(t for t, _ in read["lines"])
    ev = SimpleNamespace(id=7, filename="chat.png", tag="Chat", sent_to_vision=False)
    extract._finish(ev, read, [], "rules", MERCHANT)
    by_kind = {f["kind"]: f for f in ev.facts}
    assert by_kind["buyer_confirmation"]["confidence"] == 41.0
    assert by_kind["buyer_confirmation"]["needs_confirmation"] is True
    assert by_kind["seller_message"]["needs_confirmation"] is False


def test_llm_fact_confidence_matches_its_ocr_line():
    lines = [("Delivered to [ADDRESS] 3 Nov", 92.0), ("Signed by: [BUYER]", 38.0)]
    assert extract.match_confidence("Parcel signed by [BUYER]", lines, 70.0) == 38.0
    assert extract.match_confidence("Something unrelated", lines, 70.0) == 70.0


def test_small_documents_share_one_llm_call(monkeypatch):
    from app.config import settings
    from app.pipeline import llm

    steps = []

    def fake_generate_json(*, step, system, prompt, images=None, schema=None, dispute_id=""):
        steps.append(step)
        assert step == "extract_batch"
        assert '<evidence_text file="0"' in prompt and '<evidence_text file="1"' in prompt
        return {"facts": [
            {"file": 0, "kind": "carrier_delivered", "fact": "Delivered 3 Nov", "date": "3 Nov", "polarity": "supports_merchant"},
            {"file": 1, "kind": "order", "fact": "Invoice INV-10482", "date": "", "polarity": "neutral"},
        ]}, "fake-model"

    monkeypatch.setattr(settings, "gemini_api_key", "k")
    monkeypatch.setattr(llm, "generate_json", fake_generate_json)
    samples = Path(__file__).parent.parent / "sample_evidence" / "strong"
    evs = [SimpleNamespace(id=i + 1, filename=n, tag=t, mime="application/pdf", data=(samples / n).read_bytes(),
                           sent_to_vision=False)
           for i, (n, t) in enumerate([("tracking.pdf", "Tracking"), ("invoice.pdf", "Invoice")])]
    extract.extract_batch(evs, DISPUTE, MERCHANT, {"extraction_hints": []})
    assert steps == ["extract_batch"]  # two files, one call
    assert evs[0].facts[0]["kind"] == "carrier_delivered"            # the model's fact comes first
    assert "tracking_number" in [f["kind"] for f in evs[0].facts]    # rules backstop adds what it missed
    assert evs[1].facts[0]["kind"] == "order"
    assert "batched x2" in evs[0].extractor
    assert "Rohan" not in json.dumps([e.text_masked for e in evs])  # masked before the call
