"""Free ZeroGPU Gradio entry point. Requires an eligible HF account; no paid APIs."""
import spaces  # Must precede model/torch imports to enable ZeroGPU CUDA emulation.
import gradio as gr
import hmac
import os

from contract import DiagnosisRequest, decode_image, provenance
from engine import AgriChatEngine

key = os.environ.get("AGRICHAT_API_KEY", "")
if len(key) < 32:
    raise RuntimeError("Configure the AGRICHAT_API_KEY Space secret (32+ characters)")

# Keep model loading outside the GPU function. ZeroGPU snapshots the prepared model.
# The default 48GB ZeroGPU slice allows BF16 without bitsandbytes CUDA dependencies.
engine = AgriChatEngine(zerogpu=True)


@spaces.GPU(duration=35)
def infer(parsed, image, request: gr.Request):
    findings = engine.diagnose(parsed, image)
    return {"diagnosis": findings.model_dump(), "inference": provenance("none")}


def diagnose(payload, request: gr.Request):
    supplied = request.headers.get("x-agrichat-key", "") if request else ""
    if not hmac.compare_digest(supplied.encode(), key.encode()):
        raise gr.Error("AgriChat authentication failed")
    try:
        parsed = DiagnosisRequest.model_validate(payload)
        image = decode_image(parsed.photoDataUri)
    except ValueError:
        raise gr.Error("Use a valid crop photo and supported input") from None
    # Retain the original Gradio request for platform quota accounting.
    try:
        return infer(parsed, image, request)
    except ValueError:
        raise gr.Error("AgriChat could not return a valid structured diagnosis") from None


with gr.Blocks(analytics_enabled=False) as demo:
    gr.Markdown("# AgriGuard crop model service\nUses the published AgriChat model. Access reports through the AgriGuard website.")
    payload = gr.JSON(visible=False)
    result = gr.JSON(visible=False)
    gr.Button("Analyze", visible=False).click(diagnose, inputs=[payload], outputs=[result], api_name="diagnose")

demo.queue(max_size=2, default_concurrency_limit=1)
if __name__ == "__main__":
    demo.launch(show_error=False, show_api=False)
