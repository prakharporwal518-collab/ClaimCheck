"""ClaimCheck on Render Workflows.

Two tasks:
  extract_evidence(ids)          OCR / PDF text / vision fallback for a group of files
  analyse_dispute(dispute_id)    runs extract_evidence for every group of pending files in
                                 parallel (documents together, each image alone), then claims -> cross-check -> gaps ->
                                 score -> report

Retries with exponential backoff mean a Gemini free-tier rate limit retries the
task instead of failing the demo. The web service starts `analyse_dispute` with
the Render SDK (see app/runner.py) and the frontend polls the dispute.

Local run:  render workflows dev -- python workflows/main.py
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from render import Retry, TaskContext, Workflows  # noqa: E402

from app.db import init_db  # noqa: E402
from app.pipeline.analyse import claim_run, extract_group, pending_evidence_ids, plan_groups, run_analysis  # noqa: E402

app = Workflows(
    default_retry=Retry(max_retries=3, wait_duration_ms=2000, backoff_scaling=2.0),
    default_timeout=300,
)


@app.task(timeout_seconds=120)
def extract_evidence(ctx: TaskContext, evidence_ids: list[int]) -> dict:
    """Extract facts from a group of files (runs on its own compute).

    Documents share one group (and one LLM call); each image gets its own task."""
    return extract_group(evidence_ids)


@app.task(retry=Retry(max_retries=4, wait_duration_ms=3000, backoff_scaling=2.0))
async def analyse_dispute(ctx: TaskContext, dispute_id: str) -> dict:
    """Full analysis for one dispute; file extraction fans out in parallel."""
    init_db()
    # Only run if this Workflow still owns the analysis (the web service's safety net
    # may have taken it over if this run started too late).
    if not claim_run(dispute_id, "render-workflows"):
        return {"dispute_id": dispute_id, "skipped": "taken over by the in-process fallback or re-run"}
    groups = plan_groups(pending_evidence_ids(dispute_id))
    extracted = await asyncio.gather(*(ctx.run(extract_evidence, g) for g in groups))
    result = run_analysis(dispute_id, extract_parallel=False, claimed=True)
    result["extracted"] = extracted
    return result


if __name__ == "__main__":
    app.start()
