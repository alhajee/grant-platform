import type { PillarId } from "@/lib/beap-pillars";

// A small vector illustration family: consistent perspective, line work and scale.
const palettes = {
  infrastructure: ["#edf1e5", "#dce5c8", "#687f4a", "#354832"],
  access: ["#e5f1ee", "#c1ddd3", "#4c8c79", "#28564b"],
  quality: ["#f0eafa", "#d9c9ee", "#9778be", "#594477"],
  systems: ["#e6eef9", "#c7d7f1", "#6b93cb", "#3a527a"],
  sports: ["#fcf0e1", "#f1d3a9", "#cd9855", "#785537"],
  gscci: ["#f7e9ed", "#edcdd9", "#b77994", "#70465c"],
} as const;

export function PillarIllustration({ pillar: id, standalone = false }: { pillar: PillarId; standalone?: boolean }) {
  const artwork: Record<PillarId, keyof typeof palettes> = { infrastructure:'infrastructure',tlm:'quality',quality:'quality',teachers:'quality',sbmc:'access',monitoring:'systems',curriculum:'quality',planning:'systems',sports:'sports',gscci:'gscci',ict:'systems' };
  const pillar = artwork[id];
  const [background, soft, accent, ink] = palettes[pillar];
  return (
    <svg viewBox="0 0 240 176" fill="none" className="pillar-art" aria-hidden="true" focusable="false">
      {!standalone && <><rect width="240" height="176" rx="12" fill={background} />
      <circle cx="181" cy="43" r="42" fill={soft} opacity=".5" />
      <path d="M19 132c36-20 67 26 107 10s65-27 97-14" stroke={accent} strokeOpacity=".18" /></>}
      <g stroke={ink} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {pillar === "infrastructure" && <>
          <path d="m44 129 91-22 70 26-91 24z" fill={soft} stroke="none" />
          <path d="m59 80 58-25 63 26v52l-60 23-61-24z" fill="#fffcf5" />
          <path d="m120 102 60-21v52l-60 23z" fill={soft} />
          <path d="m51 80 64-40 72 38-67 27z" fill={accent} />
          <path d="m51 80 64-40 5 65z" fill={background} />
          <path d="m95 133 0-24q9-12 17 3v35" fill={accent} />
          <path d="m72 99 12 5v14l-12-4zm63 10 12-4v14l-12 4zm23-8 12-4v14l-12 4z" fill={accent} />
          <path d="M114 40V23m0 0h24l-6 7 6 7h-24" fill={soft} />
          <path d="M38 122v-19m0 5c-20-8-15-22-8-17 2-20 19-13 17 1 15-3 13 17-9 16" fill={accent} />
          <path d="m175 46 10-8m-4 23 15-2" strokeOpacity=".4" />
        </>}
        {pillar === "access" && <>
          <path d="m42 138 74-20 82 23-76 18z" fill={soft} stroke="none" />
          <path d="M106 126V56q0-25 24-25t24 25v65" fill={soft} />
          <path d="M114 125V57q0-18 16-18t16 18v63" fill="#fffdf9" />
          <path d="m146 120-27 24v-86l27-12z" fill={accent} />
          <circle cx="137" cy="93" r="2" fill={ink} stroke="none" />
          <circle cx="77" cy="78" r="11" fill="#fffdf9" />
          <path d="M62 120V99q15-19 30 0v22" fill={accent} />
          <path d="m69 120-3 24m19-24 5 24M63 104l-10 16m37-16 12-11" />
          <path d="M91 98h8v21h-7" fill={soft} />
          <circle cx="172" cy="99" r="9" fill="#fffdf9" />
          <path d="M160 132v-17q12-13 24 0v17" fill={soft} />
          <path d="m165 132-2 13m16-13 2 13m-22-27-9-6m35 7 9 7" />
          <path d="m50 46 6-6m-14 17h10m143 9 5-5m-5 15h8" strokeOpacity=".4" />
        </>}
        {pillar === "quality" && <>
          <path d="m40 129 77-18 83 26-81 21z" fill={soft} stroke="none" />
          <path d="m48 103 70 20 76-26v33l-75 23-71-21z" fill={accent} />
          <path d="m53 79 66 20 69-24v47l-69 23-66-19z" fill="#fffdf9" />
          <path d="M119 99v46" />
          <path d="m53 79 31-4 35 17 35-24 34 7-69 24z" fill={background} />
          <path d="m65 94 40 12m-40 0 40 12m-40 0 24 7m44-20 40-14m-40 26 40-14m-40 26 27-9" strokeOpacity=".45" />
          <path d="m151 35 5 12 14 1-11 9 3 14-11-7-12 7 3-14-11-9 14-1z" fill={accent} />
          <path d="m67 47 26-12 15 7-26 13z" fill={soft} />
          <path d="m68 48 3 12 13 7 20-12V44m4-2v20" />
          <path d="m178 49 10-3m-14-12 5-9m-126 96-11-4" strokeOpacity=".4" />
        </>}
        {pillar === "systems" && <>
          <path d="m39 135 77-20 85 26-84 18z" fill={soft} stroke="none" />
          <path d="M79 78v19h79V78m-39 19v19" strokeWidth="2" />
          <rect x="57" y="41" width="49" height="39" rx="7" fill="#fffdf9" />
          <path d="M66 53h19m-19 8h30m-30 8h15" stroke={accent} />
          <rect x="135" y="32" width="48" height="48" rx="8" fill={accent} />
          <path d="m147 55 8 8 14-17" stroke="#fffdf9" strokeWidth="3" />
          <rect x="94" y="111" width="49" height="34" rx="6" fill="#fffdf9" />
          <path d="M105 134v-8m12 8v-15m12 15v-11" stroke={accent} strokeWidth="4" />
          <circle cx="158" cy="97" r="4" fill={background} />
          <path d="M40 64h-7m6 16-5 4m158 28 9-4m-7 15h9" strokeOpacity=".4" />
        </>}
        {pillar === "sports" && <>
          <ellipse cx="124" cy="145" rx="65" ry="12" fill={soft} stroke="none" />
          <path d="M84 46H66v16q0 26 32 27m48-43h18v16q0 26-32 27" strokeWidth="4" />
          <path d="M83 36h64v27q0 36-32 40-32-4-32-40z" fill={accent} />
          <path d="M89 37h13v29q0 24 13 35-25-7-26-34z" fill={soft} stroke="none" />
          <path d="M115 103v26m-16 1h32v13H99z" fill={accent} />
          <path d="m115 49 5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2z" fill="#fffdf9" />
          <circle cx="171" cy="124" r="24" fill="#fffdf9" />
          <path d="m171 114 10 7-4 12h-12l-4-12z" fill={soft} />
          <path d="m171 100 0 14m-23 3 13 4m-5 22 9-10m22 9-10-9m17-17-13 5" />
          <path d="m53 103 8 8m-7-62-7-4m119-23 6-7m8 18 9-2" strokeOpacity=".4" />
        </>}
        {pillar === "gscci" && <>
          <ellipse cx="120" cy="143" rx="65" ry="12" fill={soft} stroke="none" />
          <path d="m120 39 37 16v33q0 35-37 52-37-17-37-52V55z" fill="#fffdf9" />
          <path d="m120 48 28 12v27q0 28-28 43z" fill={soft} stroke="none" />
          <path d="m103 79 17-7 17 7v23l-17-5-17 5z" fill={accent} />
          <path d="M120 72v25m-11-14 6-3m10 0 6 3" stroke="#fffdf9" />
          <circle cx="62" cy="92" r="10" fill={accent} />
          <circle cx="180" cy="89" r="10" fill={accent} />
          <path d="m48 121 3-12q11-9 22 0l3 12m90-3 3-12q11-9 22 0l3 12" fill={soft} />
          <path d="m120 22 0 7m-19-3 3 6m33-6-3 6m-64 16 8 6m84-6-8 6" strokeOpacity=".4" />
        </>}
      </g>
    </svg>
  );
}
