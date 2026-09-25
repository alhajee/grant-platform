export async function switchUser(userId?:number){
  const response=await fetch('/api/admin/impersonation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(userId?{action:'start',userId}:{action:'stop'})});
  const result=await response.json() as {error?:string;destination:string};
  if(!response.ok)throw Error(result.error||'Unable to switch users.');
  // Other tabs must reload instead of retaining another user's forms and data.
  try{localStorage.setItem('ubec-identity-change',crypto.randomUUID());}catch{}
  window.location.assign(result.destination);
}
