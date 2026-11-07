"""AG Studio AI assistant -> Gemini function-calling translation."""

import json


def test_studio_turn_function_calling(monkeypatch):
    from app.config import settings
    from app.pipeline import llm

    sent = []

    def fake_call(model, body):
        sent.append(body)
        if len(sent) == 1:
            return {"candidates": [{"content": {"parts": [
                {"functionCall": {"name": "view_schema", "args": {}}, "thoughtSignature": "sig-abc"}]}}]}
        return {"candidates": [{"content": {"parts": [{"text": "You won 5 and lost 3."}]}}],
                "usageMetadata": {"promptTokenCount": 10, "candidatesTokenCount": 5}}

    monkeypatch.setattr(settings, "gemini_api_key", "k")
    monkeypatch.setattr(llm, "_call", fake_call)
    tool = {"name": "view_schema", "description": "Show fields", "parameters": {"type": "object", "properties": {}}}
    user = {"id": "m1", "kind": "input", "type": "message", "role": "user", "status": "completed",
            "content": [{"type": "text", "text": "Win rate?"}]}

    r1 = llm.studio_turn({"input": [user], "instructions": "Be brief", "tools": [tool],
                          "toolChoice": "auto", "responseFormat": {"type": "text"}})
    call = r1["output"][0]
    assert call["type"] == "function_call" and call["name"] == "view_schema"
    assert sent[0]["tools"][0]["functionDeclarations"][0]["parametersJsonSchema"] == tool["parameters"]
    assert sent[0]["toolConfig"]["functionCallingConfig"]["mode"] == "AUTO"

    result = {"type": "function_call_output", "callId": call["callId"], "output": "fields...", "status": "completed"}
    r2 = llm.studio_turn({"input": [user, call, result], "tools": [tool], "responseFormat": {"type": "text"}})
    assert r2["output"][0]["content"][0]["text"] == "You won 5 and lost 3."
    contents = sent[1]["contents"]
    assert contents[1]["role"] == "model" and contents[1]["parts"][0]["thoughtSignature"] == "sig-abc"
    assert contents[2]["parts"][0]["functionResponse"]["name"] == "view_schema"
    assert r2["usage"] == {"inputTokens": 10, "outputTokens": 5}
    json.dumps(r2)


def test_studio_turn_without_key():
    from app.pipeline import llm

    r = llm.studio_turn({"input": [], "responseFormat": {"type": "text"}})
    assert "Gemini key" in r["output"][0]["content"][0]["text"]


def test_studio_turn_uses_fallback_model_and_explains_quota(monkeypatch):
    from app.config import settings
    from app.pipeline import llm

    calls = []

    def quota_on_main(model, body):
        calls.append(model)
        if model == settings.gemini_model:
            raise llm.LlmUnavailable("Gemini 429: quota exceeded")
        return {"candidates": [{"content": {"parts": [{"text": "Answer from the backup model"}]}}]}

    monkeypatch.setattr(settings, "gemini_api_key", "k")
    monkeypatch.setattr(llm, "_call", quota_on_main)
    user = {"id": "m1", "kind": "input", "type": "message", "role": "user", "status": "completed",
            "content": [{"type": "text", "text": "Win rate?"}]}
    r = llm.studio_turn({"input": [user], "responseFormat": {"type": "text"}})
    assert calls == [settings.gemini_model, settings.gemini_fallback_model]
    assert r["output"][0]["content"][0]["text"] == "Answer from the backup model"
    assert r["model"] == settings.gemini_fallback_model

    def quota_everywhere(model, body):
        raise llm.LlmUnavailable("Gemini 429: quota exceeded")

    monkeypatch.setattr(llm, "_call", quota_everywhere)
    r = llm.studio_turn({"input": [user], "responseFormat": {"type": "text"}})
    assert "quota is used up" in r["output"][0]["content"][0]["text"]
    assert "429" not in r["output"][0]["content"][0]["text"]
