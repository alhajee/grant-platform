export const beapComponents = [
  { id: "infrastructure", name: "Infrastructure Projects and TLMs", share: 75, description: "Build, improve and equip spaces where children learn.", areas: ["Construction", "Renovation", "Teaching and learning materials"], href: "/beap/infrastructure" },
  { id: "quality", name: "Quality Assurance", share: 5, description: "Strengthen standards and the quality of basic education.", areas: ["Standards", "Quality"], href: "/beap/quality" },
  { id: "teachers", name: "Teacher development and ICT", share: 5, description: "Support teacher development and digital learning.", areas: ["Teachers", "ICT"], href: "/beap/teachers" },
  { id: "sbmc", name: "SBMC", share: 5, description: "Support school-based management committees.", areas: ["School management", "Community participation"], href: "/beap/sbmc" },
  { id: "sports", name: "Sports activities", share: 2, description: "Create opportunities for children to play, participate and thrive.", areas: ["Equipment", "Competitions", "School sports"], href: "/beap/sports" },
  { id: "monitoring", name: "Supervision and monitoring", share: 2, description: "Track delivery and supervise school projects.", areas: ["Supervision", "Monitoring"], href: "/beap/monitoring" },
  { id: "curriculum", name: "Purchase and curriculum distribution", share: 2, description: "Plan curriculum purchases and distribution to schools.", areas: ["Curriculum", "Distribution"], href: "/beap/curriculum" },
  { id: "planning", name: "Planning, EMIS & Data Platform", share: 2, description: "Strengthen education planning, research and data systems.", areas: ["Planning", "EMIS", "Research", "Statistics"], href: "/beap/planning" },
  { id: "gscci", name: "Greening Schools, Climate Change & Safeguarding", share: 2, description: "Create safer, climate-resilient school environments.", areas: ["Greening schools", "Climate change", "Safeguarding"], href: "/beap/gscci" },
] as const;

// Compatibility alias for persisted review keys; these keys represent components.
export const beapPillars = beapComponents;
export type ComponentId = typeof beapComponents[number]['id'];
// TLM (inside Infrastructure) and ICT (inside Teacher development and ICT) are reviewed as their own pillars;
// the 'teachers' pillar is the Teacher Development section (migration 040).
export type PillarId = ComponentId | 'tlm' | 'ict';
export const strategicPillars: {id:string;name:string;components:ComponentId[]}[] = [
  {id:'quality',name:'Quality',components:['quality','teachers','sports','curriculum','gscci']},
  {id:'access',name:'Access',components:['infrastructure','monitoring','sbmc']},
  {id:'system',name:'System Optimisation',components:['planning']},
];
/** The funding component a reviewed pillar belongs to: TLM sits in Infrastructure, ICT in Teacher development and ICT. */
export const pillarComponent = (pillar: PillarId): ComponentId => pillar === 'tlm' ? 'infrastructure' : pillar === 'ict' ? 'teachers' : pillar;
/**
 * Splits items keyed by pillar into the strategic pillars, in `strategicPillars` order; within a group, items follow the
 * group's component order (TLM right after Infrastructure, ICT after Teacher Development). Empty groups are left out.
 */
export function groupByStrategicPillar<T>(items: readonly T[], pillarOf: (item: T) => PillarId) {
  const rank = (item: T) => { const pillar = pillarOf(item), sub = pillar === 'tlm' || pillar === 'ict' ? 1 : 0; return { component: pillarComponent(pillar), sub }; };
  return strategicPillars.map(group => ({
    id: group.id,
    name: group.name,
    items: items.filter(item => group.components.includes(rank(item).component)).sort((a, b) => {
      const x = rank(a), y = rank(b);
      return group.components.indexOf(x.component) - group.components.indexOf(y.component) || x.sub - y.sub;
    }),
  })).filter(group => group.items.length > 0);
}
export const componentSections: Record<PillarId,{name:string;department:string;href?:string}[]> = {
  infrastructure:[{name:'Infrastructure Projects',department:'physical',href:'/beap/infrastructure'},{name:'Teaching & Learning Materials',department:'academic',href:'/beap/tlm'}],
  tlm:[{name:'Teaching & Learning Materials',department:'academic',href:'/beap/tlm'}],
  quality:[{name:'Quality Assurance',department:'me',href:'/beap/quality'}],
  teachers:[{name:'Teacher Development',department:'teachers',href:'/beap/teachers'},{name:'ICT',department:'ict',href:'/beap/ict'}],
  ict:[{name:'ICT',department:'ict',href:'/beap/ict'}],
  sports:[{name:'Sports Activities',department:'academic',href:'/beap/sports'}],
  monitoring:[{name:'Supervision & Monitoring',department:'physical',href:'/beap/monitoring'}],
  curriculum:[{name:'Curriculum Purchase, Distribution & Training',department:'academic',href:'/beap/curriculum'}],
  sbmc:[{name:'SBMC',department:'social',href:'/beap/sbmc'}],
  planning:[{name:'Planning, EMIS & Data Platform',department:'planning',href:'/beap/planning'}],
  gscci:[{name:'Greening Schools, Climate Change & Safeguards',department:'academic',href:'/beap/gscci'}],
};
export type PillarSummary = { lineCount: number; schoolCount: number; budget: number };
// TLM is reviewed separately by Academic Services within the infrastructure allocation.
export const subebComponentDepartments = Object.fromEntries(Object.entries(componentSections).map(([id,sections])=>[id,sections[0].department])) as Record<PillarId,string>;
export const implementedPillars = ['infrastructure', 'sports', 'sbmc', 'tlm', 'monitoring', 'gscci', 'curriculum', 'quality', 'teachers', 'ict', 'planning'] as const;
export type ImplementedPillar = typeof implementedPillars[number];
export type BeapSummary = { wholeState: boolean; visiblePillars: ImplementedPillar[]; plan: import("./action-plans").ActionPlan; role: string; department: string | null; departments: string[]; canEdit: boolean; editablePillars: ImplementedPillar[]; infrastructure: PillarSummary; sports: PillarSummary; sbmc: PillarSummary; tlm: PillarSummary; monitoring: PillarSummary; gscci: PillarSummary; curriculum: PillarSummary; quality: PillarSummary; teachers: PillarSummary; ict: PillarSummary; planning: PillarSummary; total: PillarSummary };
