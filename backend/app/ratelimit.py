"""Per-visitor rate limits for the public demo.

Generating a defence, reading evidence files and the Analytics AI assistant all spend Gemini quota
(and Render Workflows compute, when it is on). Without a limit, one visitor could run them in a loop.
Each bucket allows `limit` requests per visitor (client IP) per rolling hour; 0 turns a bucket off.

The counts live in memory, which is right for this app's single web instance (they reset on restart).
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

WINDOW_SECONDS = 3600
LABELS = {
    "analysis": "AI analyses",
    "files": "evidence uploads",
    "assistant": "AI assistant questions",
}

_lock = threading.Lock()
_hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)


def client_ip(request: Request) -> str:
    """The visitor's IP. Render (like most hosts) puts the real client first in X-Forwarded-For."""
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def check(request: Request, bucket: str, limit: int) -> None:
    """Count one request in `bucket`; raise 429 if this visitor has used up the hour's allowance."""
    if limit <= 0:
        return
    now = time.monotonic()
    key = (bucket, client_ip(request))
    with _lock:
        hits = _hits[key]
        while hits and now - hits[0] >= WINDOW_SECONDS:
            hits.popleft()
        if len(hits) >= limit:
            minutes = int((WINDOW_SECONDS - (now - hits[0])) // 60) + 1
            raise HTTPException(
                429,
                f"Too many {LABELS.get(bucket, 'requests')} from your network in the last hour "
                f"(limit {limit}). Please try again in about {minutes} min.",
            )
        hits.append(now)
        if len(_hits) > 10_000:  # forget visitors with no recent activity
            for k in [k for k, v in _hits.items() if not v]:
                del _hits[k]


def reset() -> None:
    """Forget all counts (used by tests)."""
    with _lock:
        _hits.clear()
