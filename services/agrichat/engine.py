"""Real AgriChat LoRA + LLaVA-OneVision inference; no Gemini or mock fallback."""
from contract import BASE_ID, BASE_REVISION, MODEL_ID, MODEL_REVISION, build_prompt, parse_findings


class AgriChatEngine:
    def __init__(self, zerogpu=False):
        import torch
        from transformers import AutoProcessor, BitsAndBytesConfig, LlavaOnevisionForConditionalGeneration
        from peft import PeftModel

        if not zerogpu and not torch.cuda.is_available():
            raise RuntimeError("AgriChat requires a CUDA GPU; CPU fallback is disabled")
        self.torch = torch
        # ZeroGPU emulates CUDA at module load and supplies the real GPU only
        # inside @spaces.GPU. Avoid probing a physical device during that phase.
        self.dtype = torch.bfloat16 if zerogpu or torch.cuda.is_bf16_supported() else torch.float16
        quantization = {} if zerogpu else {"quantization_config": BitsAndBytesConfig(
            load_in_4bit=True, bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=self.dtype, bnb_4bit_use_double_quant=True,
        )}
        self.processor = AutoProcessor.from_pretrained(BASE_ID, revision=BASE_REVISION, trust_remote_code=False)
        base = LlavaOnevisionForConditionalGeneration.from_pretrained(
            BASE_ID, revision=BASE_REVISION, trust_remote_code=False, use_safetensors=True,
            torch_dtype=self.dtype, low_cpu_mem_usage=True, device_map={"": 0},
            attn_implementation="sdpa",
            **quantization,
        )
        self.model = PeftModel.from_pretrained(base, MODEL_ID, revision=MODEL_REVISION, is_trainable=False)
        self.model.eval()
        if not self.model.peft_config or self.model.active_adapter != "default":
            raise RuntimeError("AgriChat adapter was not activated")

    def generate(self, image, prompt, max_tokens=512):
        conversation = [{"role": "user", "content": [
            {"type": "image"}, {"type": "text", "text": prompt},
        ]}]
        text = self.processor.apply_chat_template(conversation, add_generation_prompt=True)
        inputs = self.processor(text=[text], images=[image], return_tensors="pt", padding=True)
        device = next(self.model.parameters()).device
        inputs = {key: value.to(device=device, dtype=self.dtype) if value.is_floating_point()
                  else value.to(device) for key, value in inputs.items()}
        with self.torch.inference_mode():
            output = self.model.generate(
                **inputs, do_sample=False, max_new_tokens=max_tokens, max_time=25.0,
                repetition_penalty=1.0, use_cache=True,
                pad_token_id=self.processor.tokenizer.pad_token_id,
            )
        generated = output[0, inputs["input_ids"].shape[1]:]
        return self.processor.tokenizer.decode(generated, skip_special_tokens=True)

    def warmup(self):
        from PIL import Image
        self.generate(Image.new("RGB", (384, 384), "green"), "Describe the image briefly.", max_tokens=1)

    def diagnose(self, request, image):
        return parse_findings(self.generate(image, build_prompt(request)))
