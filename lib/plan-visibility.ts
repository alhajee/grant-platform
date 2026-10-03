import { implementedPillars } from './beap-pillars';
import { canViewComponent } from './subeb-access';
import type { Snapshot } from './plan-review';

export function visibleComponents(user: Parameters<typeof canViewComponent>[0]) {
  return implementedPillars.filter(component => canViewComponent(user, component));
}

export function visibleSnapshot(snapshot: Snapshot, user: Parameters<typeof canViewComponent>[0]): Snapshot {
  // Explicit fields avoid leaking future additions or saved historical content.
  return {
    setup: snapshot.setup,
    infrastructure: canViewComponent(user, 'infrastructure') ? snapshot.infrastructure : [],
    ...(canViewComponent(user, 'infrastructure') ? { infrastructureDocuments: snapshot.infrastructureDocuments } : {}),
    sports: canViewComponent(user, 'sports') ? snapshot.sports : [],
    ...(canViewComponent(user, 'sbmc') ? { sbmc: snapshot.sbmc ?? [] } : {}),
    ...(canViewComponent(user, 'tlm') ? { tlm: snapshot.tlm ?? [], tlmDistribution: snapshot.tlmDistribution ?? [] } : {}),
    ...(canViewComponent(user, 'monitoring') ? { monitoring: snapshot.monitoring ?? [] } : {}),
    ...(canViewComponent(user, 'gscci') ? { gscci: snapshot.gscci ?? [], gscciDistribution: snapshot.gscciDistribution ?? [] } : {}),
    ...(canViewComponent(user, 'curriculum') ? { curriculum: snapshot.curriculum ?? [], curriculumDistribution: snapshot.curriculumDistribution ?? [] } : {}),
    ...(canViewComponent(user, 'quality') ? { quality: snapshot.quality ?? [] } : {}),
    ...(canViewComponent(user, 'teachers') ? { teachers: snapshot.teachers ?? [] } : {}),
    ...(canViewComponent(user, 'ict') ? { ict: snapshot.ict ?? [] } : {}),
    componentDocuments: (snapshot.componentDocuments ?? []).filter(d => canViewComponent(user, d.component)),
  };
}
