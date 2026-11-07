"""PayPal Disputes API adapter.

One `PayPalClient` interface, two implementations:

* `SandboxClient` calls the real PayPal Sandbox REST API.
* `MockClient` serves seeded disputes in the *identical* JSON shape, so the
  parser and the rest of ClaimCheck cannot tell the difference.

Switch with the PAYPAL_MODE environment variable ("mock" or "sandbox").

Endpoints used (PayPal Disputes API v1):
    POST /v1/oauth2/token
    GET  /v1/customer/disputes
    GET  /v1/customer/disputes/{id}
    POST /v1/customer/disputes/{id}/provide-evidence   (multipart)
    POST /v1/customer/disputes/{id}/accept-claim
    POST /v1/notifications/verify-webhook-signature
"""

from __future__ import annotations

import json
import time
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any

import httpx

from ..config import settings
from . import mock_data


class PayPalError(RuntimeError):
    def __init__(self, message: str, status: int | None = None, body: Any = None):
        super().__init__(message)
        self.status = status
        self.body = body


class PayPalClient(ABC):
    mode: str = "abstract"

    @abstractmethod
    def list_disputes(self) -> list[dict]: ...

    @abstractmethod
    def get_dispute(self, dispute_id: str) -> dict: ...

    @abstractmethod
    def provide_evidence(
        self, dispute_id: str, evidences: list[dict], files: list[tuple[str, bytes, str]]
    ) -> dict: ...

    @abstractmethod
    def accept_claim(self, dispute_id: str, note: str, reason: str = "LOST_IN_MAIL") -> dict: ...

    def verify_webhook(self, headers: dict, event: dict) -> bool:
        return True


# --------------------------------------------------------------------------
# Real PayPal Sandbox
# --------------------------------------------------------------------------
class SandboxClient(PayPalClient):
    mode = "sandbox"

    def __init__(self) -> None:
        if not (settings.paypal_client_id and settings.paypal_client_secret):
            raise PayPalError("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required in sandbox mode")
        self.base = settings.paypal_api_base.rstrip("/")
        self.disputes = settings.paypal_disputes_path.rstrip("/")
        self._token: str | None = None
        self._token_expiry = 0.0
        self._http = httpx.Client(timeout=30)

    # OAuth 2.0 client-credentials token, cached until shortly before expiry.
    def _access_token(self) -> str:
        if self._token and time.time() < self._token_expiry - 60:
            return self._token
        try:
            r = self._http.post(
                f"{self.base}/v1/oauth2/token",
                auth=(settings.paypal_client_id, settings.paypal_client_secret),
                data={"grant_type": "client_credentials"},
                headers={"Accept": "application/json"},
            )
        except httpx.HTTPError as e:
            raise PayPalError(f"Could not reach PayPal ({e.__class__.__name__}): check your internet connection")
        if r.status_code != 200:
            raise PayPalError("PayPal OAuth failed: check PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET", r.status_code, r.text)
        body = r.json()
        self._token = body["access_token"]
        self._token_expiry = time.time() + int(body.get("expires_in", 3000))
        return self._token

    def _request(self, method: str, path: str, **kw) -> dict:
        headers = kw.pop("headers", {})
        headers["Authorization"] = f"Bearer {self._access_token()}"
        try:
            r = self._http.request(method, f"{self.base}{path}", headers=headers, **kw)
        except httpx.HTTPError as e:
            raise PayPalError(f"Could not reach PayPal ({e.__class__.__name__}): check your internet connection")
        if r.status_code >= 400:
            try:
                body = r.json()
            except ValueError:
                body = r.text
            raise PayPalError(f"PayPal {method} {path} failed", r.status_code, body)
        return r.json() if r.content else {}

    def list_disputes(self) -> list[dict]:
        items: list[dict] = []
        path = f"{self.disputes}?page_size=50"
        for _ in range(10):  # follow "next" links, bounded
            body = self._request("GET", path, headers={"Accept": "application/json"})
            items.extend(body.get("items", []))
            nxt = next((link["href"] for link in body.get("links", []) if link.get("rel") == "next"), None)
            if not nxt:
                break
            path = nxt.replace(self.base, "")
        return items

    def get_dispute(self, dispute_id: str) -> dict:
        return self._request("GET", f"{self.disputes}/{dispute_id}", headers={"Accept": "application/json"})

    def provide_evidence(self, dispute_id, evidences, files):
        # multipart/form-data: one JSON part named "input", then the evidence files.
        multipart: list[tuple[str, tuple]] = [
            ("input", ("input.json", json.dumps({"evidences": evidences}), "application/json"))
        ]
        for name, data, mime in files:
            multipart.append(("evidence_file", (name, data, mime)))
        return self._request("POST", f"{self.disputes}/{dispute_id}/provide-evidence", files=multipart)

    def accept_claim(self, dispute_id, note, reason="LOST_IN_MAIL"):
        payload = {"note": note[:2000], "accept_claim_reason": reason, "accept_claim_type": "REFUND"}
        return self._request(
            "POST",
            f"{self.disputes}/{dispute_id}/accept-claim",
            json=payload,
            headers={"Content-Type": "application/json"},
        )

    def verify_webhook(self, headers: dict, event: dict) -> bool:
        if not settings.paypal_webhook_id:
            return True  # verification not configured (local testing)
        h = {k.lower(): v for k, v in headers.items()}
        payload = {
            "auth_algo": h.get("paypal-auth-algo"),
            "cert_url": h.get("paypal-cert-url"),
            "transmission_id": h.get("paypal-transmission-id"),
            "transmission_sig": h.get("paypal-transmission-sig"),
            "transmission_time": h.get("paypal-transmission-time"),
            "webhook_id": settings.paypal_webhook_id,
            "webhook_event": event,
        }
        body = self._request(
            "POST",
            "/v1/notifications/verify-webhook-signature",
            json=payload,
            headers={"Content-Type": "application/json"},
        )
        return body.get("verification_status") == "SUCCESS"


# --------------------------------------------------------------------------
# Seeded mock (same JSON shape)
# --------------------------------------------------------------------------
class MockClient(PayPalClient):
    mode = "mock"

    def __init__(self) -> None:
        self._store: dict[str, dict] = {d["dispute_id"]: d for d in mock_data.build_fixtures()}

    def add(self, detail: dict) -> None:
        self._store[detail["dispute_id"]] = detail

    def list_disputes(self) -> list[dict]:
        return [
            {
                "dispute_id": d["dispute_id"],
                "create_time": d["create_time"],
                "update_time": d["update_time"],
                "reason": d["reason"],
                "status": d["status"],
                "dispute_state": d.get("dispute_state", "REQUIRED_ACTION"),
                "dispute_amount": d["dispute_amount"],
                "links": [],
            }
            for d in self._store.values()
        ]

    def get_dispute(self, dispute_id: str) -> dict:
        if dispute_id not in self._store:
            raise PayPalError("RESOURCE_NOT_FOUND", 404)
        return self._store[dispute_id]

    def provide_evidence(self, dispute_id, evidences, files):
        d = self.get_dispute(dispute_id)
        d["status"] = "UNDER_REVIEW"
        d["update_time"] = mock_data.iso(datetime.utcnow())
        return {
            "links": [
                {"href": f"/v1/customer/disputes/{dispute_id}", "rel": "self", "method": "GET"}
            ],
            "_mock": {"evidence_count": len(evidences), "file_count": len(files)},
        }

    def accept_claim(self, dispute_id, note, reason="LOST_IN_MAIL"):
        d = self.get_dispute(dispute_id)
        d["status"] = "RESOLVED"
        d["dispute_outcome"] = {"outcome_code": "RESOLVED_BUYER_FAVOUR"}
        d["update_time"] = mock_data.iso(datetime.utcnow())
        return {"links": [{"href": f"/v1/customer/disputes/{dispute_id}", "rel": "self"}]}


_client: PayPalClient | None = None


def get_client() -> PayPalClient:
    global _client
    if _client is None:
        _client = SandboxClient() if settings.paypal_mode == "sandbox" else MockClient()
    return _client


# --------------------------------------------------------------------------
# Parser: PayPal dispute JSON -> ClaimCheck fields (tested against fixtures)
# --------------------------------------------------------------------------
def _parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def normalise_dispute(detail: dict) -> dict:
    txs = detail.get("disputed_transactions") or [{}]
    tx = txs[0]
    buyer = tx.get("buyer") or {}
    amount = detail.get("dispute_amount") or tx.get("gross_amount") or {}
    messages = detail.get("messages") or []
    buyer_msgs = [
        (m.get("content") or "").strip().strip('"\u201c\u201d').strip()  # buyers often type their own quotes
        for m in messages if m.get("posted_by") == "BUYER"
    ]
    outcome_code = (detail.get("dispute_outcome") or {}).get("outcome_code", "")
    outcome = ""
    if "SELLER_FAVOUR" in outcome_code:
        outcome = "won"
    elif "BUYER_FAVOUR" in outcome_code:
        outcome = "lost"
    items = tx.get("items") or []
    return {
        "id": detail["dispute_id"],
        "reason": detail.get("reason", "UNKNOWN"),
        "status": detail.get("status", "OPEN"),
        "stage": detail.get("dispute_life_cycle_stage", "INQUIRY"),
        "amount": float(amount.get("value", 0) or 0),
        "currency": amount.get("currency_code", "USD"),
        "buyer_name": buyer.get("name", ""),
        "buyer_email": buyer.get("email", ""),
        "buyer_message": "\n".join(buyer_msgs) or detail.get("extensions", {}).get("buyer_note", ""),
        "messages": messages,
        "item_title": (items[0].get("item_name") if items else "") or "",
        "order_id": tx.get("invoice_number", ""),
        "transaction_id": tx.get("seller_transaction_id", ""),
        "deadline": _parse_time(detail.get("seller_response_due_date")),
        "created_at": _parse_time(detail.get("create_time")),
        "outcome": outcome,
        # Not part of the public dispute object; present in seeded data / order CSV import.
        "shipping_address": tx.get("shipping_address") or detail.get("x_shipping_address") or {},
    }
