import assert from 'node:assert/strict';
import {packageSchema,modelFor,auditGaps,calculateInfrastructure,packageProblem,requirements,minimumKeys,strategies,schoolFacts,wholeRequirements,newConstructionRows,photoEvidenceProblem,rowPhotoIds,landDocumentProblem,deliverableDescription,itemOperation} from '../lib/infrastructure-model.ts';
assert.deepEqual([1,240,241,320,321].map(modelFor),[0,0,1,1,2]);
const land={available:true,documented:true,unencumbered:true};
const make=(kind,extra={})=>packageSchema.parse({kind,schoolId:1,components:['Primary'],land,...extra});

// Strategy: the procurement list (UBEC159, 28 October 2026), client and server schema; Credit SBMC school account is retired.
assert.deepEqual([...strategies],['Request for quotation','ICB','NCB','Market survey','Single source/Direct contracting','Prequalification','Quality and cost based','Consultant Qualification','Least cost','Non-Consultancy','Non-Applicable']);
assert.equal(make('new').classroomStrategy,'Request for quotation','Request for quotation is the default strategy');
const retired=packageSchema.safeParse({kind:'new',schoolId:1,components:['Primary'],classroomStrategy:'Credit SBMC school account'});
assert.equal(retired.success,false);assert.match(retired.error.issues[0].message,/from the list/);
assert.equal(packageSchema.safeParse({kind:'whole',schoolId:1,components:['Primary'],packageCosts:{office:{cost:1,strategy:'Direct payment to vendor',duration:'1 week'}}}).success,false,'Whole School intervention strategies are listed-only too');
for(const strategy of strategies)assert.ok(packageSchema.safeParse({kind:'new',schoolId:1,components:['Primary'],classroomStrategy:strategy}).success);

// New Construction: the model decides the list; no block of 3; Primary/ECCDE and JSS lists differ (the document's Model 1 lists).
const label=rows=>rows.map(r=>`${r.label}=${r.quantity}`);
const primaryModel1=['Block of 6 classrooms with office and store=1','ECCDE block · 1 classroom, nanny station and sleeping bay=1','Toilet=12','Staff Room=1','Gate House=1','ECCDE Plastic Furniture (set of 1 table and 5 chairs)=6','Dual-Seater Desk (wood + metal frame)=120','Magnetic Board=7','Teachers’ Furniture=16','HM/Principal Furniture=1','Storage Shelf/Cupboard=9','Play Equipment=1','Kindergarten Bed=1','Solar Borehole (with overhead tank)=1','Handwashing Station=1','Rainwater Harvesting System=1','Playground=1','Soft & Hard Landscaping=1','Football Pitch (with associated facilities)=1','Volleyball Court (with associated facilities)=1','Hybrid Solar Power System · 7.5 KVA=1','All-in-one Standalone Outdoor Solar Light=20','Perimeter wall fence with concertina security wire=150'];
assert.deepEqual(label(newConstructionRows(0,'primary',150)),primaryModel1);
const jssModel1=label(newConstructionRows(0,'jss',150));
assert.deepEqual(jssModel1,primaryModel1.filter(r=>!/^(ECCDE|Play Equipment|Kindergarten Bed)/.test(r)),'JSS leaves out the ECCDE block, ECCDE furniture, play equipment and kindergarten bed');
assert.equal(jssModel1.length,19);
// UBEC67: the Small School model has 1 ECCDE classroom; the others build a 2-classroom block.
assert.deepEqual([0,1,2].map(m=>newConstructionRows(m,'primary',1).find(r=>/^eccdeBlock/.test(r.key)).key),['eccdeBlock1','eccdeBlock','eccdeBlock']);
for(const model of [0,1,2])assert.ok(!newConstructionRows(model,'primary',1).some(r=>/block3|block6os/.test(r.key)||/Block of 3/.test(r.label)),'No block of 3 classrooms');
assert.deepEqual(newConstructionRows(1,'primary',1).filter(r=>r.key.startsWith('classBlock')).map(r=>[r.key,r.quantity]),[['classBlock9',1]]);
assert.deepEqual(newConstructionRows(2,'primary',1).filter(r=>r.key.startsWith('classBlock')).map(r=>[r.key,r.quantity]),[['classBlock6',2]]);
assert.match(newConstructionRows(2,'primary',1).find(r=>r.key==='solarPower').label,/10 KVA/);
assert.match(deliverableDescription('teachersFurniture',0),/chair \+ table with drawer/,'Description column comes from the workbook');
assert.match(deliverableDescription('fence'),/metres/);
const built=make('new',{model:0,fenceLength:150,lumpSum:450,duration:'6 months'});
let r=calculateInfrastructure(built,300);
assert.equal(r.model,0,'The chosen model wins over the enrolment suggestion');assert.equal(r.modelLabel,'Model 1 · Small School');
assert.equal(r.total,450);assert.equal(r.vat,0);assert.equal(r.items.find(i=>i.key==='fence').quantity,150,'The fence length entered is the fence row quantity');
assert.equal(r.items.find(i=>i.key==='package').strategy,'Request for quotation');
// Descriptions (17 October 2026): every row carries one; New Construction defaults to the workbook text, an edit replaces it.
assert.equal(r.items.find(i=>i.key==='classBlock6').description,deliverableDescription('classBlock6',0));
const described=make('new',{model:0,fenceLength:150,lumpSum:450,descriptions:{classBlock6:'Two-storey block on the north plot',fence:''}});
r=calculateInfrastructure(described,300);
assert.equal(r.items.find(i=>i.key==='classBlock6').description,'Two-storey block on the north plot');
assert.equal(r.items.find(i=>i.key==='fence').description,'','A cleared description stays blank');
assert.throws(()=>make('new',{descriptions:{notARow:'x'}}),/Unknown requirement/);
// Other facilities on New Construction (October 2026): the figures entered join the package's requirements; blank or 0 leaves a row out.
const withOthers=make('new',{model:0,fenceLength:150,lumpSum:450,otherFacilities:{scienceLab:2,workshop:0}});
r=calculateInfrastructure(withOthers,300);
assert.equal(r.items.find(i=>i.key==='scienceLab').quantity,2);assert.ok(!r.items.some(i=>i.key==='workshop'));
assert.equal(r.total,450,'still one lump-sum package');
assert.throws(()=>make('new',{otherFacilities:{classroomPri:3}}),/Other Facilities/,'only Other Facilities rows');
assert.throws(()=>make('new',{descriptions:{fence:'x'.repeat(501)}}),/500 characters/);
assert.ok(!calculateInfrastructure({...built,components:['JSS']},300).items.some(i=>i.key==='eccdeBlock'),'A JSS school gets the JSS list');
assert.equal(packageProblem(built,300),null);
assert.equal(packageProblem({...built,land:{available:true,documented:false,unencumbered:true}},300),'Tick all three land declarations');
assert.equal(packageProblem({...built,land:{available:false,documented:true,unencumbered:false}},300),'Tick all three land declarations','One declaration is no longer enough');
assert.equal(packageProblem({...built,model:undefined},300),'Choose the school model');
assert.equal(packageProblem({...built,fenceLength:0},300),'Enter the perimeter fence length (metres)');
// Two land uploads (October 2026): evidence the land is available, and the C of O / R of O / Community Agreement.
assert.equal(landDocumentProblem(built,{landArea:0,land:1}),'Attach the document showing the land required for this model is available');
assert.equal(landDocumentProblem(built,{landArea:1,land:0}),'Attach the C of O, R of O or Community Agreement document');
assert.equal(landDocumentProblem(built,{landArea:1,land:1}),null);
// HOPE costing (retired on save, kept for older packages) still prices rows and VAT.
const hope={...built,targeting:'hope',classroomStrategy:'NCB',prices:{classBlock6:100,eccdeBlock1:50,toilet:70,dualDesk:2,fence:3},fenceLength:10,contingency:5,preliminaries:10};
r=calculateInfrastructure(hope,300);
assert.equal(r.classroomSubtotal,100,'Block amounts are lump sums');assert.equal(r.otherSubtotal,405);assert.equal(r.vat,37.88,"NCB puts the classroom blocks in the VAT base");assert.equal(r.total,542.88);

// Whole School: requirements from DNEMIS enrolment by level, always rounded up (client feedback, October 2026).
const school={level:'Primary',male:140,female:135,enrolmentByClass:{ECCDE:{male:25,female:20},P1:{male:60,female:50},P2:{male:55,female:65}},teachers:{male:10,female:9}};
const facts=schoolFacts(school);assert.deepEqual(facts,{total:275,eccde:45,primary:230,jss:0,teachers:19});
let need=wholeRequirements(facts,'primary');const qty=key=>need[key].qty;
assert.equal(qty('classroomPri'),6,'230 ÷ 40 = 5.75 → 6');assert.equal(qty('classroomEccde'),2,'45 ÷ 30 = 1.5 → 2');
assert.equal(qty('office'),3,'8 classrooms ÷ 3 → 3');assert.equal(qty('store'),3);
assert.equal(qty('toilet'),12,'ECCDE learners excluded: 230 ÷ 20 = 11.5 → 12');assert.equal(qty('staffroom'),3,'19 teachers ÷ 9 → 3');
assert.equal(qty('magneticBoard'),8);assert.equal(qty('teachersFurniture'),8,'Boards and teachers’ furniture equal the classrooms');
assert.equal(qty('dualDesk'),120);assert.equal(qty('eccdeFurniture'),12);assert.equal(qty('storageShelf'),14);
assert.equal(qty('gatehouse'),1);assert.equal(qty('solarLight'),20);
assert.match(need.classroomPri.basis,/230 ÷ 40 = 5\.75 → 6/);
need=wholeRequirements({total:80,eccde:0,primary:80,jss:0,teachers:null},'primary');
assert.equal(need.classroomPri.qty,2,'Exact division is not rounded');assert.equal(need.staffroom.qty,1,'No teacher figure in DNEMIS: 1 staff room');assert.equal(need.classroomEccde.qty,0);
assert.deepEqual(schoolFacts({level:'JSS',male:70,female:60,enrolmentByClass:null,teachers:null}),{total:130,eccde:0,primary:0,jss:130,teachers:null},'No class figures: the whole enrolment at the register level');
const jssFacts=schoolFacts({level:'JSS',male:70,female:60,enrolmentByClass:{JSS1:{male:40,female:30},JSS2:{male:30,female:30}},teachers:{male:4,female:3}});
const jssWhole=make('whole',{components:['JSS']});const jssGaps=auditGaps(jssWhole,jssFacts);
assert.ok(!jssGaps.some(g=>['classroomEccde','eccdeFurniture','playEquipment','kgBed'].includes(g.key)),'JSS list leaves out the ECCDE rows');
assert.equal(jssGaps.find(g=>g.key==='classroomPri').label,'Classroom · JSS');assert.equal(jssGaps.find(g=>g.key==='classroomPri').required,4,'130 ÷ 40 → 4');
assert.ok(!jssGaps.some(g=>/general|model/i.test(g.label+g.standard)),'No “general” or model wording in Whole School');

const whole=make('whole',{fenceRequired:50});whole.audit=Object.fromEntries(minimumKeys.map(key=>[key,{existing:0,functional:0,extra:0}]));
whole.audit.classroomPri={existing:4,functional:2,extra:0};whole.audit.dualDesk={existing:100,functional:80,extra:0};whole.audit.fence={existing:20,functional:10,extra:0};
whole.descriptions={scienceLab:'Physics and chemistry lab',dualDesk:'Replace broken desks in JSS 1'};whole.audit.scienceLab={existing:0,functional:0,additional:1,extra:0};
let gaps=auditGaps(whole,facts);const gap=key=>gaps.find(g=>g.key===key);
assert.equal(gap('classroomPri').label,'Classroom · Primary');
assert.equal(gap('classroomPri').calculated,2,'Civil shortfall: 6 required − 4 existing (no block-of-3 rounding)');assert.equal(gap('classroomPri').nonFunctional,2);
assert.equal(gap('dualDesk').toBuild,40,'120 required − 80 functional');assert.equal(gap('fence').toBuild,30);
// Additional is editable: the auditor's figure replaces the calculation and is what gets costed.
whole.audit.dualDesk={...whole.audit.dualDesk,additional:55};whole.audit.classroomEccde={existing:0,functional:0,additional:3,extra:0};
gaps=auditGaps(whole,facts);
assert.equal(gap('dualDesk').additional,55);assert.equal(gap('dualDesk').calculated,40);assert.equal(gap('dualDesk').toBuild,55);
for(const item of calculateInfrastructure(whole,facts).items)whole.packageCosts[item.key]={cost:10,strategy:'NCB',duration:'4 weeks'};
r=calculateInfrastructure(whole,facts);
assert.equal(r.modelLabel,'','Whole School has no model');assert.deepEqual(r.basis,{eccde:45,primary:230,jss:0,teachers:19});
assert.equal(r.items.find(i=>i.key==='dualDesk').quantity,55);assert.equal(r.items.find(i=>i.key==='dualDesk').total,550);
assert.equal(r.items.find(i=>i.key==='classroomEccde-construct').quantity,2,'3 ECCDE classrooms → 2 ECCDE blocks of 2');
assert.equal(r.items.find(i=>i.key==='classroomPri-renovate').total,10);
assert.equal(r.items.find(i=>i.key==='scienceLab-construct').description,'Physics and chemistry lab','Whole School: an Other Facilities description');
assert.equal(r.items.find(i=>i.key==='dualDesk').description,'Replace broken desks in JSS 1','Whole School: a Minimum Standard description');
assert.equal(r.items.find(i=>i.key==='toilet').description,'','No description entered: blank');
const toilet=r.items.find(i=>i.key==='toilet');assert.ok(toilet,'the audit has a toilet gap');assert.equal(toilet.operation,'Supply / New Construction');assert.ok(r.items.filter(i=>i.operation==='Supply / installation').every(i=>i.key!=='toilet'));
assert.equal(itemOperation({key:'toilet',operation:'Supply / installation'}),'Supply / New Construction','older toilets read the new wording');assert.equal(itemOperation({key:'staffRoom',operation:'Supply / installation'}),'Supply / installation');
assert.equal(packageProblem(whole,facts),null);
assert.equal(packageSchema.safeParse({...whole,audit:{classroomPri:{existing:2,functional:3,extra:0}}}).success,false);
// Other Facilities: optional; a row joins once any figure (also Additional alone) is entered.
const other=auditGaps({...whole,audit:{...whole.audit,scienceLab:{additional:1,extra:0}}},facts).find(g=>g.key==='scienceLab');
assert.equal(other.included,true);assert.equal(other.toBuild,1);assert.equal(other.required,0);
// Older rows: a retired “Extra beyond standard” figure is added to the calculated Additional, so totals are kept.
const legacy=auditGaps({...whole,audit:{...whole.audit,toilet:{existing:10,functional:10,extra:2}}},facts).find(g=>g.key==='toilet');
assert.equal(legacy.calculated,4,'12 − 10 + 2 extra');
// Photographic evidence, per row with non-functional units.
const photo='11111111-1111-4111-8111-111111111111',other2='22222222-2222-4222-8222-222222222222';
assert.match(photoEvidenceProblem(whole,gaps,[]),/Classroom · Primary: non-functional units/);
const withPhoto={...whole,documentIds:[photo],photoKeys:{[photo]:'classroomPri'}};
assert.match(photoEvidenceProblem(withPhoto,gaps,[photo]),/Dual-Seater Desk/,'Each row needs its own photo');
const allPhotos={...whole,documentIds:[photo,other2,'33333333-3333-4333-8333-333333333333'],photoKeys:{[photo]:'classroomPri',[other2]:'dualDesk','33333333-3333-4333-8333-333333333333':'fence'}};
assert.equal(photoEvidenceProblem(allPhotos,gaps,allPhotos.documentIds),null);
assert.deepEqual(rowPhotoIds({documentIds:[other2],photoKeys:{}},[other2],'classroomPri'),[other2],'A photo attached before per-row evidence counts for the classroom row');
assert.deepEqual(rowPhotoIds({documentIds:[other2],photoKeys:{}},[other2],'dualDesk'),[]);
assert.equal(photoEvidenceProblem(make('new'),[],[]),null);
const met=make('whole');for(const key of minimumKeys){const req=key==='fence'?0:wholeRequirements(facts,'primary')[key].qty;met.audit[key]={existing:req,functional:req,extra:0};}
assert.equal(calculateInfrastructure(met,facts).items.length,0,'A school that meets every requirement needs nothing');
// An older Whole School package with a model and the old shape still parses; its model is ignored.
const old=packageSchema.parse({kind:'whole',schoolId:1,components:['Primary'],model:2,grouping:'storey',audit:{classroomPri:{existing:3,functional:2,extra:1}},classroomStrategy:'Request for quotation'});
assert.equal(old.model,2);assert.equal(calculateInfrastructure(old,facts).modelLabel,'');assert.equal(auditGaps(old,facts).find(g=>g.key==='classroomPri').required,6);
assert.equal(requirements.filter(r=>r.category==='other').length,30);
const furniture=make('furniture');furniture.furniture=[{description:'Desk',quantity:3,cost:10.15}];assert.equal(calculateInfrastructure(furniture,200).total,30.45);
// UBEC171: Whole School classrooms, ECCDE classrooms and toilets grouped by block, in groups of blocks of different sizes (revised 7 November 2026).
{
 const {groupIntoBlocks,toBlockGroups,blockGroupingText,blockGroupText,blockGroupingProblem,classroomBlockCounts,drawingsDocumentProblem}=await import('../lib/infrastructure-model.ts');
 assert.equal(groupIntoBlocks(0,[{count:1,classrooms:3,offices:1,stores:1}]),null,'nothing to group');assert.equal(groupIntoBlocks(5,undefined),null,'not grouped');assert.equal(groupIntoBlocks(5,[]),null,'no groups');
 // The client's example: 24 classrooms as 2 blocks of 6, 2 blocks of 3 and 1 block of 6 (groups saved without toilets or type read as Primary/JSS, no toilets).
 const mixed=[{count:2,classrooms:6,offices:1,stores:1},{count:2,classrooms:3,offices:0,stores:1},{count:1,classrooms:6,offices:2,stores:0}];
 const g=groupIntoBlocks(24,mixed);assert.deepEqual([g.grouped.classrooms,g.left.classrooms,g.blocks,g.offices,g.stores,g.toiletsWithClassrooms],[24,0,5,4,4,0]);
 assert.equal(blockGroupingText(g),'2 blocks of 6 classrooms, 1 office, 1 store; 2 blocks of 3 classrooms, 1 store; 1 block of 6 classrooms, 2 offices');
 const part=groupIntoBlocks(24,mixed.slice(0,1));assert.equal(part.left.classrooms,12);assert.match(blockGroupingText(part),/· 12 classrooms not in a block yet$/);
 // Packages saved before 7 November 2026 kept one make-up: full blocks plus one smaller block.
 assert.deepEqual(toBlockGroups(7,{classrooms:3,offices:1,stores:1}),[{classrooms:3,offices:1,stores:1,count:2,toilets:0,classroomType:'primary'},{classrooms:1,offices:1,stores:1,count:1,toilets:0,classroomType:'primary'}]);
 assert.equal(blockGroupingText(groupIntoBlocks(6,{classrooms:3,offices:0,stores:2})),'2 blocks of 3 classrooms, 2 stores');
 // Wording: the client's "classroom, office, store, toilet"; ECCDE blocks; toilet blocks on their own.
 assert.equal(blockGroupText({count:2,classrooms:6,offices:1,stores:1,toilets:4,classroomType:'primary'}),'2 blocks of 6 classrooms, 1 office, 1 store, 4 toilets');
 assert.equal(blockGroupText({count:1,classrooms:2,offices:0,stores:0,toilets:2,classroomType:'eccde'}),'1 block of 2 ECCDE classrooms, 2 toilets');
 assert.equal(blockGroupText({count:1,classrooms:0,offices:0,stores:0,toilets:6,classroomType:'primary'}),'1 toilet block of 6 compartments');
 assert.equal(blockGroupText({count:2,classrooms:0,offices:0,stores:0,toilets:6,classroomType:'primary'}),'2 toilet blocks of 6 compartments');
 const grouped=structuredClone(whole);grouped.audit.classroomPri={existing:4,functional:2,additional:7,extra:0};grouped.audit.office={existing:0,functional:0,additional:5,extra:0};grouped.audit.store={existing:2,functional:0,additional:1,extra:0};grouped.audit.toilet={existing:0,functional:0,additional:12,extra:0};
 assert.deepEqual(classroomBlockCounts(grouped,facts),{construct:{classrooms:7,eccde:3,toilets:12},renovate:{classrooms:2,eccde:0,toilets:0}},'new toilets are grouped; toilets are not civil, so none to renovate');
 const before=calculateInfrastructure(grouped,facts);assert.equal(before.items.find(i=>i.key==='classroomPri-construct').grouping,undefined,'not grouped until asked');
 assert.equal(before.items.find(i=>i.key==='classroomEccde-construct').quantity,2,'ungrouped: 3 ECCDE classrooms → 2 ECCDE blocks of 2');
 assert.equal(blockGroupingProblem(grouped,facts),null);
 grouped.blocks={construct:[{count:1,classrooms:4,offices:1,stores:1,toilets:6},{count:1,classrooms:3,offices:1,stores:0},{count:1,classrooms:3,offices:0,stores:0,classroomType:'eccde'},{count:1,classrooms:0,offices:0,stores:0,toilets:6}],renovate:[{count:1,classrooms:2,offices:0,stores:1}]};
 const parsed=packageSchema.safeParse(grouped);assert.ok(parsed.success);assert.deepEqual(parsed.data.blocks.renovate[0],{count:1,classrooms:2,offices:0,stores:1,toilets:0,classroomType:'primary'},'older groups read as Primary/JSS with no toilets');
 assert.equal(blockGroupingProblem(grouped,facts),null);
 assert.equal(packageSchema.safeParse({...grouped,blocks:{construct:[{count:1,classrooms:0,offices:1,stores:1}]}}).success,false,'a block needs a classroom or a toilet');
 assert.ok(packageSchema.safeParse({...grouped,blocks:{construct:[{count:2,classrooms:0,offices:0,stores:0,toilets:6}]}}).success,'a block of toilets alone');
 assert.equal(packageSchema.safeParse({...grouped,blocks:{construct:[{count:1,classrooms:3,offices:1,stores:1,toilets:31}]}}).success,false,'at most 30 toilets per block');
 assert.equal(packageSchema.safeParse({...grouped,blocks:{construct:[{count:1,classrooms:3,offices:1,stores:1,classroomType:'sss'}]}}).success,false,'listed classroom types only');
 assert.equal(packageSchema.safeParse({...grouped,blocks:{construct:[{count:0,classrooms:3,offices:1,stores:1}]}}).success,false,'a group needs a block');
 const after=calculateInfrastructure(parsed.data,facts),item=key=>after.items.find(i=>i.key===key);
 assert.equal(item('classroomPri-construct').quantity,7);assert.equal(item('classroomPri-construct').grouping,'1 block of 4 classrooms, 1 office, 1 store, 6 toilets; 1 block of 3 classrooms, 1 office');
 assert.equal(item('classroomPri-renovate').grouping,'1 block of 2 classrooms, 1 store');
 assert.deepEqual([item('classroomEccde-construct').quantity,item('classroomEccde-construct').unit,item('classroomEccde-construct').grouping],[3,'classrooms','1 block of 3 ECCDE classrooms'],'grouped ECCDE classrooms name their blocks instead of blocks of 2');
 assert.equal(item('toilet').quantity,6,'12 new toilets − 6 in a classroom block');assert.equal(item('toilet').grouping,'1 toilet block of 6 compartments · 6 toilets are in the classroom blocks');
 assert.equal(item('office-construct').quantity,3,'5 new offices − 2 in the blocks');assert.match(item('office-construct').grouping,/2 offices are in the classroom blocks/);
 assert.equal(item('store-construct'),undefined,'the one new store is in the blocks');assert.equal(item('store-renovate').quantity,1,'2 non-functional stores − 1 in the renovated block');
 // Every classroom, ECCDE classroom and toilet in a block, no more: Continue and save wait.
 const short={...parsed.data,blocks:{...parsed.data.blocks,construct:parsed.data.blocks.construct.slice(1)}};
 assert.equal(blockGroupingProblem(short,facts),'Put all 7 classrooms to build into blocks: 4 classrooms left');assert.equal(packageProblem(short,facts),blockGroupingProblem(short,facts));
 const noEccde={...parsed.data,blocks:{...parsed.data.blocks,construct:parsed.data.blocks.construct.filter(x=>x.classroomType!=='eccde')}};
 assert.equal(blockGroupingProblem(noEccde,facts),'Put all 3 ECCDE classrooms to build into blocks: 3 ECCDE classrooms left');
 const noToiletBlock={...parsed.data,blocks:{...parsed.data.blocks,construct:parsed.data.blocks.construct.slice(0,3)}};
 assert.equal(blockGroupingProblem(noToiletBlock,facts),'Put all 12 toilets to build into blocks: 6 toilets left');
 assert.match(blockGroupingProblem({...parsed.data,blocks:{renovate:[{count:2,classrooms:2,offices:0,stores:0}]}},facts),/hold 4 classrooms, but only 2 are to be renovated/);
 assert.match(blockGroupingProblem({...parsed.data,blocks:{renovate:[{count:1,classrooms:2,offices:0,stores:0,toilets:4}]}},facts),/hold 4 toilets, but only 0 are to be renovated/,'non-functional toilets are not renovated in blocks');
 // A grouping saved before toilets were grouped must be completed before the package is saved again.
 const legacy={...grouped,audit:{...grouped.audit,classroomEccde:{existing:0,functional:0,additional:0,extra:0}},blocks:{construct:{classrooms:3,offices:1,stores:1}}};assert.ok(packageSchema.safeParse(legacy).success);
 assert.match(calculateInfrastructure(legacy,facts).items.find(i=>i.key==='classroomPri-construct').grouping,/^2 blocks of 3 classrooms, 1 office, 1 store; 1 block of 1 classroom/);
 assert.equal(blockGroupingProblem(legacy,facts),'Put all 12 toilets to build into blocks: 12 toilets left');
 const oldGroups={...legacy,blocks:{construct:[{count:1,classrooms:7,offices:1,stores:1}]}};assert.equal(blockGroupingProblem(oldGroups,facts),'Put all 12 toilets to build into blocks: 12 toilets left');
 assert.equal(blockGroupingProblem({...oldGroups,blocks:{construct:[...oldGroups.blocks.construct,{count:2,classrooms:0,offices:0,stores:0,toilets:6}]}},facts),null,'completed with toilet blocks');
 assert.equal(packageSchema.parse({kind:'whole',schoolId:1,components:['Primary']}).blocks.construct,undefined,'older packages parse ungrouped');
 // UBEC230: New Construction drawings required; other kinds optional.
 assert.match(drawingsDocumentProblem({kind:'new'},0),/Attach the drawings/);assert.equal(drawingsDocumentProblem({kind:'new'},1),null);assert.equal(drawingsDocumentProblem({kind:'whole'},0),null);assert.equal(drawingsDocumentProblem({kind:'furniture'},0),null);
}
// Provisions (client, 7 November 2026): handwashing stations and magnetic boards are listed with their quantities but not costed.
{
 const {provisionNotes,isProvisionKey}=await import('../lib/infrastructure-model.ts');
 assert.ok(isProvisionKey('handwashing')&&isProvisionKey('magneticBoard'));assert.ok(!isProvisionKey('teachersFurniture')&&!isProvisionKey('dualDesk')&&!isProvisionKey('storageShelf'),'teachers’ furniture, desks and cupboards stay costed');
 const p=structuredClone(whole);p.packageCosts={...p.packageCosts,handwashing:{cost:500,strategy:'NCB',duration:'1 week'},magneticBoard:{cost:200,strategy:'NCB',duration:'1 week'}};
 const res=calculateInfrastructure(p,facts),hw=res.items.find(i=>i.key==='handwashing'),mb=res.items.find(i=>i.key==='magneticBoard');
 assert.ok(hw&&mb,'still in the package items');assert.equal(hw.quantity,1);assert.equal(mb.quantity,wholeRequirements(facts,'primary').magneticBoard.qty);
 for(const i of [hw,mb]){assert.equal(i.cost,0,'a cost saved before is ignored');assert.equal(i.total,0);assert.equal(i.operation,'Provision');}
 assert.equal(itemOperation(hw),'Provision · included in the solar borehole cost');assert.equal(itemOperation(mb),provisionNotes.magneticBoard);
 const costed=res.items.filter(i=>!i.provision).reduce((s,i)=>s+i.total,0);assert.equal(res.total,costed,'provisions add nothing to the total');
 assert.equal(packageProblem(p,facts),null,'provisions need no cost or duration');
 assert.ok(res.items.find(i=>i.key==='teachersFurniture').total>0,'teachers’ furniture still costed');
}
console.log('PASS: strict strategies, model-driven New Construction lists (Primary/JSS, no block of 3), land and fence rules, HOPE VAT, enrolment formulas with rounding, editable Additional, per-row photos, block grouping with ECCDE and toilets, provisions, older packages and furniture.');
