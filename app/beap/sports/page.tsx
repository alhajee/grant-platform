"use client";
import { PlanStatusBadge } from "@/components/plan-status";
import { currentPlanHref, planPeriod, type ActionPlan } from "@/lib/action-plans";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, EyeIcon, PencilIcon, PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { SportsAllocationFields, SportsBudgetFields, emptyAllocation, emptyBudget, type AllocationDraft, type BudgetDraft, type FormErrors } from "@/components/sports-plan-forms";
import { SportsBeneficiaryPreview, SportsBudgetPreview, type SportsTarget } from "@/components/sports-plan-preview";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupSeparator } from "@/components/ui/button-group";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { sportsAllocationSchema, sportsBudget, sportsCatalogError, sportsLineSchema, sportsLineTotal, sportsMoney as money, sportsSections, type SportsPlan } from "@/lib/sports";

const blankPlan: SportsPlan = { lines: [], allocations: [], schools: [] };
type PlanView = "budget" | "allocation";

export default function SportsPage() {
  const [plan, setPlan] = useState<SportsPlan>(blankPlan);
  const [actionPlan, setActionPlan] = useState<ActionPlan | null>(null);
  const [view, setView] = useState<PlanView>("budget");
  const [budget, setBudget] = useState<BudgetDraft>(emptyBudget);
  const [budgetBaseline, setBudgetBaseline] = useState<BudgetDraft>(emptyBudget);
  const [allocation, setAllocation] = useState<AllocationDraft>(emptyAllocation);
  const [allocationBaseline, setAllocationBaseline] = useState<AllocationDraft>(emptyAllocation);
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<SportsTarget | null>(null);
  const [pendingAction, setPendingAction] = useState<{ run: () => void; leaving: boolean } | null>(null);
  const [compact, setCompact] = useState(false);
  const [mobileView, setMobileView] = useState("editor");
  const workspaceRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLElement>(null);
  const savingRef = useRef(false);
  const budgetDirty = JSON.stringify(budget) !== JSON.stringify(budgetBaseline);
  const allocationDirty = JSON.stringify(allocation) !== JSON.stringify(allocationBaseline);
  const dirty = budgetDirty || allocationDirty;
  const disabled = loading || saving || Boolean(loadError);
  const editingId = view === "budget" ? budget.id : allocation.id;
  const hasEquipment = plan.lines.some((line) => line.section === "equipment");
  const budgetTotal = sportsBudget(plan.lines);
  const schoolCount = new Set(plan.allocations.map((item) => item.schoolId)).size;
  const equipmentQuantity = plan.lines.filter((line) => line.section === "equipment").reduce((sum, line) => sum + line.quantity, 0);
  const allocatedQuantity = plan.allocations.reduce((sum, item) => sum + item.quantity, 0);
  const lineTotal = sportsLineTotal({ quantity: Number(budget.quantity) || 0, unitCost: Number(budget.unitCost) || 0 });
  const orderedTargets: SportsTarget[] = view === "budget"
    ? sportsSections.flatMap((section) => plan.lines.filter((line) => line.section === section.id).map((item) => ({ entity: "budget" as const, item })))
    : [...new Set(plan.allocations.map((item) => item.schoolId))].flatMap((schoolId) => plan.allocations.filter((item) => item.schoolId === schoolId).map((item) => ({ entity: "allocation" as const, item })));
  const editingIndex = editingId ? orderedTargets.findIndex((target) => target.item.id === editingId) : -1;

  const loadPlan = useCallback(async () => {
    const response = await fetch(currentPlanHref("/api/sports"), { cache: "no-store" });
    if (response.status === 401) { window.location.replace("/"); throw new Error("Sign in to continue."); }
    if (!response.ok) throw new Error("Your sports plan could not be loaded. Please try again.");
    const data = await response.json() as SportsPlan & { plan: ActionPlan; canEdit: boolean };
    if (!data.canEdit) { window.location.replace(currentPlanHref('/beap/review')); return; }
    setActionPlan(data.plan);
    setPlan(data);
    setLoadError("");
  }, []);

  const initialize = useCallback(async () => {
    try { await loadPlan(); }
    catch (cause) { setLoadError(cause instanceof Error ? cause.message : "Unable to load your plan."); }
    finally { setLoading(false); }
  }, [loadPlan]);

  useEffect(() => { void Promise.resolve().then(initialize); }, [initialize]);
  useEffect(() => {
    const element = workspaceRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width < 760));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!dirty && !saving) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saving]);
  useEffect(() => {
    if (!editingId) return;
    const frame = requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-sports-row-id="${view}-${editingId}"]`)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest", inline: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [editingId, view]);

  function resetBudget(next: BudgetDraft = emptyBudget) { setBudget(next); setBudgetBaseline(next); setErrors({}); }
  function resetAllocation(next: AllocationDraft = emptyAllocation) { setAllocation(next); setAllocationBaseline(next); setErrors({}); }
  function changeAllocation(next: AllocationDraft) {
    if (next.schoolId && next.schoolId !== allocation.schoolId) {
      const existingActivities = [...new Set(plan.allocations.filter((item) => item.schoolId === next.schoolId && item.id !== next.id).map((item) => plan.lines.find((line) => line.id === item.lineId)?.description).filter((description): description is string => Boolean(description)))];
      const selectedSchool = plan.schools.find((item) => item.id === next.schoolId);
      if (existingActivities.length) toast.warning(`${selectedSchool?.name ?? "This school"} is already used in this plan.`, { id: `school-reuse-sports-${next.schoolId}`, description: `This school already has ${existingActivities.join(", ")}. Continue only if this is intentional.`, duration: 10000, closeButton: true, className: "school-reuse-toast" });
    }
    setAllocation(next); setErrors({});
  }
  function changeView(next: PlanView) { setView(next); setErrors({}); setMobileView("editor"); }
  function focusEditor(id: string) {
    setMobileView("editor");
    requestAnimationFrame(() => {
      editorRef.current?.querySelector<HTMLElement>("[data-slot='scroll-area-viewport']")?.scrollTo({ top: 0 });
      document.getElementById(id)?.focus({ preventScroll: true });
    });
  }
  function finish() {
    if (savingRef.current) return;
    if (dirty) setPendingAction({ run: () => window.location.assign(currentPlanHref("/beap/review")), leaving: true });
    else window.location.assign(currentPlanHref("/beap/review"));
  }
  function edit(target: SportsTarget) {
    const run = () => {
      changeView(target.entity);
      if (target.entity === "budget") { resetBudget({ ...target.item, quantity: String(target.item.quantity), unitCost: String(target.item.unitCost) }); focusEditor("sports-description"); }
      else { resetAllocation({ ...target.item, quantity: String(target.item.quantity) }); focusEditor("allocation-quantity"); }
    };
    if (target.entity === "budget" ? budgetDirty : allocationDirty) setPendingAction({ run, leaving: false });
    else run();
  }
  function navigateLine(offset: number) {
    const target = orderedTargets[editingIndex + offset];
    if (target) edit(target);
  }
  async function write(body: unknown) {
    const response = await fetch(currentPlanHref("/api/sports"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Could not save your change.");
  }
  async function refreshAfterSave() {
    try { await loadPlan(); }
    catch { setLoadError("Your change was saved, but the preview could not refresh. Try again to load the latest plan."); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current || disabled) return;
    const parsed = view === "budget"
      ? sportsLineSchema.safeParse({ ...budget, quantity: Number(budget.quantity), unitCost: Number(budget.unitCost) })
      : sportsAllocationSchema.safeParse({ ...allocation, quantity: Number(allocation.quantity) });
    // Same catalogue rules as the API; a saved line keeps its legacy sport/sub-activity if unchanged.
    const saved = view === "budget" && editingId ? plan.lines.find((line) => line.id === editingId) : undefined;
    const rule = parsed.success && view === "budget" ? sportsCatalogError({ ...budget, activityType: budget.activityType.trim(), description: budget.description.trim() }, plan.lines, editingId) : null;
    const ruleError = rule && !(rule.field === "activityType" && saved?.section === budget.section && saved.activityType === budget.activityType.trim()) ? { [rule.field]: rule.message } : null;
    if (!parsed.success || ruleError) {
      const nextErrors = ruleError ?? (parsed.success ? {} : Object.fromEntries(parsed.error.issues.map((issue) => [issue.path[0], issue.message])));
      if (nextErrors.schoolId) nextErrors.schoolId = "Choose a school from the directory.";
      if (nextErrors.lineId) nextErrors.lineId = "Choose an equipment item from your budget.";
      setErrors(nextErrors);
      requestAnimationFrame(() => editorRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return;
    }
    setErrors({}); savingRef.current = true; setSaving(true);
    try {
      await write({ ...parsed.data, entity: view, action: editingId ? "update" : "create", ...(editingId ? { id: editingId } : {}) });
      if (view === "budget") resetBudget({ ...emptyBudget, section: budget.section, activityType: budget.activityType.trim() });
      else resetAllocation({ ...emptyAllocation, schoolId: allocation.schoolId, longitude: allocation.longitude, latitude: allocation.latitude });
      toast.success(editingId ? "Line updated." : view === "budget" ? "Budget line added." : "Equipment allocated to school.");
      await refreshAfterSave();
      focusEditor(view === "budget" ? "sports-description" : "sports-equipment");
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Unable to save. Please try again."); }
    finally { savingRef.current = false; setSaving(false); }
  }
  async function remove() {
    if (!removeTarget || savingRef.current) return;
    savingRef.current = true; setSaving(true);
    try {
      await write({ entity: removeTarget.entity, action: "delete", id: removeTarget.item.id });
      if (removeTarget.entity === "budget" && budget.id === removeTarget.item.id) resetBudget();
      if (removeTarget.entity === "allocation" && allocation.id === removeTarget.item.id) resetAllocation();
      setRemoveTarget(null);
      toast.success("Line removed.");
      await refreshAfterSave();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Unable to remove the line."); }
    finally { savingRef.current = false; setSaving(false); }
  }

  const editor = <section className="workspace-pane editor-pane" aria-label="Sports editor" ref={editorRef}>
    <ScrollArea className="pane-scroll"><div className="editor-canvas">
      <header className="editor-heading"><h1>{view === "budget" ? editingId ? "Edit budget item" : "Add a budget item" : editingId ? "Edit school allocation" : "Add a beneficiary school"}</h1></header>
      {loadError && <Alert variant="destructive"><AlertTitle>Unable to refresh the plan</AlertTitle><AlertDescription>{loadError}<Button variant="outline" size="sm" disabled={loading} onClick={() => { setLoading(true); void initialize(); }}>Try again</Button></AlertDescription></Alert>}
      <form id="sports-form" onSubmit={save} noValidate><fieldset className="project-fields" disabled={disabled}>
        {view === "budget" ? <SportsBudgetFields draft={budget} onChange={(next) => { setBudget(next); setErrors({}); }} plan={plan} errors={errors} disabled={disabled} /> : <SportsAllocationFields draft={allocation} onChange={changeAllocation} plan={plan} errors={errors} disabled={disabled} />}
      </fieldset></form>
      {view === "allocation" && !hasEquipment && !loading && !loadError && <div className="sports-empty-action"><Button variant="outline" onClick={() => changeView("budget")}>Go to budget</Button></div>}
    </div></ScrollArea>
    <div className="editor-footer">
      <div className="line-total"><span>{view === "budget" ? "Total cost" : "Items for this school"}</span><strong>{view === "budget" ? money.format(Number.isFinite(lineTotal) ? lineTotal : 0) : Number(allocation.quantity || 0).toLocaleString()}</strong></div>
      <div className="footer-actions">{editingId && <><Button variant="ghost" disabled={saving} onClick={() => {
        const run = () => view === "budget" ? resetBudget() : resetAllocation();
        if (view === "budget" ? budgetDirty : allocationDirty) setPendingAction({ run, leaving: false }); else run();
      }}>Cancel</Button><ButtonGroup className="sports-line-navigation" aria-label={`${view === "budget" ? "Budget item" : "School allocation"} navigation`}><Button size="icon" variant="secondary" aria-label={`Previous ${view === "budget" ? "budget item" : "school allocation"}`} title="Previous item" disabled={disabled || editingIndex <= 0} onClick={() => navigateLine(-1)}><ChevronLeftIcon /></Button><ButtonGroupSeparator /><Button size="icon" variant="secondary" aria-label={`Next ${view === "budget" ? "budget item" : "school allocation"}`} title="Next item" disabled={disabled || editingIndex < 0 || editingIndex === orderedTargets.length - 1} onClick={() => navigateLine(1)}><ChevronRightIcon /></Button></ButtonGroup></>}
        <Button type="submit" form="sports-form" disabled={disabled || (view === "allocation" && !hasEquipment)} aria-busy={saving}>{saving ? <Spinner data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}{saving ? "Saving…" : editingId ? "Save changes" : view === "budget" ? "Add item" : "Add to school"}</Button>
      </div>
    </div>
  </section>;

  const preview = <section className="workspace-pane preview-pane" aria-label="Sports plan preview"><ScrollArea className="pane-scroll"><article className="preview-document sports-preview">
    <div className="plan-overview"><div><span>{view === "budget" ? "Proposed sports budget" : "Beneficiary schools"}</span>{loading ? <Skeleton className="h-8 w-48" /> : <strong>{view === "budget" ? money.format(budgetTotal) : `${schoolCount} ${schoolCount === 1 ? "school" : "schools"}`}</strong>}</div><p>{view === "budget" ? `${plan.lines.length} budget ${plan.lines.length === 1 ? "line" : "lines"} · ${schoolCount} beneficiary ${schoolCount === 1 ? "school" : "schools"}` : `${allocatedQuantity.toLocaleString()} of ${equipmentQuantity.toLocaleString()} equipment items allocated`}</p></div>
    {loading ? <div className="preview-loading"><Skeleton className="h-20 w-full" /><Skeleton className="h-32 w-full" /></div> : view === "budget" ? <>
      {plan.lines.length > 0 && <dl className="sports-breakdown">{sportsSections.map((section) => <div key={section.id}><dt>{section.label} · {section.share}% indicative</dt><dd>{money.format(sportsBudget(plan.lines.filter((line) => line.section === section.id)))}<small className="block font-normal text-muted-foreground">{budgetTotal ? Math.round(sportsBudget(plan.lines.filter((line) => line.section === section.id)) / budgetTotal * 100) : 0}% of budget</small></dd></div>)}</dl>}
      <SportsBudgetPreview plan={plan} disabled={disabled} onEdit={edit} onRemove={setRemoveTarget} editingId={budget.id} />
    </> : <SportsBeneficiaryPreview plan={plan} disabled={disabled} onEdit={edit} onRemove={setRemoveTarget} editingId={allocation.id} />}
  </article></ScrollArea></section>;

  return <div className="portal-shell"><div className="portal-workspace" ref={workspaceRef}>
    <header className="workspace-header editor-page-header" aria-label="Plan editor"><div className="editor-header-heading"><Button variant="ghost" size="icon" disabled={saving} aria-label="Back to the plan" onClick={finish}><XIcon /></Button><span className="editor-plan-title">{actionPlan ? planPeriod(actionPlan) + " " : ""}Sports activities plan</span>{actionPlan && <PlanStatusBadge status={actionPlan.status} />}</div><div className="workspace-actions"><span className="save-status" aria-live="polite">{loading ? "Loading plan…" : saving ? "Saving…" : loadError ? "Connection issue" : dirty ? "Unfinished line" : <><CheckIcon aria-hidden="true" />All lines saved</>}</span><Button disabled={saving || loading} onClick={finish}>Done</Button></div></header>
    <Tabs value={view} onValueChange={(value) => changeView(value as PlanView)} className="sports-workspace">
      <div className="sports-view-tabs"><TabsList><TabsTrigger value="budget" disabled={saving}>Budget</TabsTrigger><TabsTrigger value="allocation" disabled={saving}>Beneficiary schools</TabsTrigger></TabsList></div><Separator />
      <TabsContent value={view} className="workspace-body sports-view-content"><main className="workspace-body sports-main" id="sports">
        {compact ? <Tabs value={mobileView} onValueChange={setMobileView} className="mobile-workspace"><div className="mobile-tabs"><TabsList className="w-full"><TabsTrigger value="editor"><PencilIcon />Editor</TabsTrigger><TabsTrigger value="preview"><EyeIcon />Preview</TabsTrigger></TabsList></div><Separator /><TabsContent value="editor" className="mobile-pane">{editor}</TabsContent><TabsContent value="preview" className="mobile-pane">{preview}</TabsContent></Tabs> : <ResizablePanelGroup orientation="horizontal" className="workspace-split" id="sports-workspace"><ResizablePanel id="sports-editor" defaultSize="48%" minSize="34%" className="split-panel">{editor}</ResizablePanel><ResizableHandle withHandle aria-label="Resize sports editor and preview" /><ResizablePanel id="sports-preview" defaultSize="52%" minSize="36%" className="split-panel">{preview}</ResizablePanel></ResizablePanelGroup>}
      </main></TabsContent>
    </Tabs>
  </div>
    <AlertDialog open={Boolean(removeTarget)} onOpenChange={(open) => { if (!open && !saving) setRemoveTarget(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove this {removeTarget?.entity === "budget" ? "budget line" : "school allocation"}?</AlertDialogTitle><AlertDialogDescription>{removeTarget?.entity === "budget" ? `“${removeTarget.item.description}” will be removed from the sports budget. Equipment with school allocations must be unallocated first.` : "This equipment allocation will be removed from the school. Your procurement budget will stay the same."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving}>Keep line</AlertDialogCancel><Button variant="destructive" disabled={saving} onClick={remove}>{saving && <Spinner data-icon="inline-start" />}{saving ? "Removing…" : "Remove line"}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <Dialog open={Boolean(pendingAction)} onOpenChange={(open) => { if (!open) setPendingAction(null); }}><DialogContent className="sm:max-w-sm" variant="inset-footer"><DialogHeader><DialogTitle>You have an unfinished line</DialogTitle><DialogDescription>Save this line to keep your changes. Previously saved budget items and school allocations are safe.</DialogDescription></DialogHeader><DialogFooter><DialogClose asChild><Button variant="outline">Continue editing</Button></DialogClose><Button variant="destructiveOutline" onClick={() => { const action = pendingAction; setPendingAction(null); if (action?.leaving) { resetBudget(); resetAllocation(); } requestAnimationFrame(() => action?.run()); }}>{pendingAction?.leaving ? "Leave without saving" : "Discard changes"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
