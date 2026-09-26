'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { UploadIcon, DownloadIcon, EyeIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import './document-files.css';

export type DocumentFile = { id:string; name:string; size:number; url?:string; file?:File; description?:string };
const extension=(name:string)=>name.split('.').pop()?.toLowerCase()??'';
const fileSize=(bytes:number)=>bytes>=1048576?`${(bytes/1048576).toFixed(1)} MB`:`${Math.max(1,Math.round(bytes/1024))} KB`;

export function FileArtwork({name,upload=false}:{name:string;upload?:boolean}) {
 const ext=extension(name),kind=upload?'upload':ext==='pdf'?'pdf':['xlsx','xls','csv'].includes(ext)?'sheet':['png','jpg','jpeg','webp'].includes(ext)?'image':['docx','doc'].includes(ext)?'word':'file';
 const id=useId();
 return <svg className="file-artwork" data-kind={kind} viewBox="0 0 64 72" fill="none" aria-hidden="true"><defs><linearGradient id={id} x1="8" y1="4" x2="54" y2="68" gradientUnits="userSpaceOnUse"><stop stopColor="currentColor" stopOpacity=".08"/><stop offset="1" stopColor="currentColor" stopOpacity=".3"/></linearGradient></defs><path d="M14 5h25l15 15v42a5 5 0 0 1-5 5H14a5 5 0 0 1-5-5V10a5 5 0 0 1 5-5Z" fill={`url(#${id})`} stroke="currentColor" strokeOpacity=".4"/><path d="M39 5v11a4 4 0 0 0 4 4h11" stroke="currentColor" strokeOpacity=".5"/>{kind==='upload'?<path d="M32 49V29m-8 8 8-8 8 8M21 48v7h22v-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>:kind==='sheet'?<><rect x="19" y="29" width="26" height="23" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M19 37h26M19 44h26M28 29v23" stroke="currentColor" strokeWidth="2"/></>:kind==='image'?<><rect x="18" y="29" width="28" height="24" rx="3" stroke="currentColor" strokeWidth="2"/><circle cx="26" cy="36" r="3" fill="currentColor"/><path d="m19 49 8-7 6 4 6-9 7 12" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></>:<><path d="M20 30h17M20 36h24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><rect x="15" y="43" width="34" height="16" rx="4" fill="currentColor"/><text x="32" y="54" textAnchor="middle" fill="white" fontSize="9" fontWeight="700" fontFamily="sans-serif">{kind==='pdf'?'PDF':kind==='word'?'DOC':'FILE'}</text></>}</svg>;
}

export function FileUpload({id,label,accept,disabled=false,busy=false,multiple=false,compact=false,onFiles}:{id?:string;label:string;accept:string;disabled?:boolean;busy?:boolean;multiple?:boolean;compact?:boolean;onFiles:(files:File[])=>void|Promise<void>}) {
 const input=useRef<HTMLInputElement>(null),[dragging,setDragging]=useState(false),[error,setError]=useState('');
 function select(files:File[]){setDragging(false);if(disabled||busy)return;const allowed=accept.split(',');if(!multiple&&files.length>1){setError('Choose one file at a time.');return;}if(files.some(f=>!allowed.includes('.'+extension(f.name))||!f.size||f.size>5*1024*1024)){setError('Choose a supported, nonempty file up to 5 MB.');return;}setError('');if(files.length)void onFiles(files);}
 return <div className="file-upload" data-compact={compact||undefined} data-dragging={dragging} data-disabled={disabled||busy} onDragOver={e=>{e.preventDefault();if(!disabled&&!busy)setDragging(true);}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDragging(false);}} onDrop={e=>{e.preventDefault();select(Array.from(e.dataTransfer.files));}}>
  <input ref={input} id={id} className="sr-only" type="file" tabIndex={-1} aria-label={label} accept={accept} multiple={multiple} disabled={disabled||busy} onChange={e=>{select(Array.from(e.target.files??[]));e.target.value='';}}/>
  <div className="upload-emblem"><FileArtwork name="upload" upload/></div>
  <div className="upload-copy"><p className="upload-title">{busy?'Uploading document…':compact?'Drop '+(multiple?'files':'a file')+' here':'Drag and drop your '+(multiple?'files':'file')+' here'}</p><p className="upload-formats">{accept.replaceAll('.','').replaceAll(',',', ').toUpperCase()}</p></div>
  <Button type="button" variant="outline" size="sm" disabled={disabled||busy} onClick={()=>input.current?.click()} aria-label={'Upload '+label}>{busy?<Spinner data-icon="inline-start"/>:<UploadIcon data-icon="inline-start"/>}{busy?'Uploading…':compact?'Add '+(multiple?'files':'file'):'Choose '+(multiple?'files':'file')}</Button>
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 </div>;
}

export function DocumentFiles({documents,onRemove,disabled=false,compact=false}:{documents:DocumentFile[];onRemove?:(id:string)=>void;disabled?:boolean;compact?:boolean}) {
 const [selected,setSelected]=useState<DocumentFile|null>(null);
 return <><ul className="document-files" data-compact={compact||undefined}>{documents.map(doc=><li key={doc.id} className="document-file"><a href={doc.url??'#'} className="document-open" onClick={e=>{e.preventDefault();setSelected(doc);}} aria-label={'Preview '+doc.name}><FileArtwork name={doc.name}/><span className="document-label"><span className="document-name">{doc.name}</span><span className="document-meta">{extension(doc.name).toUpperCase()} · {fileSize(doc.size)}{doc.description&&' · '+doc.description}</span></span><EyeIcon className="document-eye" aria-hidden="true"/></a>{onRemove&&<Button type="button" variant="ghost" size="icon" aria-label={'Remove '+doc.name} disabled={disabled} onClick={()=>onRemove(doc.id)}><XIcon/></Button>}</li>)}</ul>{selected&&<DocumentPreview document={selected} onClose={()=>setSelected(null)}/>}</>;
}

function DocumentPreview({document:doc,onClose}:{document:DocumentFile;onClose:()=>void}) {
 const [url,setUrl]=useState(''),[text,setText]=useState(''),[sheets,setSheets]=useState<{name:string;rows:string[][]}[]>([]),[sheet,setSheet]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const ext=extension(doc.name);
 useEffect(()=>{let active=true,objectUrl='';const controller=new AbortController();
  async function load(){try{let blob:Blob;if(doc.file)blob=doc.file;else{const response=await fetch(doc.url!,{signal:controller.signal,cache:'no-store'});if(!response.ok)throw Error('This document could not be opened. Please try again.');blob=await response.blob();}if(!active)return;if(blob.size>5*1024*1024)throw Error('This file is too large to preview. Download it to view the full document.');objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);
   if(ext==='docx'){const mammoth=await import('mammoth');const result=await mammoth.extractRawText({arrayBuffer:await blob.arrayBuffer()});if(active)setText(result.value);}
   else if(ext==='xlsx'){const {readSpreadsheetPreview}=await import('@/lib/spreadsheet-preview');const result=await readSpreadsheetPreview(await blob.arrayBuffer());if(active)setSheets(result);}
   else if(!['pdf','png','jpg','jpeg','webp'].includes(ext))throw Error('Preview is unavailable for this file type. Download it to open on your device.');
  }catch{if(active)setError('We could not preview this document. You can download it to open on your device.');}finally{if(active)setLoading(false);}}
  void load();return()=>{active=false;controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[doc,ext]);
 return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent className="document-preview-dialog"><DialogHeader className="pr-8"><DialogTitle className="flex items-center gap-3"><FileArtwork name={doc.name}/><span className="min-w-0 break-all">{doc.name}</span></DialogTitle><DialogDescription>{extension(doc.name).toUpperCase()} · {fileSize(doc.size)}</DialogDescription></DialogHeader><div className="document-preview-body">
 {loading?<div className="preview-message" role="status"><Spinner/>Opening document…</div>:error?<div className="preview-message" role="alert"><FileArtwork name={doc.name}/><p>{error}</p></div>:ext==='pdf'?<iframe title={doc.name} src={url} className="document-pdf"/>:['png','jpg','jpeg','webp'].includes(ext)?<img src={url} alt={doc.name} className="document-image"/>:ext==='docx'?<article className="document-text">{text||'This document contains no readable text.'}</article>:<div className="document-workbook"><label>Worksheet <NativeSelect value={sheet} onChange={e=>setSheet(Number(e.target.value))}>{sheets.map((s,i)=><NativeSelectOption key={i} value={i}>{s.name}</NativeSelectOption>)}</NativeSelect></label><p className="document-meta">Preview shows the first 100 rows and 25 columns of up to 10 worksheets.</p><div className="document-sheet"><table><tbody>{sheets[sheet]?.rows.map((row,r)=><tr key={r}><th>{r+1}</th>{row.map((cell,c)=><td key={c}>{cell}</td>)}</tr>)}</tbody></table></div></div>}
 </div><div className="flex justify-end"><Button asChild variant="outline" disabled={!url}><a href={url||undefined} download={doc.name} aria-disabled={!url}><DownloadIcon data-icon="inline-start"/>Download</a></Button></div></DialogContent></Dialog>;
}
