"""Regression: Gemini labelled cross-check results with the claim text, so every claim
showed 'Not assessed' (Emily Carter case scored Low 2/10 instead of Medium)."""

from app.pipeline import analyse, llm

CLAIMS = [
    {"id": "c1", "text": "My package never showed up.", "type": "not_received"},
    {"id": "c2", "text": "It's been three weeks and I still have nothing.", "type": "delayed"},
]
FACTS = [{"id": "e1", "kind": "carrier_delivered", "fact": "Delivered, left at front porch", "source": "tracking.pdf",
          "date": "21 Oct"}]


def _run(monkeypatch, results):
    monkeypatch.setattr(llm, "generate_json", lambda **kw: ({"results": results}, "fake"))
    out, _ = analyse.llm_crosscheck(CLAIMS, FACTS, "PP-D-1")
    return out


def r(claim, status="contradicted"):
    return {"claim": claim, "status": status, "evidence": ["e1"], "why": "Delivered."}


def test_matches_claim_text(monkeypatch):
    out = _run(monkeypatch, [r("My package never showed up."), r("It's been three weeks and I still have nothing.")])
    assert [x["status"] for x in out] == ["contradicted", "contradicted"]


def test_matches_upper_case_and_bare_numbers(monkeypatch):
    out = _run(monkeypatch, [r("C1"), r("2")])
    assert [x["status"] for x in out] == ["contradicted", "contradicted"]


def test_matches_partial_text(monkeypatch):
    out = _run(monkeypatch, [r("package never showed up"), r("three weeks and I still have nothing")])
    assert [x["evidence"] for x in out] == [["e1"], ["e1"]]


def test_skipped_claim_falls_back_to_rules(monkeypatch):
    out = _run(monkeypatch, [r("c1")])
    assert out[0]["why"] == "Delivered."
    assert out[1]["status"] == "contradicted" and "rules engine" in out[1]["why"]


def test_schema_forces_ids(monkeypatch):
    seen = {}

    def fake(**kw):
        seen.update(kw)
        return {"results": [r("c1"), r("c2")]}, "fake"

    monkeypatch.setattr(llm, "generate_json", fake)
    analyse.llm_crosscheck(CLAIMS, FACTS, "PP-D-1")
    item = seen["schema"]["properties"]["results"]["items"]["properties"]
    assert item["claim"]["enum"] == ["c1", "c2"]
    assert item["evidence"]["items"]["enum"] == ["e1"]


def test_prompts_forbid_nitpicking():
    # The honesty case once argued "11 days rather than two weeks"; the prompts now rule that out.
    assert "two weeks" in analyse.CROSS_SYSTEM and "NOT a contradiction" in analyse.CROSS_SYSTEM
    assert "minor details" in analyse.REPORT_SYSTEM
