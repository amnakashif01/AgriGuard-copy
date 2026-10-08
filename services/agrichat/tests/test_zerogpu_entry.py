"""Real Gradio wiring with fake GPU/model, not an AgriChat inference test."""
import importlib.util
import json
import os
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch

from contract import parse_findings
from test_service import FIXTURE, photo, TOKEN


class ZeroGpuEntryTest(unittest.TestCase):
    def test_authentication_and_input_checks_precede_gpu_work(self):
        gpu_calls = []
        fake_spaces = ModuleType("spaces")
        def gpu(**settings):
            self.assertEqual(settings["duration"], 35)
            def decorate(fn):
                def wrapped(*args, **kwargs):
                    gpu_calls.append(True)
                    return fn(*args, **kwargs)
                return wrapped
            return decorate
        fake_spaces.GPU = gpu
        fake_engine = ModuleType("engine")
        class Engine:
            def __init__(self, zerogpu):
                if not zerogpu:
                    raise AssertionError("The free Space must use its ZeroGPU mode")
            def diagnose(self, request, image):
                return parse_findings(json.dumps(FIXTURE))
        fake_engine.AgriChatEngine = Engine
        with patch.dict(sys.modules, {"spaces": fake_spaces, "engine": fake_engine}), patch.dict(os.environ, {"AGRICHAT_API_KEY": TOKEN}):
            spec = importlib.util.spec_from_file_location("test_space_entry", Path(__file__).parents[1] / "space_app.py")
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            payload = {"photoDataUri": photo(), "crop": "Tomato", "symptoms": "Spots"}
            with self.assertRaises(module.gr.Error):
                module.diagnose(payload, SimpleNamespace(headers={}))
            request = SimpleNamespace(headers={"x-agrichat-key": TOKEN})
            with self.assertRaises(module.gr.Error):
                module.diagnose(payload | {"photoDataUri": "invalid"}, request)
            self.assertEqual(gpu_calls, [])
            result = module.diagnose(payload, request)
            self.assertEqual(result["diagnosis"]["disease"], FIXTURE["disease"])
            self.assertEqual(result["inference"]["quantization"], "none")
            self.assertEqual(len(gpu_calls), 1)
            self.assertTrue(any(item.get("api_name") == "diagnose" for item in module.demo.config["dependencies"]))


if __name__ == "__main__":
    unittest.main()
