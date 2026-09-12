"use client";

import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type School = { name: string; lga: string; level: string; location: "Rural" | "Urban" };
type ProjectType = { id: string; name: string; duration: number; unitCost: number };
type LineItem = School & { id: number; code: string; projectType: string; quantity: number; rationale: string; strategy: string; longitude: string; latitude: string };

const projectTypes: ProjectType[] = [
  { id: "six-classrooms", name: "A block of six (6) classrooms storey building", duration: 20, unitCost: 95503308.31 },
  { id: "two-classrooms", name: "A block of two (2) classrooms, office and store", duration: 20, unitCost: 30350753.56 },
  { id: "staff-rooms", name: "Two (2) rooms, toilet, kitchen and store", duration: 20, unitCost: 22583110.30 },
  { id: "vip-toilet", name: "Four (4) holes VIP toilet", duration: 20, unitCost: 9567503.30 },
  { id: "learning-shade", name: "Learning shade for Non-Formal Education Centres", duration: 20, unitCost: 6524600.50 },
];

const schools: School[] = [
  { name: "Musa Kazir MEGA School Gashua", lga: "Bade", level: "Primary", location: "Urban" },
  { name: "Nasarawa PS", lga: "Damaturu", level: "Primary", location: "Urban" },
  { name: "Daya PS", lga: "Fika", level: "Primary", location: "Urban" },
  { name: "Helma Saleh PS", lga: "Potiskum", level: "Primary", location: "Urban" },
  { name: "Madamuwa PS", lga: "Bade", level: "Primary", location: "Rural" },
  { name: "Daskum PS", lga: "Bursari", level: "Primary", location: "Rural" },
  { name: "Zanna Zakariya", lga: "Damaturu", level: "ECCDE", location: "Urban" },
  { name: "Ben-Kalio", lga: "Damaturu", level: "ECCDE", location: "Urban" },
  { name: "Borno Kichi PS", lga: "Fune", level: "Primary", location: "Rural" },
  { name: "Nyole PS", lga: "Fune", level: "Primary", location: "Rural" },
  { name: "Gubana PS", lga: "Fune", level: "Primary", location: "Rural" },
  { name: "Dumbulwa", lga: "Fika", level: "ECCDE", location: "Urban" },
  { name: "GDJSS Kelluri", lga: "Geidam", level: "JSS", location: "Rural" },
  { name: "Islamiya", lga: "Gujba", level: "ECCDE", location: "Urban" },
  { name: "Kasatchiya PS", lga: "Gujba", level: "Primary", location: "Rural" },
  { name: "Daddawel PS", lga: "Gujba", level: "Primary", location: "Rural" },
  { name: "Jama'are PS", lga: "Gujba", level: "Primary", location: "Rural" },
  { name: "Manawaji PS", lga: "Gulani", level: "Primary", location: "Rural" },
  { name: "Guzumbana PS", lga: "Jakusko", level: "Primary", location: "Rural" },
  { name: "Makadari Nomadic", lga: "Karasuwa", level: "Primary", location: "Rural" },
  { name: "Kalgidi PS", lga: "Machina", level: "Primary", location: "Rural" },
  { name: "Lemari PS", lga: "Nangere", level: "Primary", location: "Rural" },
  { name: "Goni Musa Goni Yusuf Islamiya PS", lga: "Nguru", level: "Primary", location: "Urban" },
  { name: "Afunori PS", lga: "Nguru", level: "Primary", location: "Rural" },
  { name: "Nurul-Aulad Islamiya PS", lga: "Nguru", level: "Primary", location: "Urban" },
  { name: "Yindiski", lga: "Potiskum", level: "ECCDE", location: "Urban" },
  { name: "GDJSS Babbangida", lga: "Tarmuwa", level: "JSS", location: "Urban" },
  { name: "GDJSS Toshia", lga: "Yunusari", level: "JSS", location: "Rural" },
  { name: "GDJSS Yusufari Model", lga: "Yusufari", level: "JSS", location: "Urban" },
  { name: "Tullowa PS", lga: "Bursari", level: "Primary", location: "Rural" },
  { name: "GDJSS Bulabulin", lga: "Damaturu", level: "JSS", location: "Urban" },
  { name: "Damagum Nursery", lga: "Fune", level: "ECCDE", location: "Urban" },
  { name: "GDJSS Gubana", lga: "Fune", level: "JSS", location: "Rural" },
  { name: "Kurmi PS", lga: "Fika", level: "Primary", location: "Rural" },
  { name: "Kukuwa Tasha PS", lga: "Gujba", level: "Primary", location: "Rural" },
  { name: "Buni Gari (Kasugula) PS", lga: "Gujba", level: "Primary", location: "Urban" },
  { name: "Dutchi PS", lga: "Gulani", level: "Primary", location: "Rural" },
  { name: "Jaba PS", lga: "Jakusko", level: "Primary", location: "Rural" },
  { name: "Karasuwa Model PS", lga: "Karasuwa", level: "Primary", location: "Rural" },
  { name: "Dawasa PS", lga: "Nangere", level: "Primary", location: "Rural" },
  { name: "Ari Kime Nursery", lga: "Potiskum", level: "ECCDE", location: "Urban" },
  { name: "Biriri PS", lga: "Tarmuwa", level: "Primary", location: "Rural" },
  { name: "GDJSS Dapchi", lga: "Bursari", level: "JSS", location: "Urban" },
  { name: "Modu Mustapha PS", lga: "Damaturu", level: "Primary", location: "Urban" },
  { name: "Lawan Kalam PS", lga: "Fune", level: "Primary", location: "Rural" },
  { name: "Mai Malah PS", lga: "Fune", level: "Primary", location: "Rural" },
  { name: "Gadaka Central Nursery", lga: "Fika", level: "ECCDE", location: "Urban" },
  { name: "Hausari Nursery", lga: "Geidam", level: "ECCDE", location: "Urban" },
  { name: "Buni Gari PS", lga: "Gulani", level: "Primary", location: "Urban" },
  { name: "Njibulwa PS", lga: "Gulani", level: "Primary", location: "Rural" },
  { name: "Guyik PS", lga: "Jakusko", level: "Primary", location: "Rural" },
  { name: "Faji Ganari PS", lga: "Karasuwa", level: "Primary", location: "Rural" },
  { name: "Konkomma PS", lga: "Machina", level: "Primary", location: "Rural" },
  { name: "Watinani PS", lga: "Nangere", level: "Primary", location: "Rural" },
  { name: "Ari Kime II Nursery", lga: "Potiskum", level: "ECCDE", location: "Urban" },
  { name: "Kara PS", lga: "Potiskum", level: "Primary", location: "Urban" },
  { name: "Babbangida Central PS", lga: "Tarmuwa", level: "Primary", location: "Urban" },
  { name: "Zajibiri PS", lga: "Yunusari", level: "Primary", location: "Rural" },
  { name: "Guya PS", lga: "Yusufari", level: "Primary", location: "Rural" },
];

const seeded: LineItem[] = schools.slice(0, 4).map((school, index) => ({
  ...school,
  id: index + 1,
  code: `UBC/SUBEB/NC/${String(index + 1).padStart(3, "0")}/2025`,
  projectType: "six-classrooms",
  quantity: 1,
  rationale: "Overcrowded classrooms",
  strategy: "NCB",
  longitude: ["11.04", "11.95", "11.04", "11.13"][index],
  latitude: ["12.87", "11.76", "11.54", "11.71"][index],
}));

const money = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 });

export default function InfrastructurePage() {
  const [projectId, setProjectId] = useState(projectTypes[0].id);
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [rationale, setRationale] = useState("");
  const [strategy, setStrategy] = useState("NCB");
  const [longitude, setLongitude] = useState("");
  const [latitude, setLatitude] = useState("");
  const [items, setItems] = useState<LineItem[]>(seeded);
  const [editingId, setEditingId] = useState<number | null>(null);

  const project = projectTypes.find((item) => item.id === projectId) ?? projectTypes[0];
  const projectTotal = useMemo(() => items.reduce((sum, item) => {
    const itemProject = projectTypes.find((type) => type.id === item.projectType) ?? projectTypes[0];
    return sum + itemProject.unitCost * item.quantity;
  }, 0), [items]);

  function resetSchoolFields() {
    setSelectedSchool(null);
    setQuantity("1");
    setRationale("");
    setStrategy("NCB");
    setLongitude("");
    setLatitude("");
    setEditingId(null);
  }

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSchool) {
      toast.error("Choose a school before adding this line.");
      return;
    }
    const next: LineItem = {
      ...selectedSchool,
      id: editingId ?? Date.now(),
      code: editingId ? items.find((item) => item.id === editingId)?.code ?? "" : `UBC/SUBEB/NC/${String(items.length + 1).padStart(3, "0")}/2025`,
      projectType: projectId,
      quantity: Math.max(1, Number(quantity) || 1),
      rationale,
      strategy,
      longitude,
      latitude,
    };
    if (editingId) {
      setItems((current) => current.map((item) => item.id === editingId ? next : item));
      toast.success(`${selectedSchool.name} updated.`);
    } else {
      setItems((current) => [...current, next]);
      toast.success(`${selectedSchool.name} added to this project.`);
    }
    resetSchoolFields();
  }

  function editItem(item: LineItem) {
    setEditingId(item.id);
    setProjectId(item.projectType);
    setSelectedSchool({ name: item.name, lga: item.lga, level: item.level, location: item.location });
    setQuantity(String(item.quantity));
    setRationale(item.rationale);
    setStrategy(item.strategy);
    setLongitude(item.longitude);
    setLatitude(item.latitude);
    window.scrollTo({ top: 480, behavior: "smooth" });
  }

  function removeItem(id: number) {
    setItems((current) => current.filter((item) => item.id !== id));
    if (editingId === id) resetSchoolFields();
    toast.success("School line removed.");
  }

  return (
    <div className="beap-shell">
      <aside className="beap-sidebar">
        <a className="portal-brand" href="/beap/infrastructure">
          <span className="portal-mark">UBE</span>
          <span><strong>Grant Portal</strong><small>Planning & submissions</small></span>
        </a>
        <p className="side-kicker">Workspace</p>
        <nav className="side-nav" aria-label="Primary navigation">
          <a href="#overview">Overview</a>
          <a className="active" href="#annual-beap">Annual BEAP <span className="side-count">25</span></a>
          <a href="#review">Review & submit</a>
        </nav>
        <p className="side-kicker">BEAP pillars</p>
        <nav className="side-nav" aria-label="BEAP pillars">
          <a className="active" href="#infrastructure">Infrastructure <span className="side-count">4</span></a>
          <a href="#access">Access initiatives</a>
          <a href="#quality">Quality</a>
          <a href="#systems">Systems optimisation</a>
          <a href="#sports">Sports development</a>
          <a href="#gscci">GSCCI</a>
        </nav>
        <div className="sidebar-foot"><strong>Yobe SUBEB</strong><span>Data entry workspace</span></div>
      </aside>

      <section className="beap-workspace">
        <header className="workspace-header">
          <div className="workspace-title"><span className="mobile-brand">UBE</span><div><strong>Yobe State SUBEB</strong><span>2025 Annual BEAP · Matching Grant</span></div></div>
          <div className="workspace-actions">
            <Badge variant="secondary" data-mobile-hide="true">Draft</Badge>
            <Button variant="outline" size="sm" onClick={() => toast.success("Draft saved locally.")}>Save draft</Button>
            <Button size="sm" onClick={() => toast.info("Your plan is ready for the Executive Secretary review queue.")}>Submit to ES</Button>
          </div>
        </header>

        <main className="beap-main" id="infrastructure">
          <div className="beap-breadcrumb">Annual BEAP &nbsp;/&nbsp; 2025 &nbsp;/&nbsp; <span>Infrastructure</span></div>
          <div className="beap-hero">
            <div><h1>Infrastructure projects</h1><p>Group schools under a construction type, add each location, and review the resulting project lines before submission.</p></div>
            <div className="progress-block"><div className="progress-label"><span>Infrastructure completion</span><strong>34%</strong></div><Progress value={34} /></div>
          </div>

          <div className="stat-grid">
            <div className="stat-card"><span>2025 matching grant</span><strong>{money.format(7109285169)}</strong></div>
            <div className="stat-card"><span>Infrastructure plan</span><strong>{money.format(5331963877)}</strong></div>
            <div className="stat-card"><span>Current construction lines</span><strong>{items.length} schools · {money.format(projectTotal)}</strong></div>
          </div>

          <div className="category-strip" aria-label="Infrastructure categories">
            {['Construction', 'Renovation', 'Furniture & equipment', 'Water & sanitation', 'Geophysical survey', 'Teaching & learning materials'].map((category, index) => <button className={`category-pill${index === 0 ? ' active' : ''}`} key={category} type="button" onClick={() => index ? toast.info(`${category} will use its own 2025 template fields.`) : undefined}>{category}</button>)}
          </div>

          <div className="entry-grid">
            <Card className="form-card">
              <CardHeader><div className="card-eyebrow">Construction</div><CardTitle>Project and school details</CardTitle><CardDescription>Select a project once, then add all schools receiving it.</CardDescription></CardHeader>
              <form onSubmit={handleAdd}>
                <CardContent>
                  <FieldGroup>
                    <Field><FieldLabel>Construction type</FieldLabel><Select value={projectId} onValueChange={setProjectId}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{projectTypes.map((type) => <SelectItem value={type.id} key={type.id}>{type.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
                    <div className="form-two-col">
                      <Field><FieldLabel>Duration</FieldLabel><Input value={`${project.duration} weeks`} readOnly /></Field>
                      <Field><FieldLabel>Unit cost</FieldLabel><Input value={money.format(project.unitCost)} readOnly /></Field>
                    </div>
                    <Separator />
                    <Field><FieldLabel>School name</FieldLabel><Combobox items={schools} value={selectedSchool} onValueChange={setSelectedSchool} itemToStringValue={(school: School) => school.name}><ComboboxInput className="w-full" placeholder="Start typing a school name…" showClear /><ComboboxContent><ComboboxEmpty>No matching school found.</ComboboxEmpty><ComboboxList>{(school: School) => <ComboboxItem key={`${school.name}-${school.lga}`} value={school}><span><strong>{school.name}</strong><small className="block text-muted-foreground">{school.lga} · {school.level}</small></span></ComboboxItem>}</ComboboxList></ComboboxContent></Combobox></Field>
                    <div className="auto-fields"><div><span>LGA</span><strong>{selectedSchool?.lga ?? "Filled from school record"}</strong></div><div><span>School level</span><strong>{selectedSchool?.level ?? "—"}</strong></div><div><span>Location</span><strong>{selectedSchool?.location ?? "—"}</strong></div></div>
                    <div className="form-two-col">
                      <Field><FieldLabel>Quantity</FieldLabel><Input min="1" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></Field>
                      <Field><FieldLabel>Implementation strategy</FieldLabel><Select value={strategy} onValueChange={setStrategy}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="NCB">NCB</SelectItem><SelectItem value="National Shopping">National Shopping</SelectItem><SelectItem value="Direct Labour">Direct Labour</SelectItem></SelectGroup></SelectContent></Select></Field>
                    </div>
                    <Field><FieldLabel>Justification / rationale</FieldLabel><Textarea placeholder="Why is this project needed at this school?" value={rationale} onChange={(event) => setRationale(event.target.value)} /></Field>
                    <div className="form-two-col"><Field><FieldLabel>GPS longitude</FieldLabel><Input inputMode="decimal" placeholder="e.g. 11.04" value={longitude} onChange={(event) => setLongitude(event.target.value)} /></Field><Field><FieldLabel>GPS latitude</FieldLabel><Input inputMode="decimal" placeholder="e.g. 12.87" value={latitude} onChange={(event) => setLatitude(event.target.value)} /></Field></div>
                    <div className="cost-panel"><div><span>Calculated line total</span><strong>{money.format(project.unitCost * (Number(quantity) || 0))}</strong></div><Badge variant="outline">{project.duration} weeks</Badge></div>
                  </FieldGroup>
                </CardContent>
                <CardFooter className="form-actions">{editingId && <Button type="button" variant="outline" onClick={resetSchoolFields}>Cancel</Button>}<Button type="submit">{editingId ? "Update school" : "Add school to project"}</Button></CardFooter>
              </form>
            </Card>

            <Card className="table-card">
              <CardHeader><div className="card-eyebrow">Live preview</div><CardTitle>Added schools</CardTitle><CardDescription>Each school becomes a reviewable line in the 2025 submission.</CardDescription><CardAction><Badge variant="secondary">{items.length} lines</Badge></CardAction></CardHeader>
              <CardContent>
                <div className="table-wrap"><Table><TableHeader><TableRow><TableHead>School</TableHead><TableHead>LGA</TableHead><TableHead>Qty.</TableHead><TableHead>Location</TableHead><TableHead className="text-right">Cost</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>{items.map((item) => { const rowProject = projectTypes.find((type) => type.id === item.projectType) ?? projectTypes[0]; return <TableRow key={item.id}><TableCell className="school-cell"><strong>{item.name}</strong><span>{item.code} · {item.level}</span></TableCell><TableCell>{item.lga}</TableCell><TableCell>{item.quantity}</TableCell><TableCell><Badge variant="outline">{item.location}</Badge></TableCell><TableCell className="text-right font-medium">{money.format(rowProject.unitCost * item.quantity)}</TableCell><TableCell><div className="row-actions"><Button size="sm" variant="ghost" onClick={() => editItem(item)}>Edit</Button><Button size="sm" variant="ghost" onClick={() => removeItem(item.id)}>Remove</Button></div></TableCell></TableRow>; })}</TableBody></Table></div>
                <div className="summary-bar"><div><span>Selected construction type</span><strong>{project.name}</strong></div><div className="summary-total"><span>Current project total</span><strong>{money.format(projectTotal)}</strong></div></div>
              </CardContent>
            </Card>
          </div>
        </main>
      </section>
    </div>
  );
}
