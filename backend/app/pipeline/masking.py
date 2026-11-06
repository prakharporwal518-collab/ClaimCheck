"""Layered buyer-PII masking, run on the backend before any LLM call.

Layer 1: exact match on the buyer's name, email and address from the PayPal dispute.
Layer 2: regex for emails, phone numbers, card/account numbers and PIN/ZIP codes.
(Layer 3, Presidio/spaCy NER, is a roadmap item.)

The merchant's own details (business name, address, support email, website)
are on an allowlist that every layer skips, because PayPal needs them as evidence.
The mapping stays on the server so the merchant sees real names in the report.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
CARD_RE = re.compile(r"(?<![\w-])(?:\d[ -]?){12,18}\d(?![\w-])")
PHONE_RE = re.compile(
    r"(?<![\w-])(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?|\d{2,4}[\s.-])\d{3,4}[\s.-]?\d{3,4}(?![\w-])"
)
PIN_RE = re.compile(r"(?<![\w#-])\d{6}(?![\w-])")  # Indian PIN code
ZIP_RE = re.compile(r"(?<=[A-Z]{2} )\d{5}(?:-\d{4})?(?!\w)")  # US ZIP after a state code


@dataclass
class Masker:
    buyer_name: str = ""
    buyer_email: str = ""
    buyer_address: list[str] = field(default_factory=list)
    allowlist: list[str] = field(default_factory=list)
    mapping: dict[str, str] = field(default_factory=dict)  # placeholder -> real value

    @classmethod
    def for_dispute(cls, dispute, merchant) -> "Masker":
        addr = dispute.shipping_address or {}
        lines = [
            addr.get("address_line_1", ""),
            addr.get("address_line_2", ""),
        ]
        allow = [
            merchant.business_name,
            merchant.business_address,
            merchant.support_email,
            merchant.website,
            merchant.support_name,
        ]
        m = cls(
            buyer_name=dispute.buyer_name or "",
            buyer_email=dispute.buyer_email or "",
            buyer_address=[x for x in lines if x],
            allowlist=[a for a in allow if a],
        )
        # Pre-seed fixed placeholders so every file of a dispute uses the same ones.
        if m.buyer_name:
            m.mapping["[BUYER]"] = m.buyer_name
        if m.buyer_email:
            m.mapping["[EMAIL]"] = m.buyer_email
        for i, line in enumerate(m.buyer_address):
            m.mapping["[ADDRESS]" if i == 0 else f"[ADDRESS_{i + 1}]"] = line
        if addr.get("postal_code"):
            m.mapping["[PIN]"] = addr["postal_code"]
        return m

    def merge(self, other: dict) -> None:
        """Add another file's mapping, skipping placeholders that mean something else here."""
        for ph, value in (other or {}).items():
            if ph not in self.mapping:
                self.mapping[ph] = value

    # ------------------------------------------------------------------
    def _placeholder(self, kind: str, value: str) -> str:
        for ph, real in self.mapping.items():
            if real == value and ph.startswith(f"[{kind}"):
                return ph
        n = sum(1 for ph in self.mapping if ph.startswith(f"[{kind}"))
        ph = f"[{kind}]" if n == 0 else f"[{kind}_{n + 1}]"
        self.mapping[ph] = value
        return ph

    def mask(self, text: str) -> str:
        if not text:
            return text
        # Protect the merchant allowlist first, restore it at the end.
        protected: dict[str, str] = {}
        for i, item in enumerate(sorted(self.allowlist, key=len, reverse=True)):
            token = f"\x00M{i}\x00"
            pattern = re.compile(re.escape(item), re.IGNORECASE)
            if pattern.search(text):
                text = pattern.sub(lambda m, t=token: protected.setdefault(t, m.group(0)) and t, text)

        # Layer 1: exact values from the PayPal dispute.
        if self.buyer_email:
            text = re.sub(re.escape(self.buyer_email), self._placeholder("EMAIL", self.buyer_email), text, flags=re.I)
        for line in self.buyer_address:
            text = re.sub(re.escape(line), self._placeholder("ADDRESS", line), text, flags=re.I)
        if self.buyer_name:
            full = self.buyer_name.strip()
            text = re.sub(re.escape(full), self._placeholder("BUYER", full), text, flags=re.I)
            parts = [p for p in re.split(r"\s+", full) if len(p) >= 3]
            if len(parts) >= 2:
                first, last = parts[0], parts[-1]
                # "R. Sharma" style signatures and lone first/last names.
                initial = re.compile(rf"\b{re.escape(first[0])}\.\s?{re.escape(last)}\b", re.I)
                text = initial.sub(self._placeholder("BUYER", full), text)
            for p in parts:
                text = re.sub(rf"\b{re.escape(p)}\b", self._placeholder("BUYER", full), text, flags=re.I)

        # Layer 2: regex.
        text = EMAIL_RE.sub(lambda m: self._placeholder("EMAIL", m.group(0)), text)
        text = CARD_RE.sub(lambda m: self._card(m.group(0)), text)
        text = PHONE_RE.sub(lambda m: self._placeholder("PHONE", m.group(0)), text)
        text = PIN_RE.sub(lambda m: self._placeholder("PIN", m.group(0)), text)
        text = ZIP_RE.sub(lambda m: self._placeholder("PIN", m.group(0)), text)

        for token, original in protected.items():
            text = text.replace(token, original)
        return text

    def _card(self, value: str) -> str:
        digits = re.sub(r"\D", "", value)
        # Only mask numbers that pass the Luhn check; long tracking numbers stay.
        if 13 <= len(digits) <= 19 and _luhn(digits):
            return self._placeholder("CARD", value)
        return value

    def unmask(self, text: str) -> str:
        if not text:
            return text
        for ph in sorted(self.mapping, key=len, reverse=True):
            text = text.replace(ph, self.mapping[ph])
        return text

    def known_pii(self) -> list[str]:
        values = [self.buyer_name, self.buyer_email, *self.buyer_address]
        return [v for v in values if v]


def _luhn(digits: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(digits)):
        d = int(ch)
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0
