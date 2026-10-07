import { implementedPillars, type ImplementedPillar } from './beap-pillars';
import { canViewComponent } from './subeb-access';
import type { Snapshot } from './plan-review';

/** The role/department ceiling: components whose card and status this viewer may see (details also need the stage gate, lib/stage-visibility.ts). */
export function visibleComponents(user: Parameters<typeof canViewComponent>[0]) {
  return implementedPillars.filter(component => canViewComponent(user, component));
}

/** The snapshot with only the given components' details (see `readStageVisibility`); the plan setup always stays. */
export function visibleSnapshot(snapshot: Snapshot, visible: readonly ImplementedPillar[]): Snapshot {
  const can = (pillar: ImplementedPillar) => visible.includes(pillar);
  // Explicit fields avoid leaking future additions or saved historical content.
  return {
    setup: snapshot.setup,
    infrastructure: can('infrastructure') ? snapshot.infrastructure : [],
    ...(can('infrastructure') ? { infrastructureDocuments: snapshot.infrastructureDocuments } : {}),
    sports: can('sports') ? snapshot.sports : [],
    ...(can('sbmc') ? { sbmc: snapshot.sbmc ?? [] } : {}),
    ...(can('tlm') ? { tlm: snapshot.tlm ?? [], tlmDistribution: snapshot.tlmDistribution ?? [] } : {}),
    ...(can('monitoring') ? { monitoring: snapshot.monitoring ?? [] } : {}),
    ...(can('gscci') ? { gscci: snapshot.gscci ?? [], gscciDistribution: snapshot.gscciDistribution ?? [] } : {}),
    ...(can('curriculum') ? { curriculum: snapshot.curriculum ?? [], curriculumDistribution: snapshot.curriculumDistribution ?? [] } : {}),
    ...(can('quality') ? { quality: snapshot.quality ?? [] } : {}),
    ...(can('teachers') ? { teachers: snapshot.teachers ?? [] } : {}),
    ...(can('ict') ? { ict: snapshot.ict ?? [] } : {}),
    ...(can('planning') ? { planning: snapshot.planning ?? [] } : {}),
    componentDocuments: (snapshot.componentDocuments ?? []).filter(d => can(d.component)),
  };
}
