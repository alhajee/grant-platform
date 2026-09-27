import type { NextRequest } from 'next/server';

function firstHeaderValue(value:string|null) {
  return value?.split(',')[0]?.trim() || null;
}

/**
 * Validate a browser Origin against the public request URL.
 *
 * Reverse proxies terminate TLS before forwarding a request to Next.js, so
 * request.nextUrl can describe the internal HTTP connection. Traefik supplies
 * the original host and protocol through the standard X-Forwarded headers.
 */
export function isSameRequestOrigin(request:NextRequest) {
  const origin=request.headers.get('origin');
  if(!origin)return false;

  let submitted:URL;
  try{submitted=new URL(origin);}catch{return false;}

  const host=firstHeaderValue(request.headers.get('x-forwarded-host'))
    ?? firstHeaderValue(request.headers.get('host'));
  const protocol=firstHeaderValue(request.headers.get('x-forwarded-proto'))
    ?? request.nextUrl.protocol.replace(/:$/,'');
  if(!host||!protocol)return false;

  return submitted.protocol.toLowerCase()===`${protocol.toLowerCase()}:`
    && submitted.host.toLowerCase()===host.toLowerCase();
}
