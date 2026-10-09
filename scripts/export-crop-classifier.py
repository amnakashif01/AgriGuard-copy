"""Reproduce the verified ONNX artifact from pinned, checksum-verified weights.

Install CPU torch 2.8.0, timm 1.0.22, safetensors 0.8.0, onnx 1.19.1.
Optional AGRIGUARD_SAFETENSORS points to an already downloaded checkpoint.
No publisher Python code or pickle checkpoints are executed.
"""
import hashlib
import json
import os
from pathlib import Path
import tempfile
import urllib.request

os.environ['USE_TF'] = '0'
import torch
from torch import nn
import timm
from safetensors.torch import load_file

root = Path(__file__).resolve().parents[1]
destination = root / 'models/crop-disease/davit.onnx'
source_sha = '6ded6f17a38e5c2caef6a4598fd3e2aa9697d804735e495a1883b496fbf96f42'
export_sha = 'fa113cc195cc401789b06436212331b1910ead9edce991f241781a2f4c64c05b'
revision = '907148a4ef8669e80e5c85ae5f029725b40fb3f3'
vocab = json.loads((destination.parent / 'labels.json').read_text())
heads = ('crop', 'category', 'disease', 'pest')

def digest(file):
    with open(file, 'rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

class FourHeadDaViT(nn.Module):
    def __init__(self):
        super().__init__()
        self.backbone = timm.create_model('davit_base.msft_in1k', pretrained=False, num_classes=0)
        for name in heads:
            setattr(self, name + '_head', nn.Linear(1024, len(vocab[name])))

    def forward(self, image):
        features = self.backbone(image)
        return tuple(getattr(self, name + '_head')(features) for name in heads)

with tempfile.TemporaryDirectory(prefix='agriguard-export-') as work:
    checkpoint = Path(os.environ.get('AGRIGUARD_SAFETENSORS', str(Path(work) / 'model.safetensors')))
    if not checkpoint.exists():
        url = f'https://huggingface.co/DigiGreen/crop-disease-pest-detection-dg/resolve/{revision}/model.safetensors'
        with urllib.request.urlopen(url, timeout=180) as response, checkpoint.open('wb') as target:
            while chunk := response.read(1024 * 1024):
                target.write(chunk)
    if digest(checkpoint) != source_sha:
        raise ValueError('Checkpoint integrity verification failed')
    torch.set_num_threads(1)
    model = FourHeadDaViT().eval()
    model.load_state_dict(load_file(str(checkpoint)), strict=True)
    output = Path(work) / 'davit.onnx'
    with torch.inference_mode():
        torch.onnx.export(model, torch.zeros(1, 3, 224, 224), str(output), input_names=['image'], output_names=list(heads), opset_version=17, dynamo=False)
    if digest(output) != export_sha:
        raise ValueError('Export differs from the tested artifact; do not deploy without reevaluation')
    destination.parent.mkdir(parents=True, exist_ok=True)
    import shutil
    staging = destination.with_suffix('.onnx.tmp')
    shutil.copyfile(output, staging)
    os.replace(staging, destination)
    print(f'Exported and verified davit.onnx: {destination.stat().st_size} bytes')
