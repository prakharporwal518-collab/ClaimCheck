from .conftest import wait_for_analysis


def test_health(client):
    h = client.get("/api/health").json()
    assert h["paypal_mode"] == "mock"
    assert h["paypal_disputes_path"] == "/v1/customer/disputes"


def test_inbox_lists_seeded_disputes(client):
    rows = client.get("/api/disputes").json()
    ids = {r["id"] for r in rows}
    assert {"PP-D-48213", "PP-D-48377", "PP-D-48402"} <= ids
    urgent = next(r for r in rows if r["id"] == "PP-D-48377")
    assert urgent["days_left"] <= 3


def test_upload_rejects_wrong_type_and_size(client):
    r = client.post("/api/disputes/PP-D-48455/evidence",
                    files=[("files", ("notes.txt", b"hello", "text/plain"))])
    assert r.status_code == 415
    big = b"%PDF" + b"0" * (5 * 1024 * 1024 + 10)
    r = client.post("/api/disputes/PP-D-48455/evidence",
                    files=[("files", ("big.pdf", big, "application/pdf"))])
    assert r.status_code == 413
    r = client.post("/api/disputes/PP-D-48455/evidence",
                    files=[("files", ("fake.pdf", b"not really a pdf", "application/pdf"))])
    assert r.status_code == 415


def test_submit_needs_merchant_approval(client):
    client.post("/api/disputes/PP-D-48213/evidence/sample")
    client.post("/api/disputes/PP-D-48213/analyse")
    wait_for_analysis(client, "PP-D-48213")
    assert client.post("/api/disputes/PP-D-48213/submit", json={"approved": False}).status_code == 400
    r = client.post("/api/disputes/PP-D-48213/submit", json={"approved": True, "text": "Edited by merchant"})
    assert r.status_code == 200
    d = client.get("/api/disputes/PP-D-48213").json()
    assert d["decision"] == "submitted"
    log = next(x for x in d["audit"] if x["action"] == "submitted_to_paypal")
    assert log["detail"]["edited"] is True  # audit log keeps AI draft vs final


def test_pdf_export(client):
    r = client.get("/api/disputes/PP-D-48213/report.pdf")
    assert r.status_code == 200 and r.content.startswith(b"%PDF")


def test_accept_claim(client):
    r = client.post("/api/disputes/PP-D-48402/accept-claim", json={})
    assert r.status_code == 200
    assert client.get("/api/disputes/PP-D-48402").json()["decision"] == "refunded"


def test_webhook_creates_draft(client):
    r = client.post("/api/demo/simulate-dispute").json()
    assert r["created"] and r["analysis"]["engine"] == "in-process"
    d = wait_for_analysis(client, r["dispute_id"])
    assert d["analysis"]["claims"]


def test_order_csv_import(client):
    csv = ("Order ID,Email,Carrier,Tracking Number\n"
           "INV-10547,sofia.rossi@mail.example,UPS,1Z999AA10123456784\n")
    r = client.post("/api/disputes/PP-D-48455/order-csv", files={"file": ("orders.csv", csv, "text/csv")})
    assert r.status_code == 200
    assert r.json()["matched"]["Order ID"] == "INV-10547"


def test_analytics_rows(client):
    rows = client.get("/api/analytics").json()["rows"]
    assert len(rows) >= 12
    assert {"money_at_risk", "strength", "outcome"} <= set(rows[0])


def test_settings_ignore_pasted_whitespace_and_quotes(monkeypatch):
    from app.config import Settings

    monkeypatch.setenv("PAYPAL_CLIENT_ID", "  AbC123\n")
    monkeypatch.setenv("PAYPAL_CLIENT_SECRET", '"EfG456" ')
    monkeypatch.setenv("PAYPAL_MODE", " Hybrid\n")
    s = Settings()
    assert s.paypal_client_id == "AbC123"
    assert s.paypal_client_secret == "EfG456"
    assert s.paypal_mode == "hybrid"


def test_starter_case_imports_the_sample_order_csv(client):
    client.post("/api/demo/reset")
    d = client.get("/api/disputes/PP-D-48455").json()
    assert d["sample_set"] == "starter" and d["evidence_count"] == 0
    r = client.post("/api/disputes/PP-D-48455/evidence/sample").json()
    assert len(r["added"]) == 1 and r["matched"]["Order ID"] == "INV-10547"
    assert client.post("/api/disputes/PP-D-48455/evidence/sample").json()["added"] == []  # not twice
    client.post("/api/demo/reset")


def test_closed_and_history_disputes_take_no_evidence(client):
    client.post("/api/demo/reset")
    for dispute_id in ["PP-D-47186"]:  # a resolved history dispute
        r = client.post(f"/api/disputes/{dispute_id}/evidence",
                        files=[("files", ("t.pdf", open("sample_evidence/strong/tracking.pdf", "rb").read(), "application/pdf"))])
        assert r.status_code == 409
        assert client.post(f"/api/disputes/{dispute_id}/evidence/sample", json={"scenario": "strong"}).status_code == 409
    d = client.get("/api/disputes/PP-D-47186").json()
    assert d["analysis"]["engine"] == "seeded history" and d["evidence"] == []
