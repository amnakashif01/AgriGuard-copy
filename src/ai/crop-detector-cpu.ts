import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import * as ort from 'onnxruntime-node';
import {DETECTOR_CLASSES,DETECTOR_REVISION,detectorSupportsCrop,type DetectorResult,type LeafDetection} from '@/lib/crop-detector';

let sessionPromise:Promise<ort.InferenceSession>|undefined;
async function getSession(){
  if(!sessionPromise)sessionPromise=(async()=>{
    const bytes=await readFile(path.join(process.cwd(),'models/plant-disease/detector.onnx'));
    if(createHash('sha256').update(bytes).digest('hex')!=='17c9e8ef5151e4018a015a5c78e04cfae7288a3b097a9b26f5c0f77fac85c191')throw new Error('Invalid detector weights');
    return ort.InferenceSession.create(bytes,{executionProviders:['cpu'],intraOpNumThreads:1,interOpNumThreads:1});
  })().catch(e=>{sessionPromise=undefined;throw e;});
  return sessionPromise;
}
function overlap(a:number[],b:number[]){
 const h=Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0])),w=Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));
 return w*h/((a[2]-a[0])*(a[3]-a[1])+(b[2]-b[0])*(b[3]-b[1])-w*h || 1);
}
export async function detectCropLeaves(photoDataUri:string,crop?:string):Promise<DetectorResult>{
 const start=performance.now();
 const base={model:'YOLO11m PlantDoc',revision:DETECTOR_REVISION} as const;
 if(!detectorSupportsCrop(crop))return {...base,status:'unsupported',elapsedMs:0,detections:[]};
 let input:ort.Tensor|undefined;let output:ort.Tensor|undefined;
 try{
  if(photoDataUri.length>5_500_000)throw new Error('Image too large');
  const match=/^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(photoDataUri);
  if(!match)throw new Error('Invalid image');
  const decoded=await sharp(Buffer.from(match[1],'base64'),{limitInputPixels:16_000_000,failOn:'error'}).rotate().removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject:true});
  const {width,height,channels}=decoded.info;
  if(width<32||height<32||channels!==3)throw new Error('Invalid image size');
  const scale=640/Math.max(width,height),w=Math.round(width*scale),h=Math.round(height*scale),left=Math.floor((640-w)/2),top=Math.floor((640-h)/2);
  const pixels=await sharp(decoded.data,{raw:{width,height,channels:3}}).resize(w,h,{kernel:'linear',fit:'fill'}).extend({left,right:640-w-left,top,bottom:640-h-top,background:{r:114,g:114,b:114}}).raw().toBuffer();
  const data=new Float32Array(3*640*640);
  for(let i=0;i<640*640;i++)for(let c=0;c<3;c++)data[c*640*640+i]=pixels[i*3+c]/255;
  input=new ort.Tensor('float32',data,[1,3,640,640]);
  const result=await (await getSession()).run({images:input});output=result.output0;
  if(output.dims.join(',')!=='1,33,8400')throw new Error('Unexpected detector shape');
  const a=output.data as Float32Array,n=8400,boxes:LeafDetection[]=[];
  const clamp=(v:number)=>Math.round(Math.max(0,Math.min(1000,v)));
  for(let i=0;i<n;i++){
    let score=0,id=0;for(let c=0;c<29;c++){const p=a[(c+4)*n+i];if(p>score){score=p;id=c;}}
    if(!Number.isFinite(score)||score<.15||score>1)continue;
    const [x,y,bw,bh]=[a[i],a[n+i],a[2*n+i],a[3*n+i]];
    if(![x,y,bw,bh].every(Number.isFinite))continue;
    const box:[number,number,number,number]=[clamp((y-bh/2-top)/scale/height*1000),clamp((x-bw/2-left)/scale/width*1000),clamp((y+bh/2-top)/scale/height*1000),clamp((x+bw/2-left)/scale/width*1000)];
    if(box[2]<=box[0]||box[3]<=box[1])continue;
    boxes.push({classId:id,label:DETECTOR_CLASSES[id][0],score:Math.round(score*10000)/100,box});
  }
  boxes.sort((a,b)=>b.score-a.score);const kept:LeafDetection[]=[];
  for(const box of boxes){if(!kept.some(k=>overlap(k.box,box.box)>.45))kept.push(box);if(kept.length===16)break;}
  return {...base,status:'detected',elapsedMs:Math.round(performance.now()-start),detections:kept};
 }catch{
  console.warn('Crop detector unavailable; report will explicitly use Gemini fallback.');
  return {...base,status:'unavailable',elapsedMs:Math.round(performance.now()-start),detections:[]};
 }finally{input?.dispose();output?.dispose();}
}
