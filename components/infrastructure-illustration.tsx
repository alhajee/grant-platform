type Kind = 'new' | 'whole' | 'furniture';

/** Small architectural vignettes, sharing the portal's muted palette. */
export function InfrastructureIllustration({kind}:{kind:Kind}) {
 return <svg className="infra-illustration" viewBox="0 0 160 112" fill="none" aria-hidden="true">
  <ellipse cx="80" cy="99" rx="63" ry="8" fill="currentColor" opacity=".08"/>
  {kind==='new'?<>
   <path d="M23 53 77 31l46 20-53 24Z" fill="var(--sage)"/>
   <path d="M23 53v32l47 19V75Z" fill="var(--card)"/>
   <path d="M70 75v29l53-24V51Z" fill="var(--sage)"/>
   <path d="M33 64v14l11 4V68Zm19 8v13l10 4V76Z" fill="currentColor" opacity=".55"/>
   <path d="m81 78 12-5v21l-12 5Zm22-10 11-5v13l-11 5Z" fill="currentColor" opacity=".7"/>
   <path d="M112 16v38M86 21h53M128 21v13" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
   <path d="m112 9-25 12h25Z" fill="var(--peach)" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
   <path d="M123 35h10v9h-10Z" fill="var(--peach)"/>
   <path d="M29 94h24m-18-6h12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".4"/>
  </>:kind==='whole'?<>
   <path d="M35 51 79 29l43 22v39l-43 17-44-20Z" fill="var(--card)"/>
   <path d="M79 57v50l43-17V51Z" fill="var(--sage)"/>
   <path d="m27 51 52-29 51 26-51 28Z" fill="currentColor" opacity=".75"/>
   <path d="M78 24V10l20 5-20 6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
   <path d="m47 67 9 4v14l-9-4Zm17 7 8 4v13l-8-4Zm29 7 10-4v20l-10 4Zm15-11 7-3v12l-7 3Z" fill="currentColor" opacity=".65"/>
   <ellipse cx="22" cy="71" rx="11" ry="17" fill="var(--sage)"/><path d="M22 75v21" stroke="currentColor" strokeWidth="3" opacity=".5"/>
   <circle cx="132" cy="82" r="18" fill="var(--card)"/><circle cx="132" cy="82" r="14" fill="currentColor"/><path d="m125 82 5 5 9-10" stroke="var(--card)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
  </>:<>
   <path d="m31 50 52-19 48 23-51 21Z" fill="var(--peach)"/>
   <path d="M31 50v8l49 23v-6Zm49 25v6l51-21v-6Z" fill="currentColor" opacity=".6"/>
   <path d="M40 61v31m77-28v29M80 81v22" stroke="currentColor" strokeWidth="6" strokeLinecap="round"/>
   <path d="M100 22v23l28 12V34Z" fill="var(--lilac)" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
   <path d="m100 46-14 7 28 13 14-9Z" fill="var(--lilac)"/>
   <path d="M91 58v19m33-16v17" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
   <path d="m17 71 27 12v13L17 84Z" fill="var(--lilac)" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
   <path d="m17 85-7 5 28 13 7-7Z" fill="var(--lilac)"/><path d="M13 93v9m25 1v6" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
   <path d="m65 47 15-5 16 7-16 6Z" fill="var(--card)"/><path d="m66 51 14 6 15-6" stroke="currentColor" strokeWidth="2" opacity=".4"/>
  </>}
 </svg>;
}
