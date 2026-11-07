"""Sample evidence must always match the dispute it is loaded into (no other buyer's files)."""

import pytest

from app.paypal import mock_data
from app.pipeline.extract import image_text, pdf_text

from .conftest import wait_for_analysis

ALL_BUYERS = {"Rohan Sharma", "Emily Carter", "Liam O'Connor", "Sofia Rossi"}
STORY_SETS = {"PP-D-48213": "strong", "PP-D-48377": "weak", "PP-D-48402": "buyer_right"}


def _text(path_or_bytes, name):
    data = path_or_bytes if isinstance(path_or_bytes, bytes) else open(path_or_bytes, "rb").read()
    lines = pdf_text(data)[0] if name.endswith(".pdf") else image_text(data)[0]
    return "\n".join(t for t, _ in lines)


@pytest.mark.parametrize("dispute_id,sample_set", STORY_SETS.items())
def test_prepared_story_files_belong_to_their_own_dispute(dispute_id, sample_set):
    detail = next(d for d in mock_data.build_fixtures() if d["dispute_id"] == dispute_id)
    buyer = detail["disputed_transactions"][0]["buyer"]["name"]
    invoice = detail["disputed_transactions"][0]["invoice_number"]
    import pathlib

    for f in sorted(pathlib.Path("sample_evidence", sample_set).iterdir()):
        text = _text(str(f), f.name)
        if f.name != "delivery_photo.jpg":
            assert buyer.split()[-1] in text or invoice in text, f"{f} does not mention {buyer}/{invoice}"
        for other in ALL_BUYERS - {buyer}:
            assert other not in text, f"{f} mentions another buyer: {other}"
        for other_inv in {"INV-10482", "INV-10511", "INV-10530", "INV-10547"} - {invoice}:
            assert other_inv not in text, f"{f} mentions another order: {other_inv}"


def _load(client, dispute_id, scenario):
    r = client.post(f"/api/disputes/{dispute_id}/evidence/sample", json={"scenario": scenario})
    assert r.status_code == 200, r.text
    client.post(f"/api/disputes/{dispute_id}/analyse")
    return wait_for_analysis(client, dispute_id, timeout=90)


@pytest.mark.parametrize("scenario,label,action", [
    ("strong", "High", "fight"), ("weak", "Medium", "fight"), ("buyer_right", "Low", "refund")])
def test_generated_evidence_matches_any_dispute(client, scenario, label, action):
    client.post("/api/demo/reset")
    new = client.post("/api/demo/simulate-dispute").json()["dispute_id"]   # a fresh "webhook" dispute
    wait_for_analysis(client, new)
    d = _load(client, new, scenario)
    a = d["analysis"]
    assert a["strength_label"] == label, a["strength_line"]
    assert a["recommendation"]["action"] == action
    # Integrity: every file agrees with the dispute (order, amount, address, tracking number)
    assert all(e["integrity"].get("status") == "OK" for e in d["evidence"]), [e["integrity"] for e in d["evidence"]]
    assert all(c["ok"] for c in a["integrity"]["checks"]), a["integrity"]["checks"]
    # Only this dispute's buyer and order appear in the files
    for e in d["evidence"]:
        raw = client.get(f"/api/evidence/{e['id']}/file").content
        text = _text(raw, e["filename"])
        for other in ALL_BUYERS:
            assert other not in text, f"{e['filename']} mentions {other}"
        if e["filename"].endswith(".pdf"):
            assert d["order_id"] in text
    client.post("/api/demo/reset")


def test_starter_case_can_load_a_scenario_too(client):
    client.post("/api/demo/reset")
    d = _load(client, "PP-D-48455", "strong")
    assert d["analysis"]["strength_label"] == "High"
    assert all(e["integrity"].get("status") == "OK" for e in d["evidence"])
    client.post("/api/demo/reset")


def test_no_mixing_when_evidence_exists(client):
    client.post("/api/demo/reset")
    client.post("/api/disputes/PP-D-48455/evidence/sample")                       # order CSV
    r = client.post("/api/disputes/PP-D-48455/evidence/sample", json={"scenario": "weak"})
    assert r.status_code == 409
    client.post("/api/demo/reset")


def test_generator_handles_missing_address_and_non_latin_names():
    from types import SimpleNamespace

    from app import sample_gen

    d = SimpleNamespace(id="PP-R-X1", buyer_name="जॉन डो", buyer_email="", shipping_address={}, order_id="",
                        item_title="", amount=10.0, transaction_id="", created_at=None, raw={})
    m = SimpleNamespace(business_name="Shop", business_address="", support_email="", website="", support_name="")
    for scenario in sample_gen.SCENARIOS:
        files = sample_gen.generate(d, m, scenario)
        assert files and all(data[:4] in (b"%PDF", b"\x89PNG") or data[:3] == b"\xff\xd8\xff"
                             for _, data, _, _ in files)
