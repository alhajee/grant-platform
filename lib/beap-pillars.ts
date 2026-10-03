export const beapComponents = [
  { id: "infrastructure", name: "Infrastructure Projects and TLMs", share: 75, description: "Build, improve and equip spaces where children learn.", areas: ["Construction", "Renovation", "Teaching and learning materials"], href: "/beap/infrastructure" },
  { id: "quality", name: "Quality Assurance", share: 5, description: "Strengthen standards and the quality of basic education.", areas: ["Standards", "Quality"], href: "/beap/quality" },
  { id: "teachers", name: "Teacher development and ICT", share: 5, description: "Support teacher development and digital learning.", areas: ["Teachers", "ICT"], href: null },
  { id: "sbmc", name: "SBMC", share: 5, description: "Support school-based management committees.", areas: ["School management", "Community participation"], href: "/beap/sbmc" },
  { id: "sports", name: "Sports activities", share: 2, description: "Create opportunities for children to play, participate and thrive.", areas: ["Equipment", "Competitions", "School sports"], href: "/beap/sports" },
  { id: "monitoring", name: "Supervision and monitoring", share: 2, description: "Track delivery and supervise school projects.", areas: ["Supervision", "Monitoring"], href: "/beap/monitoring" },
  { id: "curriculum", name: "Purchase and curriculum distribution", share: 2, description: "Plan curriculum purchases and distribution to schools.", areas: ["Curriculum", "Distribution"], href: "/beap/curriculum" },
  { id: "planning", name: "Planning, EMIS & Data platforms", share: 2, description: "Strengthen education planning and data systems.", areas: ["Planning", "EMIS", "Data"], href: null },
  { id: "gscci", name: "Greening Schools, Climate Change & Safeguarding", share: 2, description: "Create safer, climate-resilient school environments.", areas: ["Greening schools", "Climate change", "Safeguarding"], href: "/beap/gscci" },
] as const;

// Compatibility alias for persisted review keys; these keys represent components.
export const beapPillars = beapComponents;
export type ComponentId = typeof beapComponents[number]['id'];
// TLM (inside Infrastructure) and ICT (inside Teacher development and ICT) are reviewed as their own pillars.
export type PillarId = ComponentId | 'tlm' | 'ict';
export const strategicPillars: {id:string;name:string;components:ComponentId[]}[] = [
  {id:'quality',name:'Quality',components:['quality','teachers','sports','curriculum','gscci']},
  {id:'access',name:'Access',components:['infrastructure','monitoring','sbmc']},
  {id:'system',name:'System Optimisation',components:['planning']},
];
export const componentSections: Record<PillarId,{name:string;department:string;href?:string}[]> = {
  infrastructure:[{name:'Infrastructure Projects',department:'physical',href:'/beap/infrastructure'},{name:'Teaching & Learning Materials',department:'academic',href:'/beap/tlm'}],
  tlm:[{name:'Teaching & Learning Materials',department:'academic',href:'/beap/tlm'}],
  quality:[{name:'Quality Assurance',department:'me',href:'/beap/quality'}],
  teachers:[{name:'Teacher Development',department:'teachers'},{name:'ICT',department:'ict',href:'/beap/ict'}],
  ict:[{name:'ICT',department:'ict',href:'/beap/ict'}],
  sports:[{name:'Sports Activities',department:'academic',href:'/beap/sports'}],
  monitoring:[{name:'Supervision & Monitoring',department:'physical',href:'/beap/monitoring'}],
  curriculum:[{name:'Curriculum Purchase, Distribution & Training',department:'academic',href:'/beap/curriculum'}],
  sbmc:[{name:'SBMC',department:'social',href:'/beap/sbmc'}],
  planning:[{name:'Planning, EMIS & Analytics',department:'planning'}],
  gscci:[{name:'Greening Schools, Climate Change & Safeguards',department:'academic',href:'/beap/gscci'}],
};
export type PillarSummary = { lineCount: number; schoolCount: number; budget: number };
// TLM is reviewed separately by Academic Services within the infrastructure allocation.
export const subebComponentDepartments = Object.fromEntries(Object.entries(componentSections).map(([id,sections])=>[id,sections[0].department])) as Record<PillarId,string>;
export const implementedPillars = ['infrastructure', 'sports', 'sbmc', 'tlm', 'monitoring', 'gscci', 'curriculum', 'quality', 'ict'] as const;
export type ImplementedPillar = typeof implementedPillars[number];
export type BeapSummary = { wholeState: boolean; visiblePillars: ImplementedPillar[]; plan: import("./action-plans").ActionPlan; role: string; department: string | null; departments: string[]; canEdit: boolean; editablePillars: ImplementedPillar[]; infrastructure: PillarSummary; sports: PillarSummary; sbmc: PillarSummary; tlm: PillarSummary; monitoring: PillarSummary; gscci: PillarSummary; curriculum: PillarSummary; quality: PillarSummary; ict: PillarSummary; total: PillarSummary };
