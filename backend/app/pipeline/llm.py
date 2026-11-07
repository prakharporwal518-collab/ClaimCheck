"""Small Gemini REST client with the safety nets the free tier needs:

* strict JSON output (responseMimeType + optional JSON schema)
* retry with exponential backoff on 429 / 5xx
* fall back to a second model if the first keeps failing
* cache keyed by a hash of the request, so re-runs are instant and free
* every prompt is logged so tests can prove no buyer PII leaked
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import time

import httpx

from ..config import settings
from ..db import LlmCache, PromptLog, SessionLocal

log = logging.getLogger("claimcheck.llm")
API = "https://generativelanguage.googleapis.com/v1beta/models"


class LlmUnavailable(RuntimeError):
    pass


def _cache_key(model: str, system: str, prompt: str, images: list[tuple[bytes, str]], schema) -> str:
    h = hashlib.sha256()
    for part in (model, system, prompt, json.dumps(schema, sort_keys=True) if schema else ""):
        h.update(part.encode())
    for data, mime in images:
        h.update(hashlib.sha256(data).digest())
        h.update(mime.encode())
    return h.hexdigest()


def _call(model: str, body: dict) -> dict:
    url = f"{API}/{model}:generateContent"
    headers = {"x-goog-api-key": settings.gemini_api_key, "Content-Type": "application/json"}
    delay = 1.0
    last_err: Exception | None = None
    for attempt in range(4):
        try:
            r = httpx.post(url, headers=headers, json=body, timeout=60)
        except httpx.HTTPError as e:
            last_err = e
        else:
            if r.status_code == 200:
                return r.json()
            last_err = RuntimeError(f"Gemini {r.status_code}: {r.text[:300]}")
            if r.status_code not in (429, 500, 502, 503, 504):
                break  # not retryable (bad request, auth)
        log.warning("Gemini %s attempt %d failed: %s", model, attempt + 1, last_err)
        time.sleep(delay)
        delay *= 2
    raise LlmUnavailable(str(last_err))


def generate_json(
    *,
    step: str,
    system: str,
    prompt: str,
    images: list[tuple[bytes, str]] | None = None,
    schema: dict | None = None,
    dispute_id: str = "",
) -> tuple[dict, str]:
    """Returns (parsed JSON, model used). Raises LlmUnavailable if no key or all models fail."""
    if not settings.gemini_enabled:
        raise LlmUnavailable("GEMINI_API_KEY not set")
    images = images or []
    models = [settings.gemini_model]
    if settings.gemini_fallback_model and settings.gemini_fallback_model != settings.gemini_model:
        models.append(settings.gemini_fallback_model)

    with SessionLocal() as s:
        for model in models:
            key = _cache_key(model, system, prompt, images, schema)
            hit = s.get(LlmCache, key)
            if hit:
                return hit.response, f"{model} (cached)"

        parts: list[dict] = [{"text": prompt}]
        for data, mime in images:
            parts.append({"inline_data": {"mime_type": mime, "data": base64.b64encode(data).decode()}})
        body: dict = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": {"responseMimeType": "application/json"},
        }
        if schema:
            body["generationConfig"]["responseJsonSchema"] = schema

        errors = []
        for model in models:
            if settings.log_prompts:
                s.add(PromptLog(dispute_id=dispute_id, step=step, model=model, prompt=system + "\n---\n" + prompt))
                s.commit()
            try:
                raw = _call(model, body)
                text = "".join(
                    p.get("text", "")
                    for p in raw["candidates"][0]["content"]["parts"]
                    if not p.get("thought")
                )
                parsed = json.loads(text)
            except (LlmUnavailable, KeyError, IndexError, json.JSONDecodeError) as e:
                errors.append(f"{model}: {e}")
                continue
            s.add(LlmCache(key=_cache_key(model, system, prompt, images, schema), model=model, response=parsed))
            s.commit()
            return parsed, model
    raise LlmUnavailable("; ".join(errors))


# ---------------------------------------------------------------------------
# Chat turns for the AG Studio AI assistant (function calling)
# ---------------------------------------------------------------------------
_THOUGHT_SIGNATURES: dict[str, str] = {}  # callId -> Gemini thought signature
_DUMMY_SIGNATURE = "skip_thought_signature_validator"


def studio_turn(req: dict) -> dict:
    """Translate one AG Studio `AgLlmRequest` into a Gemini call and back into AG output items."""
    import uuid

    if not settings.gemini_enabled:
        return {
            "output": [_text_item("AI chat needs a Gemini key. Set `GEMINI_API_KEY` on the ClaimCheck backend.")],
            "status": "completed",
        }

    system_parts = [req.get("instructions") or ""]
    contents: list[dict] = []
    call_names: dict[str, str] = {}
    for item in req.get("input", []):
        t = item.get("type")
        if t == "message" and item.get("role") == "system":
            system_parts.append(" ".join(c.get("text", "") for c in item.get("content", [])))
        elif t == "message" and item.get("kind") == "input":
            text = " ".join(c.get("text", "") for c in item.get("content", []) if c.get("type") == "text")
            contents.append({"role": "user", "parts": [{"text": text or " "}]})
        elif t == "message":
            text = " ".join(c.get("text", "") for c in item.get("content", []) if c.get("type") == "text")
            contents.append({"role": "model", "parts": [{"text": text or " "}]})
        elif t == "function_call":
            call_names[item["callId"]] = item["name"]
            try:
                args = json.loads(item.get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {}
            part = {
                "functionCall": {"name": item["name"], "args": args},
                "thoughtSignature": _THOUGHT_SIGNATURES.get(item["callId"], _DUMMY_SIGNATURE),
            }
            if contents and contents[-1]["role"] == "model":
                contents[-1]["parts"].append(part)
            else:
                contents.append({"role": "model", "parts": [part]})
        elif t == "function_call_output":
            part = {
                "functionResponse": {
                    "name": call_names.get(item["callId"], "tool"),
                    "response": {"output": item.get("output", "")},
                }
            }
            if contents and contents[-1]["role"] == "user" and "functionResponse" in contents[-1]["parts"][0]:
                contents[-1]["parts"].append(part)
            else:
                contents.append({"role": "user", "parts": [part]})

    body: dict = {
        "systemInstruction": {"parts": [{"text": "\n\n".join(p for p in system_parts if p)}]},
        "contents": contents or [{"role": "user", "parts": [{"text": "Hello"}]}],
    }
    tools = req.get("tools") or []
    if tools:
        body["tools"] = [
            {
                "functionDeclarations": [
                    {"name": t["name"], "description": t.get("description", ""), "parametersJsonSchema": t["parameters"]}
                    for t in tools
                ]
            }
        ]
        choice = req.get("toolChoice") or "auto"
        if isinstance(choice, dict):
            cfg = {"mode": "ANY", "allowedFunctionNames": [choice["name"]]}
        else:
            cfg = {"mode": {"auto": "AUTO", "none": "NONE", "required": "ANY"}.get(choice, "AUTO")}
        body["toolConfig"] = {"functionCallingConfig": cfg}
    fmt = req.get("responseFormat") or {}
    if fmt.get("type") == "json":
        body["generationConfig"] = {"responseMimeType": "application/json", "responseJsonSchema": fmt.get("schema")}

    if settings.log_prompts:
        with SessionLocal() as s:
            s.add(PromptLog(step="studio_chat", model=settings.gemini_model, prompt=json.dumps(body)[:20000]))
            s.commit()

    raw, used_model, errors = None, settings.gemini_model, []
    models = [settings.gemini_model]
    if settings.gemini_fallback_model and settings.gemini_fallback_model != settings.gemini_model:
        models.append(settings.gemini_fallback_model)  # same safety net as the analysis pipeline
    for model in models:
        try:
            raw, used_model = _call(model, body), model
            break
        except LlmUnavailable as e:
            errors.append(str(e))
    if raw is None:
        if any("429" in e for e in errors):
            msg = ("The free Gemini quota is used up for now (too many AI requests today). "
                   "Please try again in a few minutes, or tomorrow when the daily quota resets. "
                   "The dashboard and filters still work without the AI assistant.")
        else:
            msg = "The AI model is unavailable right now. Please try again in a minute."
        log.warning("Studio AI turn failed: %s", " | ".join(errors)[:500])
        return {"output": [_text_item(msg)], "status": "completed"}

    output: list[dict] = []
    for part in raw.get("candidates", [{}])[0].get("content", {}).get("parts", []):
        if part.get("thought"):
            continue
        if "functionCall" in part:
            call_id = f"call_{uuid.uuid4().hex[:12]}"
            if part.get("thoughtSignature"):
                _THOUGHT_SIGNATURES[call_id] = part["thoughtSignature"]
            output.append(
                {
                    "id": f"fc_{uuid.uuid4().hex[:12]}",
                    "kind": "output",
                    "type": "function_call",
                    "callId": call_id,
                    "name": part["functionCall"]["name"],
                    "arguments": json.dumps(part["functionCall"].get("args", {})),
                    "status": "completed",
                }
            )
        elif part.get("text"):
            output.append(_text_item(part["text"]))
    usage = raw.get("usageMetadata", {})
    return {
        "output": output or [_text_item("(no answer)")],
        "status": "completed",
        "model": used_model,
        "usage": {
            "inputTokens": usage.get("promptTokenCount", 0),
            "outputTokens": usage.get("candidatesTokenCount", 0),
        },
    }


def _text_item(text: str) -> dict:
    import uuid

    return {
        "id": f"msg_{uuid.uuid4().hex[:12]}",
        "kind": "output",
        "type": "message",
        "role": "assistant",
        "status": "completed",
        "content": [{"type": "text", "text": text, "annotations": []}],
    }
