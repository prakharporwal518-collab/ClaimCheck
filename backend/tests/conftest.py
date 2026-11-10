import os
import sys
import tempfile
from pathlib import Path

# Isolated database for every test session; mock PayPal; no real Gemini key.
_tmp = tempfile.mkdtemp(prefix="claimcheck-test-")
os.environ["CLAIMCHECK_DATA_DIR"] = _tmp
os.environ["PAYPAL_MODE"] = "mock"
os.environ.pop("GEMINI_API_KEY", None)
os.environ.pop("USE_RENDER_WORKFLOWS", None)
os.environ.pop("SANDBOX_ACTIONS_KEY", None)
# The suite runs many analyses from one client; rate limits are tested on their own (test_protections.py).
for _limit in ("RATE_LIMIT_ANALYSES_PER_HOUR", "RATE_LIMIT_FILE_ACTIONS_PER_HOUR", "RATE_LIMIT_ASSISTANT_PER_HOUR"):
    os.environ[_limit] = "0"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import time  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(scope="session")
def client():
    from app.main import app

    with TestClient(app) as c:
        c.post("/api/demo/reset")  # start from a clean demo even on a reused database
        yield c


def wait_for_analysis(client, dispute_id, timeout=60):
    end = time.time() + timeout
    while time.time() < end:
        d = client.get(f"/api/disputes/{dispute_id}").json()
        if d["analysis_state"] in ("done", "error"):
            return d
        time.sleep(0.25)
    raise AssertionError("analysis timed out")
