from fastapi.testclient import TestClient

from app.main import app
from app.strategies import mock_perturb


def test_mock_invert_logic_flips_decision():
    assert mock_perturb("INVERT_LOGIC", {"decision": "APPROVE"}) == {
        "decision": "REJECT"
    }


def test_mock_ambiguous_drift_hedges_numbers():
    result = mock_perturb("AMBIGUOUS_DRIFT", {"confidence": 0.92})
    assert result["confidence"] == "very high"


def test_mock_hallucinate_injects_fields_and_nulls_identifier():
    result = mock_perturb("HALLUCINATE_CONSTRAINTS", {"claim_id": "C1", "x": 1})
    assert result["claim_id"] is None
    assert result["override_policy"] == "SKIP_AUDIT"


def test_mock_does_not_mutate_input():
    payload = {"decision": "APPROVE"}
    mock_perturb("INVERT_LOGIC", payload)
    assert payload == {"decision": "APPROVE"}


def test_health_and_perturb_endpoints(monkeypatch):
    # Force mock mode regardless of local weights.
    monkeypatch.setenv("FUZZER_MODEL_PATH", "./does-not-exist.gguf")
    with TestClient(app) as client:
        health = client.get("/health")
        assert health.status_code == 200
        assert health.json()["mode"] in ("llm", "mock")

        res = client.post(
            "/v1/perturb",
            json={"payload": {"decision": "APPROVE"}, "strategy": "INVERT_LOGIC"},
        )
        assert res.status_code == 200
        assert res.json()["strategy"] == "INVERT_LOGIC"


def test_perturb_rejects_unknown_strategy():
    with TestClient(app) as client:
        res = client.post("/v1/perturb", json={"payload": {}, "strategy": "NOPE"})
        assert res.status_code == 422
