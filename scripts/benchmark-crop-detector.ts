import {readFile} from 'node:fs/promises';
import {detectCropLeaves} from '../src/ai/crop-detector-cpu';
import {chooseDetectorEvidence} from '../src/lib/crop-detector';

async function main(){
const fixtures=JSON.parse(await readFile(process.argv[2],'utf8'));
const rows=[];
for(const fixture of fixtures){
  const bytes=await readFile(fixture.path);
  const result=await detectCropLeaves(`data:image/jpeg;base64,${bytes.toString('base64')}`,fixture.crop);
  const evidence=chooseDetectorEvidence(result,fixture.crop);
  rows.push({source:fixture.url.startsWith('http')?fixture.url:'Private or generated regression fixture; image not distributed',dataset:fixture.dataset,expectedLabel:fixture.expectedLabel,...result,initialRoute:evidence.route});
}
console.log(JSON.stringify(rows,null,2));

}
main().catch(error=>{console.error(error);process.exitCode=1;});
