import base64
import io
import json
import os
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient
from PIL import Image
from app import create_app
from contract import DiagnosisRequest, decode_image, parse_findings, provenance

FIXTURE = dict(crop="Tomato", disease="Early Blight", confidence=81,
               severity="Medium", severityScore=45, severityExplanation="Visible lesions.",
               affectedParts=["Leaves"], description="Concentric lesions on leaves.", expertReviewRequired=False)
TOKEN = "test-only-service-token-0123456789"
HEADERS = {"Authorization": f"Bearer {TOKEN}"}


def photo():
    out = io.BytesIO()
    Image.new("RGB", (128, 64), "green").save(out, format="PNG")
    return "data:image/png;base64," + base64.b64encode(out.getvalue()).decode()


class FakeEngine:
    """Only HTTP wiring is tested here. This is not an inference/accuracy test."""
    def warmup(self):
        pass

    def diagnose(self, request, image):
        return parse_findings(json.dumps(FIXTURE))


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.previous_key = os.environ.get("AGRICHAT_API_KEY")
        os.environ["AGRICHAT_API_KEY"] = TOKEN
        self.payload = dict(photoDataUri=photo(), symptoms="Brown spots", crop="Tomato", language="english")

    def tearDown(self):
        if self.previous_key is None:
            os.environ.pop("AGRICHAT_API_KEY", None)
        else:
            os.environ["AGRICHAT_API_KEY"] = self.previous_key

    def test_output_validation_rejects_invention_and_contradiction(self):
        self.assertEqual(parse_findings("```json\n" + json.dumps(FIXTURE) + "\n```").disease, "Early Blight")
        for change in [{"confidence": 101}, {"confidence": "81"}, {"severityScore": -1},
                       {"disease": "Healthy"}, {"severity": "High"}, {"plan": {}}, {"description": ""}]:
            with self.assertRaises(ValueError):
                parse_findings(json.dumps(FIXTURE | change))
        for text in ["An unhealthy plant", json.dumps(FIXTURE) + " extra", '{"crop":"a","crop":"b"}']:
            with self.assertRaises(ValueError):
                parse_findings(text)
        self.assertTrue(parse_findings(json.dumps(FIXTURE | {"confidence": 40})).expertReviewRequired)

    def test_nonplant_and_healthy_results(self):
        common = {"severity": "None", "affectedParts": []}
        for condition, score in [("Not a Crop", None), ("Healthy", 0)]:
            result = parse_findings(json.dumps(FIXTURE | common | {"disease": condition, "severityScore": score}))
            self.assertEqual(result.disease, condition)

    def test_image_validation(self):
        self.assertEqual(decode_image(photo()).size, (128, 64))
        for data in ["https://example.com/photo.jpg", "data:image/png;base64,abcd", "data:text/html;base64,abcd"]:
            with self.assertRaises(ValueError):
                decode_image(data)
        with self.assertRaises(ValueError):
            DiagnosisRequest.model_validate(self.payload | {"language": "unsupported"})

    def test_authenticated_contract_and_body_limit(self):
        with TestClient(create_app(FakeEngine)) as client:
            self.assertEqual(client.get("/health/ready").status_code, 401)
            self.assertEqual(client.get("/health/ready", headers=HEADERS).json()["inference"], provenance())
            self.assertEqual(client.post("/v1/diagnose", json=self.payload).status_code, 401)
            response = client.post("/v1/diagnose", json=self.payload, headers=HEADERS)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["diagnosis"]["disease"], "Early Blight")
            self.assertEqual(client.post("/v1/diagnose", json=self.payload | {"photoDataUri": "bad"}, headers=HEADERS).status_code, 422)
            self.assertEqual(client.post("/v1/diagnose", content=b"x" * 4_500_001, headers=HEADERS).status_code, 413)

    def test_busy_gpu_rejects_queue_and_recovers(self):
        entered, release = threading.Event(), threading.Event()
        class BlockingEngine(FakeEngine):
            def diagnose(self, request, image):
                entered.set()
                if not release.wait(3):
                    raise RuntimeError("test release timed out")
                return super().diagnose(request, image)
        with TestClient(create_app(BlockingEngine)) as client, ThreadPoolExecutor() as executor:
            pending = executor.submit(client.post, "/v1/diagnose", json=self.payload, headers=HEADERS)
            try:
                self.assertTrue(entered.wait(2))
                busy = client.post("/v1/diagnose", json=self.payload, headers=HEADERS)
                self.assertEqual(busy.status_code, 503)
                self.assertEqual(busy.headers["Retry-After"], "3")
            finally:
                release.set()
            self.assertEqual(pending.result().status_code, 200)
            self.assertEqual(client.post("/v1/diagnose", json=self.payload, headers=HEADERS).status_code, 200)

    def test_model_errors_are_explicit_and_private(self):
        class InvalidEngine(FakeEngine):
            def diagnose(self, request, image):
                raise ValueError("private model output")
        with TestClient(create_app(InvalidEngine)) as client:
            for _ in range(2):  # Failed inference releases the GPU lock.
                response = client.post("/v1/diagnose", json=self.payload, headers=HEADERS)
                self.assertEqual(response.status_code, 422)
                self.assertNotIn("private", response.text)

    def test_missing_key_or_failed_warmup_prevents_readiness(self):
        os.environ["AGRICHAT_API_KEY"] = "short"
        with self.assertRaises(RuntimeError), TestClient(create_app(FakeEngine)):
            pass
        os.environ["AGRICHAT_API_KEY"] = TOKEN
        class BrokenEngine(FakeEngine):
            def warmup(self):
                raise RuntimeError("model did not load")
        with self.assertRaises(RuntimeError), TestClient(create_app(BrokenEngine)):
            pass


if __name__ == "__main__":
    unittest.main()
