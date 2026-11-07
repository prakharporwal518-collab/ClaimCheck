"""All settings come from environment variables so the same code runs locally,
on Render, and inside Render Workflows."""

import os
from dataclasses import dataclass, field
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("CLAIMCHECK_DATA_DIR", BACKEND_DIR / "data"))
SAMPLE_DIR = BACKEND_DIR / "sample_evidence"


def _bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


@dataclass
class Settings:
    # --- Database ---------------------------------------------------------
    # SQLite locally; set DATABASE_URL to Render Postgres (or Supabase) in production.
    database_url: str = field(
        default_factory=lambda: os.getenv("DATABASE_URL", f"sqlite:///{DATA_DIR / 'claimcheck.db'}")
    )

    # --- PayPal -----------------------------------------------------------
    # "mock" uses seeded disputes in the exact PayPal API JSON shape.
    # "sandbox" calls the real PayPal Sandbox. Switching is a config change, not a rewrite.
    paypal_mode: str = field(default_factory=lambda: os.getenv("PAYPAL_MODE", "mock").lower())
    paypal_client_id: str = field(default_factory=lambda: os.getenv("PAYPAL_CLIENT_ID", ""))
    paypal_client_secret: str = field(default_factory=lambda: os.getenv("PAYPAL_CLIENT_SECRET", ""))
    paypal_api_base: str = field(
        default_factory=lambda: os.getenv("PAYPAL_API_BASE", "https://api-m.sandbox.paypal.com")
    )
    # Kept as one setting so a future /v2 switch is a one-line change.
    paypal_disputes_path: str = field(
        default_factory=lambda: os.getenv("PAYPAL_DISPUTES_PATH", "/v1/customer/disputes")
    )
    paypal_webhook_id: str = field(default_factory=lambda: os.getenv("PAYPAL_WEBHOOK_ID", ""))

    # --- AI -----------------------------------------------------------------
    gemini_api_key: str = field(default_factory=lambda: os.getenv("GEMINI_API_KEY", ""))
    gemini_model: str = field(default_factory=lambda: os.getenv("GEMINI_MODEL", "gemini-3.6-flash"))
    gemini_fallback_model: str = field(
        default_factory=lambda: os.getenv("GEMINI_FALLBACK_MODEL", "gemini-3.5-flash-lite")
    )
    ocr_confidence_threshold: float = field(
        default_factory=lambda: float(os.getenv("OCR_CONFIDENCE_THRESHOLD", "60"))
    )
    log_prompts: bool = field(default_factory=lambda: _bool("LOG_LLM_PROMPTS", True))

    # --- Render Workflows ---------------------------------------------------
    # When enabled, analysis runs as a Render Workflow task; otherwise it runs
    # in-process (the fallback the plan asks for because Workflows is beta).
    use_render_workflows: bool = field(default_factory=lambda: _bool("USE_RENDER_WORKFLOWS", False))
    render_api_key: str = field(default_factory=lambda: os.getenv("RENDER_API_KEY", ""))
    render_workflow_slug: str = field(
        default_factory=lambda: os.getenv("RENDER_WORKFLOW_SLUG", "claimcheck-workflows")
    )

    # --- Web ------------------------------------------------------------------
    cors_origins: list[str] = field(
        default_factory=lambda: [
            o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()
        ]
    )
    max_file_mb: int = 5
    max_files_per_dispute: int = 10

    @property
    def gemini_enabled(self) -> bool:
        return bool(self.gemini_api_key)

    @property
    def workflows_enabled(self) -> bool:
        return self.use_render_workflows and bool(self.render_api_key)


settings = Settings()
DATA_DIR.mkdir(parents=True, exist_ok=True)
