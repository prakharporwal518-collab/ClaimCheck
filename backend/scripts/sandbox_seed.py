"""Create real PayPal Sandbox orders (Orders v2) so Item Not Received disputes
can be opened on real transactions.

Usage:
    export PAYPAL_CLIENT_ID=...  PAYPAL_CLIENT_SECRET=...     # Sandbox REST app
    python scripts/sandbox_seed.py

For each demo case the script:
  1. POST /v2/checkout/orders            (intent CAPTURE, with shipping address)
  2. prints the approve link: log in as your Sandbox *personal* (buyer) account
  3. POST /v2/checkout/orders/{id}/capture once you press Enter
Then, as the buyer on sandbox.paypal.com, open an "Item not received" dispute
for each payment, set PAYPAL_MODE=sandbox on the backend, and press
"Sync from PayPal" in ClaimCheck.
"""

import os
import sys
import uuid

import httpx

BASE = os.getenv("PAYPAL_API_BASE", "https://api-m.sandbox.paypal.com")

CASES = [
    ("INV-10482", "Voltway Pulse ANC Wireless Headphones", "249.00",
     {"address_line_1": "418 Maple Avenue", "admin_area_2": "Edison", "admin_area_1": "NJ",
      "postal_code": "08817", "country_code": "US"}),
    ("INV-10511", "Voltway MagSafe Charger Bundle", "89.99",
     {"address_line_1": "77 Birch Lane", "admin_area_2": "Portland", "admin_area_1": "OR",
      "postal_code": "97205", "country_code": "US"}),
    ("INV-10530", "Voltway Fit 2 Smartwatch", "129.50",
     {"address_line_1": "1207 Cedar Court", "admin_area_2": "Austin", "admin_area_1": "TX",
      "postal_code": "78704", "country_code": "US"}),
]


def token(http: httpx.Client) -> str:
    r = http.post(
        f"{BASE}/v1/oauth2/token",
        auth=(os.environ["PAYPAL_CLIENT_ID"], os.environ["PAYPAL_CLIENT_SECRET"]),
        data={"grant_type": "client_credentials"},
    )
    if r.status_code == 401:
        sys.exit("PayPal rejected the Client ID / Secret. Copy them again from the Sandbox app (no spaces).")
    r.raise_for_status()
    return r.json()["access_token"]


def create_order(http, tok, invoice, item, amount, address) -> dict:
    body = {
        "intent": "CAPTURE",
        "purchase_units": [{
            "reference_id": invoice,
            "invoice_id": invoice,
            "description": item,
            "amount": {"currency_code": "USD", "value": amount,
                       "breakdown": {"item_total": {"currency_code": "USD", "value": amount}}},
            "items": [{"name": item, "quantity": "1", "category": "PHYSICAL_GOODS",
                       "unit_amount": {"currency_code": "USD", "value": amount}}],
            "shipping": {"type": "SHIPPING", "address": address},
        }],
        "payment_source": {"paypal": {"experience_context": {
            "shipping_preference": "SET_PROVIDED_ADDRESS", "user_action": "PAY_NOW",
            "return_url": "https://example.com/return", "cancel_url": "https://example.com/cancel"}}},
    }
    r = http.post(f"{BASE}/v2/checkout/orders", json=body,
                  headers={"Authorization": f"Bearer {tok}", "PayPal-Request-Id": f"claimcheck-{uuid.uuid4().hex}"})
    if r.status_code == 422 and "DUPLICATE_INVOICE_ID" in r.text:
        sys.exit(f"{invoice} was already used in an earlier run. Its order already exists, so open the dispute on it, "
                 "or set INVOICE_SUFFIX=-2 (any new text) and run again.")
    r.raise_for_status()
    return r.json()


def capture(http, tok, order_id) -> dict:
    r = http.post(f"{BASE}/v2/checkout/orders/{order_id}/capture",
                  headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    r.raise_for_status()
    return r.json()


def main() -> None:
    if not (os.getenv("PAYPAL_CLIENT_ID") and os.getenv("PAYPAL_CLIENT_SECRET")):
        sys.exit("Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET (Sandbox REST app) first.")
    with httpx.Client(timeout=30) as http:
        tok = token(http)
        suffix = os.getenv("INVOICE_SUFFIX", "")
        for invoice, item, amount, address in CASES:
            order = create_order(http, tok, invoice + suffix, item, amount, address)
            approve = next((link["href"] for link in order["links"] if link["rel"] in ("payer-action", "approve")), None)
            print(f"\n{invoice}  {item}  ${amount}\n  order {order['id']}\n  approve as Sandbox buyer: {approve}")
            input("  Press Enter after approving… ")
            cap = capture(http, tok, order["id"])
            cap_id = cap["purchase_units"][0]["payments"]["captures"][0]["id"]
            print(f"  captured: {cap['status']} (transaction {cap_id})")
    print("\nNow open an 'Item not received' dispute for each payment as the Sandbox buyer,"
          " then press 'Sync from PayPal' in ClaimCheck with PAYPAL_MODE=sandbox.")


if __name__ == "__main__":
    main()
