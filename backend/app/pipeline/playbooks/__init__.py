import json
from pathlib import Path

_DIR = Path(__file__).parent
PLAYBOOKS = {}
for _f in _DIR.glob("*.json"):
    _pb = json.loads(_f.read_text())
    PLAYBOOKS[_pb["reason"]] = _pb


def get_playbook(reason: str) -> dict:
    return PLAYBOOKS.get(reason) or PLAYBOOKS["MERCHANDISE_OR_SERVICE_NOT_RECEIVED"]
