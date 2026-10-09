# Infrastructure feedback, 9 October 2026

The client's feedback document for Infrastructure (Word file with 15 screenshots) and UBEC's Deliverables workbook
("Minimum Standard Requirements" and "Other Requirements" sheets). For each item: what the document and its screenshot
say, the change we make, and any open question. Open questions are collected at the end as well.

## 1. Plan-level "Drawings" upload (image11)

- **Reading:** remove the Drawings upload (the red "Drawings are required before packages can be saved or sent" drop zone) from the Infrastructure page.
- **Change:** none needed. Drawings were already retired on `main` (migration 052 era): no upload, nothing requires them, `POST /api/infrastructure/documents` refuses `kind=drawings`. Drawings uploaded earlier are still listed as "Earlier drawings" (removable) and stay in snapshots. We only confirm nothing else of it remains.

## 2. Read-only school details note (image2, repeated for Whole School)

- **Reading:** after a school is chosen, replace "These details come from the School register and cannot be changed here." with "These details come from DNEMIS and cannot be changed here and Establishment of new schools should be added on DNEMIS Platform", wherever the text appears, in a colour and in italics.
- **Change:** the Infrastructure School step (shared by New Construction, Whole School and Furniture/Equipment) now reads "These details come from DNEMIS and cannot be changed here. Establishment of new schools should be added on the DNEMIS platform." in italics and the warning ink colour. The "School components" note and the "enrolment needed" empty state also name DNEMIS. That is the only place the sentence appeared.

## 3. New Construction land declaration & agreement (image15)

- **Reading:** all three declarations must be ticked. (1) "Land required for this model is available" gets an info button ("all for new construction"). (2) "C of O, R of O or Community Agreement is available": once ticked, an upload appears right there for that agreement document. (3) "The land is free from encumbrances": no upload.
- **Change:**
  - UI: three checkboxes, all required. (1) has an info tooltip: the land must be enough for everything in the New Construction package (classroom blocks, ECCDE block, toilets, staff room, fence, gate house, playground and sports facilities). (2) shows the "C of O, R of O or Community Agreement" upload under the checkbox when ticked (required, PDF/DOCX/XLSX/PNG/JPEG as before). (3) has no upload. The separate "Land documentation" drop zone below the box is gone.
  - Rule (client and server, `packageProblem` and `POST /api/infrastructure/packages`): every declaration ticked ("Tick all three land declarations."), and at least one land document attached (for declaration 2). Still always required, whatever the Supporting documents setting says.
  - Send step (`infrastructureDocumentProblem`): a New Construction package needs all three ticks and a land document, otherwise sending Infrastructure is refused with the school's name.
  - Back-compatibility: packages saved with one or two ticks and one document per tick still load and display. Re-saving or sending them asks for the missing ticks; their extra land documents stay attached.

## 4. New Construction requirements: models, no "block of 3" (image10, image12)

- **Reading:** remove the classroom grouping step and replace it with the model chooser that was in Whole School (Whole School no longer has it). The chosen model decides the New Construction list (Model 1 = one block of 6 classrooms with office and store, etc., from the Deliverables workbook). No "block of 3 classrooms" rows. Remove the Cost basis, Strategy/Duration and Amount columns from the requirements table. The document ends with the Primary/ECCDE and JSS lists (Model 1 quantities); JSS and Primary lists differ.
- **Change:**
  - Steps: School → **Model** → Costing → Review. The Model step has the three model cards (Model 1 Small, Model 2 Medium, Model 3 Large; enrolment pre-selects and labels "Suggested for N learners") and, below them, the requirements table for the chosen model (Requirement, Quantity, Description; the fence row is editable, see item 5). The "Classroom grouping" (Standard/Storey) step is removed; `grouping` stays in the schema so older packages load, and is ignored.
  - The choice is stored in `input.model` and is required to save a New Construction package (the editor sets the suggested model when you enter the step). Older New Construction packages without it are costed to the model enrolment suggests until re-saved.
  - Classroom rows per model (no block of 3): Model 1 = 1 × "Block of 6 classrooms with office and store"; Model 2 = 1 × "Block of 9 classrooms with 2 offices and 2 stores"; Model 3 = 2 × "Block of 6 classrooms with office and store". The workbook's other Minimum Standard rows follow at the model's quantities.
  - Lists: **Primary/ECCDE** = classroom block(s), ECCDE block (2 classrooms, nanny station and sleeping bay), toilet, staff room, perimeter fence, gate house, ECCDE plastic furniture, dual desks, magnetic boards, teachers' furniture, HM/Principal furniture, storage shelves, play equipment, kindergarten bed, solar borehole, handwashing station, rainwater harvesting, playground, landscaping, football pitch, volleyball court, hybrid solar power (KVA by model), outdoor solar lights, complete construction package. **JSS** = the same without the ECCDE block, ECCDE furniture, play equipment and kindergarten bed. Model 1 quantities match the document's lists exactly. A school takes the JSS list when its DNEMIS level/classes are JSS only; otherwise (Primary, ECCDE, or mixed) the Primary/ECCDE list.
  - The New Construction requirements table (editor preview, workbook row details, UBEC view) shows Requirement, Quantity and Description only. The package's cost, strategy and duration show once, under the table ("Complete construction package · ₦X · Request for quotation · 6 months"), and the total in the footer.
  - Packages saved earlier keep their stored rows (including "Block of 3 classrooms") in snapshots; reopening one recalculates to the new list.

## 5. Perimeter fence editable in New Construction, Description column (image7)

- **Reading:** the "Perimeter wall fence with concertina security wire" row of the New Construction table must be editable (a metres text box as in Whole School), and the table gets a Description column.
- **Change:** in the Model step's requirements table, the fence row's Quantity cell is a metres input (`input.fenceLength`, required > 0: "Enter the fence length (metres)."). The table has a Description column with the workbook's specification for each row (for example "Set of chair + table with drawer", "20 sets per class for 40 learners"); the fence description says it is the length the site needs. The read-only tables show the same Description column.

## 6. Implementation strategy: listed options only (image3)

- **Reading:** "Request for Quotation, NCB, Credit SBMC": Infrastructure's implementation strategy may only be what is in that list, no free text.
- **Change:** Infrastructure strategies are now exactly **Request for quotation** (default), **NCB** and **Credit SBMC school account** (the platform's existing wording of "Credit SBMC"). Both selects (New Construction strategy and each Whole School intervention's strategy) list only these, and the schema refuses anything else on save ("Choose Request for quotation, NCB or Credit SBMC school account."). The other components' strategy lists are unchanged.
- Back-compatibility: a saved package with another strategy still loads; the select shows it as "<strategy> (no longer offered)" (disabled) until a listed one is chosen, and saving asks for one.

## 7. Whole School: enrolment, not models (images 8 and 4)

- **Reading:** remove every "Model" mention and the tagging of the school to a model in Whole School Renovation/Expansion; requirements come from enrolment. Classrooms = enrolment/30 (ECCDE), enrolment/40 (Primary), enrolment/40 (JSS); office = classrooms/3; store = classrooms/3; toilets = enrolment/20; staff room = one per 9 teachers; perimeter fence = editable box; magnetic boards = number of classrooms; teachers' furniture = number of classrooms. Enrolment comes from DNEMIS by level, and JSS and Primary have different lists.
- **Change:**
  - No model choice, no model badge, no "Model" text anywhere in Whole School (School step, audit, gaps, review, saved-packages table, package details). `input.model` from older packages is ignored (kept in the schema so they load).
  - Enrolment by level from DNEMIS `schools.enrolment_by_class`: `ECCDE` → ECCDE, `P1`–`P6` → Primary, `JSS1`–`JSS3` → JSS. A school with no class figures (hand-added) counts its whole enrolment at its register level. Teachers = DNEMIS `schools.teachers` (male + female).
  - **Rounding: always up** (`Math.ceil`), since a part classroom/toilet/room still has to be built. A figure of 0 gives 0.
  - Formulas (the info tooltip on each row shows the working, e.g. "Primary enrolment 230 ÷ 40 = 5.75 → 6"):
    - Classroom (Primary/JSS) = ⌈Primary ÷ 40⌉ + ⌈JSS ÷ 40⌉; Classroom · ECCDE = ⌈ECCDE ÷ 30⌉ (Primary/ECCDE list only).
    - Office = Store = ⌈all classrooms ÷ 3⌉.
    - Toilet = ⌈total enrolment ÷ 20⌉ compartments.
    - Staff room = ⌈teachers ÷ 9⌉; **1 when DNEMIS has no teacher figure** (open question).
    - Perimeter fence = metres entered (required > 0), as before.
    - Magnetic boards = Teachers' furniture = all classrooms.
    - Without a client formula, derived from the workbook remarks: dual-seater desks = 20 per Primary/JSS classroom; ECCDE plastic furniture = 6 sets per ECCDE classroom; storage shelf/cupboard = 1 per classroom, office and staff room (open question).
    - Without any formula, the workbook's fixed minimum standard: gate house 1, HM/Principal furniture 1, play equipment 1, kindergarten bed 1, solar borehole 1, handwashing 1, rainwater harvesting 1, playground 1, landscaping 1, football 1, volleyball 1, hybrid solar power system 1 (7.5 KVA up to 11 classrooms, 10 KVA above, mirroring the models), outdoor solar lights 20 (open question).
  - Lists: JSS-only schools leave out Classroom · ECCDE, ECCDE plastic furniture, play equipment and kindergarten bed; everyone else gets the full Primary/ECCDE list. The classroom row is labelled "Classroom · Primary", "Classroom · JSS" or "Classroom · Primary & JSS" by the school's learners.
  - New ECCDE classrooms are still costed as ECCDE blocks of 2 (⌈additional ÷ 2⌉ blocks). The "built in blocks of 3" rounding for other classrooms is dropped (the Additional figure is editable, item 11).

## 8. Info on editable column headers (image5)

- **Reading:** add an info icon (tooltip) on each header of the Whole School table that has a text box.
- **Change:** Required (the fence row is a metres box; other rows show the enrolment formula), Existing, Functional and Additional headers each have an info tooltip saying what to enter. The photo column (item 10) has one too.

## 9. No "general" in Whole School (image6)

- **Change:** "Classroom · General" / "6 general classrooms" / "non-functional general classrooms" and the remark "New general classrooms…" are gone from the catalogue, the audit, the photo note and the docs ("Classroom · Primary", "9 classrooms").

## 10. Photographic evidence per item (image14)

- **Reading:** "Attach photographic evidence for classrooms that are recorded as non-functional" must apply to each item with non-functional units, per row.
- **Change:** the audit table has a **Photos** column: every row with non-functional units (existing > functional) gets its own upload button and lists its photos (remove with the usual confirmation). Photos are `infrastructure_documents` of kind `photo`; the package's `input.photoKeys` maps each photo id to its audit row (no migration). Required only while the Supporting documents setting is **Required**: then every row with non-functional units needs at least one photo of its own (client and server: "Attach photographic evidence for Toilet: non-functional units are recorded."). When the setting is **Optional**, the uploads are offered and nothing is refused. The general photo upload on the Review step is removed; photos uploaded there earlier (no row) are listed there and still count for the classroom row, as the old rule did.

## 11. Minimum Standard tab: no Standard / Extra columns, Additional editable (image13)

- **Change:** columns are Deliverable (info tooltip with the formula and remark), Required, Existing, Functional, Non-functional, Photos, Additional, Status. **Additional** is a number box whose placeholder is the calculated shortfall (required − functional; for buildings required − existing, since non-functional buildings are renovated). Leave it blank to use the calculation, or type another figure (any whole number ≥ 0) to override it; a "Calculated: N" hint shows under an overridden figure. The figure entered is what gets costed (new construction / supply). The "Extra beyond standard" input is gone: an older row's extra is added to its calculated Additional, so older packages keep their totals.

## 12. "Other Requirements" → "Other Facilities" (image9)

- **Change:** renamed everywhere (tab, badge, catalogue comments, package details, docs). Helper line under the tab: "For optional deliverables refer to minimum standard." Standard, Required and Extra beyond standard columns are removed for these rows; Additional is editable (blank = 0). A row joins the package once any figure is entered, as before.

## Not changed

- Furniture/Equipment: no item in the document mentions it, so it is unchanged (free-text items, quantity × unit cost). Its packages have no strategy.
- Infrastructure/TLM split and shared pool, timelines, line codes, stage visibility and the envelope meter are unchanged.

## Open questions for the client

1. **Models vs enrolment.** The document says both "the Models will determine the classrooms" (New Construction) and "we are not using models anymore, we are using enrollment". We read it as: models drive New Construction, enrolment drives Whole School. Confirm, or say whether New Construction should also be sized from enrolment.
2. **Model 2 classroom block.** Without "block of 3", Model 2's 9 classrooms are shown as one "Block of 9 classrooms with 2 offices and 2 stores". Is that the right wording (or e.g. one block of 6 plus one of 3, or a storey block)?
3. **JSS quantities.** The document's JSS list keeps Model 1's 16 toilets, 7 magnetic boards and 16 teachers' furniture sets, which in the workbook include the ECCDE classroom. We used the document's figures as written. Should JSS drop the ECCDE share (12 toilets, 6 boards, 15 sets)?
4. **Description column (item 5).** We added a read-only Description column with the workbook specification for each row. Did the client instead want a free-text description the SUBEB fills in (e.g. for the fence)?
5. **Office/store rounding.** Office = Store = ⌈classrooms ÷ 3⌉ gives 3 offices for 7 classrooms, where the workbook's Model 1 has 1. Is rounding up right, or should it round down / to the nearest?
6. **Formulas the client did not give** (Whole School): dual desks (20 per classroom), ECCDE furniture (6 per ECCDE classroom) and storage (1 per classroom, office and staff room) follow the workbook remarks; gate house, HM furniture, play equipment, kindergarten bed, WASH, playground, landscaping, sports, solar power and solar lights use the workbook's fixed standard. Confirm or give formulas.
7. **Teachers missing.** When DNEMIS has no teacher count, we require 1 staff room. OK?
8. **ECCDE rows with no ECCDE learners.** A primary school with no ECCDE learners still shows ECCDE classrooms (0 required), ECCDE furniture (0), play equipment and kindergarten bed (1 each) because the document's Primary/ECCDE list includes them. Should those rows be hidden when DNEMIS shows no ECCDE learners?
9. **Editable Additional.** Is any figure allowed (also below the calculated shortfall), and should an override need a reason? We allow any whole number ≥ 0 and keep the calculated figure visible.
10. **Land documents for older packages.** Older New Construction packages with fewer than three ticks are refused at the send step until reopened and all three ticked. Acceptable, or should existing plans be exempt?
11. **Strategy list.** We read the list as exactly Request for quotation, NCB and Credit SBMC school account. Are any other methods (e.g. Direct payment to vendor) allowed for Infrastructure?
