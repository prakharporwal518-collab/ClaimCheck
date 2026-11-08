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

    def verify_webhook(self, headers: dict, raw_body: bytes) -> bool:
        return True


# PayPal's limits for provide-evidence files (Disputes API v1).
EVIDENCE_MIME = {"application/pdf", "image/png", "image/jpeg", "image/gif"}
MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_TOTAL_BYTES = 50 * 1024 * 1024
WEBHOOK_HEADERS = ("paypal-auth-algo", "paypal-cert-url", "paypal-transmission-id",
                   "paypal-transmission-sig", "paypal-transmission-time")


def check_evidence_files(files: list[tuple[str, bytes, str]]) -> None:
    """Refuse files PayPal would reject, before anything is sent."""
    for name, data, mime in files:
        if mime not in EVIDENCE_MIME:
            raise PayPalError(f"{name}: PayPal only accepts PDF, PNG, JPG or GIF evidence", 422)
        if len(data) > MAX_FILE_BYTES:
            raise PayPalError(f"{name}: PayPal accepts files up to 10 MB", 422)
    if sum(len(d) for _, d, _ in files) > MAX_TOTAL_BYTES:
        raise PayPalError("PayPal accepts up to 50 MB of evidence per submission", 422)


def _allows_action(dispute: dict, action: str) -> bool:
    """PayPal lists the actions a dispute allows as HATEOAS links (e.g. rel "provide_evidence").
    No links at all means we cannot tell, so we let PayPal decide."""
    links = dispute.get("links") or []
    if not links:
        return True
    return any(link.get("rel") == action.replace("-", "_") or str(link.get("href", "")).endswith("/" + action)
               for link in links)


def pick_accept_claim_type(dispute: dict) -> str:
    """Use a type PayPal says this dispute allows, preferring a plain refund."""
    allowed = ((dispute.get("allowed_response_options") or {}).get("accept_claim") or {}).get("accept_claim_types") or []
    if not allowed or "REFUND" in allowed:
        return "REFUND"
    return allowed[0]


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
        check_evidence_files(files)
        if not _allows_action(self.get_dispute(dispute_id), "provide-evidence"):
            raise PayPalError("PayPal does not accept evidence for this dispute right now", 409)
        # multipart/form-data: a JSON form field named "input" (no filename), then the files.
        multipart: list[tuple[str, tuple]] = [
            ("input", (None, json.dumps({"evidences": evidences}), "application/json"))
        ]
        for name, data, mime in files:
            multipart.append(("evidence-file", (name, data, mime)))
        return self._request("POST", f"{self.disputes}/{dispute_id}/provide-evidence", files=multipart)

    def accept_claim(self, dispute_id, note, reason="LOST_IN_MAIL"):
        dispute = self.get_dispute(dispute_id)
        if not _allows_action(dispute, "accept-claim"):
            raise PayPalError("PayPal does not allow accepting this claim right now", 409)
        payload = {"note": note[:2000], "accept_claim_reason": reason,
                   "accept_claim_type": pick_accept_claim_type(dispute)}
        return self._request(
            "POST",
            f"{self.disputes}/{dispute_id}/accept-claim",
            json=payload,
            headers={"Content-Type": "application/json"},
        )

    def verify_webhook(self, headers: dict, raw_body: bytes) -> bool:
        if not settings.paypal_webhook_id:
            raise PayPalError("PAYPAL_WEBHOOK_ID is not set, so PayPal webhooks cannot be verified")
        h = {k.lower(): v for k, v in headers.items()}
        if any(not h.get(name) for name in WEBHOOK_HEADERS):
            return False  # not signed by PayPal
        fields = {
            "auth_algo": h["paypal-auth-algo"],
            "cert_url": h["paypal-cert-url"],
            "transmission_id": h["paypal-transmission-id"],
            "transmission_sig": h["paypal-transmission-sig"],
            "transmission_time": h["paypal-transmission-time"],
            "webhook_id": settings.paypal_webhook_id,
        }
        # The signature covers the exact bytes PayPal sent, so embed the original body
        # instead of a re-serialised copy (key order or spacing could differ).
        body = json.dumps(fields)[:-1] + ', "webhook_event": ' + raw_body.decode("utf-8") + "}"
        resp = self._request(
            "POST",
            "/v1/notifications/verify-webhook-signature",
            content=body.encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        return resp.get("verification_status") == "SUCCESS"


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
                **({"x_sample_set": d["x_sample_set"]} if d.get("x_sample_set") else {}),  # demo-only extra
            }
            for d in self._store.values()
        ]

    def get_dispute(self, dispute_id: str) -> dict:
        if dispute_id not in self._store:
            raise PayPalError("RESOURCE_NOT_FOUND", 404)
        return self._store[dispute_id]

    def provide_evidence(self, dispute_id, evidences, files):
        check_evidence_files(files)
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


_clients: dict[str, PayPalClient] = {}


def enabled_sources() -> list[str]:
    """Which PayPal sources this deployment uses.

    PAYPAL_MODE=mock      -> seeded demo disputes only
    PAYPAL_MODE=sandbox   -> real PayPal Sandbox only
    PAYPAL_MODE=hybrid    -> both in one inbox (Sandbox only when credentials are set)
    """
    mode = settings.paypal_mode
    has_keys = bool(settings.paypal_client_id and settings.paypal_client_secret)
    if mode == "sandbox":
        return ["sandbox"]
    if mode == "hybrid":
        return ["mock", "sandbox"] if has_keys else ["mock"]
    return ["mock"]


def get_client(source: str | None = None) -> PayPalClient:
    """The client for one source ("mock" or "sandbox"); default: the main source."""
    source = source or enabled_sources()[0]
    if source not in enabled_sources():
        raise PayPalError(f"PayPal source '{source}' is not enabled on this server", 400)
    if source not in _clients:
        _clients[source] = SandboxClient() if source == "sandbox" else MockClient()
    return _clients[source]


def reset_mock_client() -> None:
    _clients.pop("mock", None)


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
