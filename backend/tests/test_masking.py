from types import SimpleNamespace

from app.pipeline.masking import Masker

DISPUTE = SimpleNamespace(
    buyer_name="Rohan Sharma",
    buyer_email="rohan.sharma@mail.example",
    shipping_address={"address_line_1": "418 Maple Avenue", "postal_code": "08817"},
)
MERCHANT = SimpleNamespace(
    business_name="Voltway Electronics",
    business_address="14 MG Road, Bengaluru 560001",
    support_email="support@voltway.example",
    website="voltway.example",
    support_name="Voltway Support",
)

TEXT = (
    "Bill to: Rohan Sharma, rohan.sharma@mail.example, +1 732 555 0142\n"
    "Ship to: 418 Maple Avenue, Edison, NJ 08817\n"
    "Signed by: R. Sharma\n"
    "Card 4111 1111 1111 1111. Other contact: other.person@mail.example, PIN 110001\n"
    "Tracking number: SPX4821390057\n"
    "Voltway Electronics, 14 MG Road, Bengaluru 560001, support@voltway.example, voltway.example"
)


def masker():
    return Masker.for_dispute(DISPUTE, MERCHANT)


def test_buyer_pii_is_masked():
    out = masker().mask(TEXT)
    for pii in ["Rohan", "Sharma", "rohan.sharma@mail.example", "732 555 0142", "418 Maple Avenue",
                "08817", "4111 1111 1111 1111", "other.person@mail.example", "110001"]:
        assert pii not in out, pii
    for ph in ["[BUYER]", "[EMAIL]", "[PHONE]", "[ADDRESS]", "[CARD]", "[PIN]"]:
        assert ph in out


def test_merchant_allowlist_is_never_masked():
    out = masker().mask(TEXT)
    for keep in ["Voltway Electronics", "14 MG Road, Bengaluru 560001", "support@voltway.example", "voltway.example"]:
        assert keep in out


def test_tracking_numbers_survive():
    assert "SPX4821390057" in masker().mask(TEXT)


def test_unmask_round_trip():
    m = masker()
    out = m.mask("Hello Rohan Sharma at rohan.sharma@mail.example")
    assert m.unmask(out) == "Hello Rohan Sharma at rohan.sharma@mail.example"
