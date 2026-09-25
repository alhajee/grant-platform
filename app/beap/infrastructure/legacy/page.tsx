"use client";
import { beapPillars } from '@/lib/beap-pillars';
import { PlanStatusBadge } from "@/components/plan-status";
import { currentPlanHref, planPeriod, type ActionPlan } from "@/lib/action-plans";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2Icon, CheckIcon, ChevronDownIcon, EyeIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { ConstructionTypePicker, SchoolProjectDefaults } from "@/components/construction-type-picker";
import { ProjectCategorySelect } from "@/components/project-category-select";
import { AccountMenu } from "@/components/workspace-account-menu";
import { UbecLogo } from "@/components/ubec-logo";
import type { ConstructionType } from "@/lib/construction-types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { LocalUser } from "@/lib/local-session";

type School = { id: number; name: string; lga: string; level: string; location: "Rural" | "Urban" };
type LineItem = Omit<School, "id"> & { id: number; schoolId: number; code: string; projectType: string; duration: number; unitCost: number; quantity: number; rationale: string; strategy: string; longitude: string; latitude: string };
const money = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 2, maximumFractionDigits: 2 });

function PlanNavigation({ count, plan }: { count: number; plan: ActionPlan | null }) {
  return (
    <nav className="plan-navigation" aria-label="Main navigation">
      <span className="nav-period">BEAP{plan ? ` · ${planPeriod(plan)}` : ""}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label="Infrastructure — choose BEAP pillar">
            Infrastructure<ChevronDownIcon data-icon="inline-end" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={10} className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel>BEAP{plan ? ` · ${planPeriod(plan)}` : ""}</DropdownMenuLabel>
            <DropdownMenuItem aria-current="page">
              <Building2Icon />Infrastructure<Badge variant="secondary" className="ml-auto">{count}</Badge><CheckIcon />
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Not available yet</DropdownMenuLabel>
            {beapPillars.filter(p=>!p.href).map(pillar => (
              <DropdownMenuItem key={pillar.id} disabled>{pillar.name}</DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}

export default function InfrastructurePage() {
  const [projectTypes, setProjectTypes] = useState<ConstructionType[]>([]);
  const [projectId, setProjectId] = useState("");
  const [projectError, setProjectError] = useState("");
  const [schoolOverride, setSchoolOverride] = useState<{ duration: number; unitCost: number } | null>(null);
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [rationale, setRationale] = useState("");
  const [strategy, setStrategy] = useState("NCB");
  const [longitude, setLongitude] = useState("");
  const [latitude, setLatitude] = useState("");
  const [schools, setSchools] = useState<School[]>([]);
  const [items, setItems] = useState<LineItem[]>([]);
  const [user, setUser] = useState<LocalUser | null>(null);
  const [actionPlan, setActionPlan] = useState<ActionPlan | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [schoolError, setSchoolError] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<LineItem | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(true);
  const [compact, setCompact] = useState(false);
  const [mobileView, setMobileView] = useState("editor");
  const editorPaneRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);
  const project = projectTypes.find((type) => type.id === projectId) ?? null;
  const projectTotal = useMemo(() => items.reduce((sum, item) => sum + Math.round(item.unitCost * 100) * item.quantity, 0) / 100, [items]);
  const schoolCount = new Set(items.map((item) => item.schoolId)).size;
  const lgaCount = new Set(items.map((item) => item.lga)).size;
  const hasFormChanges = Boolean(selectedSchool || rationale || longitude || latitude || quantity !== "1" || strategy !== "NCB" || schoolOverride);
  const lineValues = schoolOverride ?? project;
  const lineTotal = Math.round((lineValues?.unitCost ?? 0) * 100) * (Number(quantity) || 0) / 100;

  const loadData = useCallback(async () => {
    const response = await fetch(currentPlanHref("/api/infrastructure"));
    if (!response.ok) throw new Error("Your project data could not be loaded. Please try again.");
    const payload = await response.json() as { plan: ActionPlan; canEdit: boolean; schools: School[]; lines: LineItem[]; constructionTypes: ConstructionType[] };
    if (!payload.canEdit) { window.location.replace(currentPlanHref('/beap/review')); return; }
    setActionPlan(payload.plan);
    setSchools(payload.schools);
    setItems(payload.lines);
    setProjectTypes(payload.constructionTypes);
  }, []);

  const initialize = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/session");
      if (response.status === 401) { window.location.replace("/"); return; }
      if (!response.ok) throw new Error("We couldn't connect to your workspace. Please try again.");
      const payload = await response.json() as { user: LocalUser };
      setUser(payload.user);
      await loadData();
      setLoadError("");
    } catch { setLoadError("We couldn't load your project data. Check your connection and try again."); }
    finally { setLoading(false); }
  }, [loadData]);

  useEffect(() => { void Promise.resolve().then(initialize); }, [initialize]);
  useEffect(() => {
    const element = workspaceRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width < 760));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function resetSchoolFields() {
    setSelectedSchool(null); setQuantity("1"); setRationale(""); setStrategy("NCB");
    setLongitude(""); setLatitude(""); setEditingId(null); setSchoolError("");
    setSchoolOverride(null); setProjectError("");
  }

  function selectConstructionType(type: ConstructionType | null) {
    setProjectId(type?.id ?? ""); setProjectError(""); setSchoolOverride(null);
  }

  function finishEditing() {
    if (savingRef.current || removing) return;
    if (hasFormChanges) { setLeaveOpen(true); return; }
    window.location.assign(currentPlanHref("/beap"));
  }

  function openEditor() {
    setEditorOpen(true);
    setMobileView("editor");
    requestAnimationFrame(() => document.getElementById("construction-type")?.focus());
  }

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    if (!project || !lineValues) {
      setProjectError("Select a saved construction type or create a new one.");
      document.getElementById("construction-type")?.focus();
      return;
    }
    if (!selectedSchool) {
      setSchoolError("Select a school from the directory.");
      document.getElementById("school")?.focus();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const response = await fetch(currentPlanHref("/api/infrastructure"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: editingId ? "update" : "create", id: editingId, schoolId: selectedSchool.id, projectType: projectId, duration: lineValues.duration, unitCost: lineValues.unitCost, quantity: Number(quantity), rationale, strategy, longitude, latitude }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not save this project line.");
      resetSchoolFields();
      toast.success(editingId ? "School line updated." : "School added to the plan.");
      try { await loadData(); } catch { setLoadError("Your line was saved, but the preview could not refresh. Reload the plan to see it."); }
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Unable to save. Please try again."); }
    finally { savingRef.current = false; setSaving(false); }
  }

  function editItem(item: LineItem) {
    setEditorOpen(true);
    setEditingId(item.id); setProjectId(item.projectType);
    setSchoolOverride({ duration: item.duration, unitCost: item.unitCost }); setProjectError("");
    setSelectedSchool(schools.find((school) => school.id === item.schoolId) ?? { id: item.schoolId, name: item.name, lga: item.lga, level: item.level, location: item.location });
    setQuantity(String(item.quantity)); setRationale(item.rationale); setStrategy(item.strategy);
    setLongitude(item.longitude); setLatitude(item.latitude); setSchoolError(""); setMobileView("editor");
    requestAnimationFrame(() => {
      editorPaneRef.current?.querySelector<HTMLElement>("[data-slot='scroll-area-viewport']")?.scrollTo({ top: 0 });
      document.getElementById("construction-type")?.focus({ preventScroll: true });
    });
  }

  async function removeItem() {
    if (!removeTarget || removing) return;
    setRemoving(true);
    try {
      const response = await fetch(currentPlanHref("/api/infrastructure"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id: removeTarget.id }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not remove this line.");
      setItems((current) => current.filter((item) => item.id !== removeTarget.id));
      if (editingId === removeTarget.id) resetSchoolFields();
      setRemoveTarget(null);
      toast.success("School line removed.");
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Unable to remove this line. Please try again."); }
    finally { setRemoving(false); }
  }

  const editor = (
    <section className="workspace-pane editor-pane" aria-label="Project editor" ref={editorPaneRef}>
      <ScrollArea className="pane-scroll">
        <div className="editor-canvas">
          <header className="editor-heading"><h1>{editingId ? "Edit school project" : "Add a school project"}</h1></header>
          {loadError && <Alert variant="destructive"><AlertTitle>Unable to refresh the plan</AlertTitle><AlertDescription>{loadError}<Button variant="outline" size="sm" disabled={loading} onClick={() => { setLoading(true); void initialize(); }}>{loading ? "Retrying…" : "Try again"}</Button></AlertDescription></Alert>}
          <form id="project-form" onSubmit={handleAdd}>
            <fieldset disabled={loading || saving || Boolean(loadError)} className="project-fields">
              <FieldGroup className="gap-6">
                <Field>
                  <FieldLabel htmlFor="category">Project category</FieldLabel>
                  <ProjectCategorySelect id="category" disabled={loading || saving || Boolean(loadError)} />
                </Field>
                <ConstructionTypePicker types={projectTypes} value={project} onSelect={selectConstructionType} error={projectError} disabled={loading || saving || Boolean(loadError)}
                  onCreated={(type) => { setProjectTypes((current) => [type, ...current.filter((item) => item.id !== type.id)]); selectConstructionType(type); }} />
                {project && <SchoolProjectDefaults key={project.id} type={project} override={schoolOverride} onChange={setSchoolOverride} disabled={loading || saving || Boolean(loadError)} />}
                <Separator />
                <div className="section-heading"><h2>School & location</h2></div>
                <Field data-invalid={Boolean(schoolError)}>
                  <FieldLabel htmlFor="school">School name</FieldLabel>
                  <Combobox items={schools} value={selectedSchool} onValueChange={(school) => { setSelectedSchool(school); setSchoolError(""); }} itemToStringLabel={(school: School) => school.name} itemToStringValue={(school: School) => String(school.id)} isItemEqualToValue={(a, b) => a.id === b.id}>
                    <ComboboxInput id="school" className="w-full" placeholder={loading ? "Loading school directory…" : "Search by school name…"} showClear aria-invalid={Boolean(schoolError)} aria-describedby={schoolError ? "school-error" : undefined} />
                    <ComboboxContent><ComboboxEmpty>No schools match your search.</ComboboxEmpty><ComboboxList>{(school: School) => <ComboboxItem key={school.id} value={school}><span className="school-option"><span>{school.name}</span><small>{school.lga} · {school.level}</small></span></ComboboxItem>}</ComboboxList></ComboboxContent>
                  </Combobox>
                  {schoolError && <FieldError id="school-error">{schoolError}</FieldError>}
                </Field>
                <dl className="school-facts"><div><dt>LGA</dt><dd>{selectedSchool?.lga ?? "—"}</dd></div><div><dt>School level</dt><dd>{selectedSchool?.level ?? "—"}</dd></div><div><dt>Location</dt><dd>{selectedSchool?.location ?? "—"}</dd></div></dl>
                <FieldGroup className="field-columns">
                  <Field><FieldLabel htmlFor="quantity">Quantity</FieldLabel><Input id="quantity" required min="1" step="1" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></Field>
                  <Field><FieldLabel htmlFor="strategy">Implementation strategy</FieldLabel><Select value={strategy} onValueChange={setStrategy}><SelectTrigger id="strategy" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="NCB">NCB</SelectItem><SelectItem value="National Shopping">National Shopping</SelectItem><SelectItem value="Direct Labour">Direct Labour</SelectItem></SelectGroup></SelectContent></Select></Field>
                </FieldGroup>
                <Separator />
                <div className="section-heading"><h2>Project justification</h2><p>Add supporting details for the review team.</p></div>
                <Field><FieldLabel htmlFor="rationale">Why is this project needed?</FieldLabel><Textarea id="rationale" rows={3} placeholder="e.g. Existing classrooms cannot accommodate current enrolment." value={rationale} onChange={(event) => setRationale(event.target.value)} /></Field>
                <FieldGroup className="field-columns">
                  <Field><FieldLabel htmlFor="longitude">Longitude</FieldLabel><Input id="longitude" type="number" step="any" min="-180" max="180" inputMode="decimal" placeholder="e.g. 11.04" value={longitude} onChange={(event) => setLongitude(event.target.value)} /></Field>
                  <Field><FieldLabel htmlFor="latitude">Latitude</FieldLabel><Input id="latitude" type="number" step="any" min="-90" max="90" inputMode="decimal" placeholder="e.g. 12.87" value={latitude} onChange={(event) => setLatitude(event.target.value)} /></Field>
                </FieldGroup>
              </FieldGroup>
            </fieldset>
          </form>
        </div>
      </ScrollArea>
      <div className="editor-footer">
        <div className="line-total"><span>Line total</span><strong>{project ? money.format(lineTotal) : "—"}</strong></div>
        <div className="footer-actions">
          {editingId && <Button variant="ghost" disabled={saving} onClick={resetSchoolFields}>Cancel</Button>}
          <Button type="submit" form="project-form" disabled={loading || saving || Boolean(loadError)} aria-busy={saving}>{saving ? <Spinner data-icon="inline-start" /> : editingId ? <CheckIcon data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}{saving ? "Saving…" : editingId ? "Update school" : "Add school"}</Button>
        </div>
      </div>
    </section>
  );

  const preview = (
    <section className="workspace-pane preview-pane" aria-label="Plan preview">
      <ScrollArea className="pane-scroll">
        <article className="preview-document">
          <div className="plan-overview"><div><span>Proposed budget</span>{loading ? <Skeleton className="h-8 w-48" /> : <strong>{money.format(projectTotal)}</strong>}</div><p>{schoolCount} {schoolCount === 1 ? "school" : "schools"}<span>·</span>{items.length} project {items.length === 1 ? "line" : "lines"}<span>·</span>{lgaCount} {lgaCount === 1 ? "LGA" : "LGAs"}</p></div>
          <section className="school-schedule" aria-label="School projects">
            {loading ? <div className="preview-loading" aria-label="Loading project lines"><Skeleton className="h-12 w-full" /><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div> : items.length ? (
              <div className="school-table">
                <Table className="table-fixed"><colgroup><col /><col className="quantity-column" /><col className="budget-column" /><col className="actions-column" /></colgroup>
                  <TableHeader><TableRow><TableHead>School / project</TableHead><TableHead className="text-center">Qty.</TableHead><TableHead className="text-right">Amount</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
                  <TableBody>{items.map((item) => <TableRow key={item.id} data-state={editingId === item.id ? "selected" : undefined}>
                    <TableCell className="school-cell"><div className="school-name">{item.name}</div><div className="school-location">{item.lga} · {item.location}</div><div className="school-project">{projectTypes.find((type) => type.id === item.projectType)?.name ?? "Construction type unavailable"}</div><div className="school-code">{item.code} · {item.duration} weeks</div><div className="compact-amount">{item.quantity} × {money.format(item.unitCost)}<strong>{money.format(Math.round(item.unitCost * 100) * item.quantity / 100)}</strong></div></TableCell>
                    <TableCell className="quantity-cell text-center">{item.quantity}</TableCell>
                    <TableCell className="budget-cell text-right tabular-nums">{money.format(Math.round(item.unitCost * 100) * item.quantity / 100)}</TableCell>
                    <TableCell className="line-actions"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" disabled={saving || removing} aria-label={"Actions for " + item.name}><MoreHorizontalIcon /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup><DropdownMenuItem onSelect={() => editItem(item)}><PencilIcon />Edit project line</DropdownMenuItem><DropdownMenuItem variant="destructive" onSelect={() => setRemoveTarget(item)}><Trash2Icon />Remove project line</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu></TableCell>
                  </TableRow>)}</TableBody>
                </Table>
                <div className="schedule-total"><span>Total proposed budget</span><strong>{money.format(projectTotal)}</strong></div>
              </div>
            ) : <Empty><EmptyHeader><EmptyMedia variant="icon"><Building2Icon /></EmptyMedia><EmptyTitle>No schools added yet</EmptyTitle><EmptyDescription>Add your first school project to start building this plan.</EmptyDescription></EmptyHeader></Empty>}
          </section>
        </article>
      </ScrollArea>
    </section>
  );

  return (
    <div className="portal-shell">
      <div className="portal-workspace" ref={workspaceRef}>
        {editorOpen ? <header className="workspace-header editor-page-header" aria-label="Plan editor">
          <div className="editor-header-heading">
            <Button variant="ghost" size="icon" disabled={saving || removing} aria-label="Back to all pillars" title="Back to all pillars" onClick={finishEditing}><XIcon /></Button>
            <span className="editor-plan-title">{actionPlan ? planPeriod(actionPlan) + " " : ""}Infrastructure plan</span>
            {actionPlan && <PlanStatusBadge status={actionPlan.status} />}
          </div>
          <div className="workspace-actions">
            <span className="save-status" aria-live="polite">{loading ? "Loading plan…" : saving ? <><Spinner />Saving…</> : loadError ? "Connection issue" : hasFormChanges ? "Unfinished school line" : <><CheckIcon aria-hidden="true" />All lines saved</>}</span>
            <Button disabled={loading || saving || removing} onClick={finishEditing}>Done</Button>
          </div>
        </header> : <header className="workspace-header">
          <div className="workspace-heading">
            <a className="portal-brand" href="/beap" onClick={(event) => { event.preventDefault(); finishEditing(); }} aria-label="Grant Portal — all pillars">
              <UbecLogo />
              <span className="header-brand-name"><strong>Grant Portal</strong><small>Yobe State SUBEB</small></span>
            </a>
            <Separator orientation="vertical" className="h-7" />
            <PlanNavigation count={items.length} plan={actionPlan} />
            {actionPlan && <PlanStatusBadge status={actionPlan.status} />}
          </div>
          <div className="workspace-actions">
            <span className="save-status" aria-live="polite">{loading ? "Loading plan…" : saving ? "Saving…" : loadError ? "Connection issue" : hasFormChanges ? "School line not added yet" : <><CheckIcon aria-hidden="true" />Plan up to date</>}</span>
            <Button id="resume-editor" size="sm" className="header-review" aria-label={hasFormChanges ? "Resume editing" : "Edit plan"} title={hasFormChanges ? "Resume editing" : "Edit plan"} onClick={openEditor}><PencilIcon data-icon="inline-start" /><span>{hasFormChanges ? "Resume editing" : "Edit plan"}</span></Button>
            <AccountMenu user={user} />
          </div>
        </header>}
        <main className="workspace-body" id="infrastructure">
          {!editorOpen ? preview : compact ? <Tabs value={mobileView} onValueChange={setMobileView} className="mobile-workspace"><div className="mobile-tabs"><TabsList className="w-full"><TabsTrigger value="editor"><PencilIcon />Editor</TabsTrigger><TabsTrigger value="preview"><EyeIcon />Preview ({items.length})</TabsTrigger></TabsList></div><TabsContent value="editor" className="mobile-pane">{editor}</TabsContent><TabsContent value="preview" className="mobile-pane">{preview}</TabsContent></Tabs> : (
            <ResizablePanelGroup orientation="horizontal" className="workspace-split" id="infrastructure-workspace">
              <ResizablePanel id="project-editor" defaultSize="48%" minSize="34%" className="split-panel">{editor}</ResizablePanel>
              <ResizableHandle withHandle aria-label="Resize editor and preview" />
              <ResizablePanel id="plan-preview" defaultSize="52%" minSize="36%" className="split-panel">{preview}</ResizablePanel>
            </ResizablePanelGroup>
          )}
        </main>
      </div>
      <AlertDialog open={Boolean(removeTarget)} onOpenChange={(open) => { if (!open && !removing) setRemoveTarget(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove this project line?</AlertDialogTitle><AlertDialogDescription>{removeTarget?.name} will be removed from the plan. You can add the school again later.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={removing}>Keep line</AlertDialogCancel><Button variant="destructive" disabled={removing} onClick={removeItem}>{removing && <Spinner data-icon="inline-start" />}{removing ? "Removing…" : "Remove line"}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent className="sm:max-w-sm" variant="inset-footer">
          <DialogHeader><DialogTitle>You have an unfinished school line</DialogTitle><DialogDescription>Add or update this school before leaving to keep your changes. Previously saved project lines are safe.</DialogDescription></DialogHeader>
          <DialogFooter><DialogClose asChild><Button variant="outline">Continue editing</Button></DialogClose><Button variant="destructiveOutline" onClick={() => window.location.assign(currentPlanHref("/beap"))}>Leave without saving</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
