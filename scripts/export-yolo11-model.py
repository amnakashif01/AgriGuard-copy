"""Export pinned YOLO weights with restricted tensor loading; never execute publisher code."""
import os, hashlib, json, collections, shutil, tempfile, urllib.request, warnings
from pathlib import Path
os.environ['YOLO_CONFIG_DIR']=tempfile.gettempdir()
warnings.filterwarnings('ignore', message='the float32 number .* will be truncated.*')
import torch
from torch import nn
from ultralytics.nn.tasks import DetectionModel
from ultralytics.nn.modules import block, conv, head
from ultralytics.utils import IterableSimpleNamespace
from ultralytics.utils.loss import BboxLoss, DFLoss, v8DetectionLoss
from ultralytics.utils.tal import TaskAlignedAssigner
import onnx
from onnxconverter_common import float16
root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'models/plant-disease/manifest.json').read_text())
work=Path(os.environ['AGRIGUARD_YOLO_WORK'])
work.mkdir(parents=True,exist_ok=True)
p=Path(os.environ.get('AGRIGUARD_YOLO_CHECKPOINT',str(work/'checkpoint.pt')))
if not p.exists():
 url=f"https://huggingface.co/{manifest['source']}/resolve/{manifest['revision']}/{manifest['sourceWeightsFile']}"
 with urllib.request.urlopen(url,timeout=180) as response,p.open('wb') as output:
  while chunk:=response.read(1024*1024):output.write(chunk)
if p.stat().st_size!=manifest['sourceWeightsBytes'] or hashlib.file_digest(p.open('rb'),'sha256').hexdigest()!=manifest['sourceWeightsSha256']:
 raise ValueError('YOLO source integrity verification failed')
allowed=[set,collections.OrderedDict,nn.SiLU,nn.BatchNorm2d,nn.ModuleList,nn.Sequential,nn.Conv2d,nn.Identity,nn.BCEWithLogitsLoss,nn.MaxPool2d,nn.Upsample,
 DetectionModel,IterableSimpleNamespace,BboxLoss,DFLoss,v8DetectionLoss,TaskAlignedAssigner,
 block.Attention,block.Bottleneck,block.C2PSA,block.C3k,block.C3k2,block.DFL,block.PSABlock,block.SPPF,
 conv.Concat,conv.Conv,conv.DWConv,head.Detect]
torch.set_num_threads(1)
with torch.serialization.safe_globals(allowed):
 checkpoint=torch.load(p,map_location='cpu',weights_only=True)

model=checkpoint.get('ema') or checkpoint['model']
labels=json.loads((root/'src/lib/yolo11x-labels.json').read_text())
if [model.names[i] for i in range(len(model.names))] != [entry[0] for entry in labels]:
 raise ValueError('YOLO label order does not match the verified class mapping')
model=model.float().eval().fuse()
for m in model.modules():
 if isinstance(m,head.Detect):m.export=True;m.format='onnx';m.dynamic=False
x=torch.zeros(1,3,640,640)
with torch.inference_mode():
 y=model(x)
 if tuple(y.shape)!=(1,120,8400):raise ValueError('Unexpected YOLO output shape')
 torch.onnx.export(model,x,str(work/'yolo11x-fp32.onnx'),input_names=['images'],output_names=['output0'],opset_version=17,dynamo=False)

m=onnx.load(str(work/'yolo11x-fp32.onnx'))
m=float16.convert_float_to_float16(m,keep_io_types=True)
output=work/'detector.onnx'
onnx.save(m,str(output))
if output.stat().st_size!=manifest['onnxBytes'] or hashlib.file_digest(output.open('rb'),'sha256').hexdigest()!=manifest['onnxSha256']:
 raise ValueError('YOLO export differs from the tested artifact; reevaluation required')
destination=root/'models/plant-disease/detector.onnx'
staging=destination.with_suffix('.onnx.tmp')
shutil.copyfile(output,staging)
os.replace(staging,destination)
print(f"Exported and verified YOLO11x: {destination.stat().st_size} bytes, 116 categories, CPU inference.",flush=True)
