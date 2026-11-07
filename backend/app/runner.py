"""Starts an analysis either as a Render Workflow task or in-process.

Render Workflows (beta) is used when USE_RENDER_WORKFLOWS=true and RENDER_API_KEY
is set. The in-process path stays as the fallback behind that setting. Either
way the pipeline writes its state to the database, and the frontend polls it.
"""

from __future__ import annotations

import logging
import threading

from .config import settings
from .db import Dispute, SessionLocal, audit
from .pipeline.analyse import run_analysis

log = logging.getLogger("claimcheck.runner")


def _in_process(dispute_id: str) -> None:
    try:
        run_analysis(dispute_id)
    except Exception:
        log.exception("analysis failed for %s", dispute_id)


async def start_analysis(dispute_id: str, trigger: str = "manual") -> dict:
    with SessionLocal() as s:
        d = s.get(Dispute, dispute_id)
        d.analysis_state = "queued"
        d.analysis_error = ""
        s.commit()

    engine = "in-process"
    run_id = ""
    if settings.workflows_enabled:
        try:
            from render import RenderAsync

            client = RenderAsync(token=settings.render_api_key)
            task_run = await client.workflows.start_task(
                f"{settings.render_workflow_slug}/analyse_dispute", [dispute_id]
            )
            engine, run_id = "render-workflows", task_run.id
        except Exception as e:  # fall back so the demo never breaks
            log.warning("Render Workflows start failed, running in-process: %s", e)

    if engine == "in-process":
        threading.Thread(target=_in_process, args=(dispute_id,), daemon=True).start()

    with SessionLocal() as s:
        d = s.get(Dispute, dispute_id)
        d.analysis_engine = engine
        d.analysis_run_id = run_id
        audit(s, dispute_id, "analysis_started", engine=engine, run_id=run_id, trigger=trigger)
        s.commit()
    return {"engine": engine, "run_id": run_id}
