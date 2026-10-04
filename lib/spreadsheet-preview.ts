import JSZip from 'jszip';
import ExcelJS from 'exceljs';

/** A cell's displayed text. ExcelJS's own .text throws on some valid cells (e.g. a formula or rich text with a null part), so fall back to the raw value. */
function cellText(cell:ExcelJS.Cell):string{
 try{return cell.text??'';}catch{
  const value=cell.value as unknown;
  if(value==null)return '';
  if(typeof value==='object'){
   const v=value as {result?:unknown;richText?:{text?:string}[];text?:unknown;hyperlink?:string};
   if(v.richText)return v.richText.map(part=>part?.text??'').join('');
   if(v.result!=null)return String(v.result);
   if(v.text!=null)return String(v.text);
   if(v.hyperlink)return v.hyperlink;
   return '';
  }
  return String(value);
 }
}

// ExcelJS expects unprefixed spreadsheet elements; Excel also writes valid x: elements.
export async function readSpreadsheetPreview(bytes:ArrayBuffer) {
 const archive=await JSZip.loadAsync(bytes);
 // Document metadata is not needed for a preview and may use unsupported prefixes.
 archive.remove('docProps/app.xml');
 archive.remove('docProps/core.xml');
 for(const [name,entry] of Object.entries(archive.files)){
  if(!name.startsWith('xl/')||!name.endsWith('.xml'))continue;
  let xml=await entry.async('string');
  const namespaces=[...xml.matchAll(/xmlns:([\w.-]+)="http:\/\/schemas.openxmlformats.org\/spreadsheetml\/2006\/main"/g)];
  for(const match of namespaces){
   const prefix=match[1].replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   xml=xml.replace(new RegExp(`(<\\/?)${prefix}:`,'g'),'$1').replace(match[0],'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"');
  }
  if(namespaces.length)archive.file(name,xml);
 }
 const workbook=new ExcelJS.Workbook();
 await workbook.xlsx.load(await archive.generateAsync({type:'arraybuffer'}));
 return workbook.worksheets.slice(0,10).map(ws=>({name:ws.name,rows:Array.from({length:Math.min(ws.rowCount,100)},(_,r)=>Array.from({length:Math.min(ws.columnCount,25)},(_,c)=>cellText(ws.getRow(r+1).getCell(c+1))))}));
}
