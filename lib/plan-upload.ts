import { maxRatFileBytes, maxRatTotalBytes } from './plan-setup';
import JSZip from 'jszip';

export class PlanInputError extends Error {
  constructor(message:string, public status=400) {super(message);}
}
// Bound the request before parsing multipart data, including chunked requests.
export async function planFormData(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data;')) throw new PlanInputError('Use the plan setup form and attach a RAT document.');
  const limit=maxRatTotalBytes+64*1024;
  if (Number(request.headers.get('content-length'))>limit) throw new PlanInputError('Attachments must total no more than 10 MB.',413);
  const reader=request.body?.getReader();
  if(!reader) throw new PlanInputError('Plan details are missing.');
  const chunks: Uint8Array[]=[];let size=0;
  try {while(true) {const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new PlanInputError('Attachments must total no more than 10 MB.',413);}chunks.push(value);}}
  finally {reader.releaseLock();}
  try {return await new Response(Buffer.concat(chunks),{headers:{'Content-Type':request.headers.get('content-type')!}}).formData();}
  catch {throw new PlanInputError('The upload could not be read. Select the files again.');}
}
export async function ratDocuments(form: FormData) {
  const files=form.getAll('rat');
  if(!files.length||files.length>3) throw new PlanInputError('Attach between one and three RAT documents.');
  let total=0;
  return await Promise.all(files.map(async file=>{
    if(typeof file==='string'||!file.size||file.size>maxRatFileBytes) throw new PlanInputError('Each RAT document must be nonempty and no larger than 5 MB.');
    total+=file.size;if(total>maxRatTotalBytes)throw new PlanInputError('Attachments must total no more than 10 MB.');
    const name=file.name.replace(/[\x00-\x1f\x7f/\\]/g,'_').slice(-180);
    const ext=name.split('.').pop()?.toLowerCase();
    const content=Buffer.from(await file.arrayBuffer());
    if(ext!=='xlsx'||content.subarray(0,4).toString('hex')!=='504b0304') throw new PlanInputError('Upload the RAT as a valid Excel (.xlsx) file.');
    try {const workbook=await JSZip.loadAsync(content);if(!workbook.file('xl/workbook.xml'))throw new Error();}
    catch {throw new PlanInputError('Upload the RAT as a valid Excel (.xlsx) workbook.');}
    return {id:crypto.randomUUID(),name,size:file.size,mediaType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',content};
  }));
}
