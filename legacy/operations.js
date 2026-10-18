const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmt = value => Number(value).toLocaleString(undefined,{maximumFractionDigits:1});
const titles = {overview:'Factory utility overview',notifications:'Notifications',ai_chat:'Chat with AI',app_settings:'App Settings',map:'Location map',daily_report:'Daily Report',monthly_report:'Monthly Report',factories:'Factories',locations:'Locations',production_lines:'Production lines',machines:'Machines',metering:'Metering'};
const descriptions = {notifications:'Metering thresholds and machine-state questions.',ai_chat:'Ask evidence-based questions about the factory’s utility data.',app_settings:'Configure the AI service used by utility chat.',daily_report:'Observed utility use and operational evidence for a local calendar day.',monthly_report:'Observed utility use and operational evidence for a local calendar month.',factories:'Factory identity and operating sites.',locations:'Locations with their parent factory metadata.',production_lines:'Production lines with location and factory metadata.',machines:'Equipment, enabled status, and production-flow connections.',metering:'Utility type, machine relationship, baseline, and simulator status.'};
const config = {
  factories:{columns:[['name','Factory'],['code','Code'],['description','Description']],fields:[['name','Factory name','text'],['code','Code','text'],['description','Description','text']]},
  locations:{columns:[['name','Location'],['code','Code'],['factory_name','Factory'],['description','Description']],fields:[['factory_id','Factory','factories'],['name','Location name','text'],['code','Code','text'],['description','Description','text']]},
  production_lines:{columns:[['name','Production line'],['code','Code'],['location_name','Location'],['factory_name','Factory']],fields:[['location_id','Location','locations'],['name','Line name','text'],['code','Code','text'],['description','Description','text']]},
  machines:{columns:[['name','Machine'],['code','Code'],['enabled','Status'],['category','Stage'],['location_name','Location'],['production_line_name','Line'],['left_machine_ids','Left of machine'],['right_machine_ids','Right of machine']],fields:[['production_line_id','Production line','production_lines'],['name','Machine name','text'],['code','Code','text'],['category','Category','text'],['enabled','Machine enabled','checkbox'],['left_machine_ids','Machines on the left','machine_neighbors'],['right_machine_ids','Machines on the right','machine_neighbors'],['description','Description','text']]},
  metering:{resource:'sensors',columns:[['name','Metering point'],['type','Utility'],['machine_name','Machine'],['location_name','Location'],['baseline','Baseline'],['enabled','Simulator']],fields:[['id','Meter ID','text'],['machine_id','Machine','machines'],['name','Metering point name','text'],['type','Utility type','category'],['unit','Unit','text'],['baseline','Baseline','decimal'],['min_value','Minimum','decimal'],['max_value','Maximum','decimal'],['enabled','Enabled in simulator','checkbox']]}
};
let data = null;
let page = 'overview';
let editing = null;
let mapLocationId = null;
let toastTimer;
let categoryName = null;
let categoryData = null;
let categoryLoading = false;
let selectedMachineId = null;
let machineTrend = null;
let machineTrendLoading = false;
let machineTrendGeneration = 0;
let reportData = null;
let reportGeneration = 0;
const reportSelections = {daily_report:null,monthly_report:null};
const aiHistory = [];
let aiBusy = false;
let alertData = null;
let alertFilter = 'open';
let alertsLoading = false;
let resolvingAlertId = null;
let overviewTrends = null;
let overviewTrendLoading = false;

async function api(path,method='GET',body){
  const response = await fetch(path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
  let result; try{result=await response.json()}catch{throw new Error(`Request failed (${response.status})`)}
  if(!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result;
}
function toast(message,error=false){const box=$('#toast');box.textContent=message;box.classList.toggle('error',error);box.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.classList.remove('show'),3500)}
function closeSidebar(){
  $('#sidebar').classList.remove('mobile-open');
  $('#sidebar-backdrop').hidden=true;
  $('#menu-toggle').setAttribute('aria-expanded','false');
}
function renderNavSearch(){
  const query=$('#nav-search-input').value.trim().toLowerCase();
  const links=[...document.querySelectorAll('#nav a[data-page]')].map(link=>({page:link.dataset.page,label:[...link.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent).join('').trim()}));
  const matches=links.filter(link=>!query||link.label.toLowerCase().includes(query));
  $('#nav-search-results').innerHTML=matches.length?matches.map(link=>`<button type="button" data-search-page="${esc(link.page)}">${esc(link.label)}</button>`).join(''):'<p>No matching pages.</p>';
}
function openNavSearch(){
  closeSidebar();
  $('#nav-search-input').value='';
  renderNavSearch();
  $('#nav-search-dialog').showModal();
  $('#nav-search-input').focus();
}
function showPage(name){
  closeSidebar();
  if($('#machine-dialog').open)$('#machine-dialog').close();
  const previousPage=page;
  const previousCategory=categoryName;
  if(name==='sensors')name='metering';
  if(name==='alerts')name='notifications';
  const isCategory=name.startsWith('category/');
  if(isCategory){
    let nextCategory;try{nextCategory=decodeURIComponent(name.slice(9))}catch{nextCategory=null}
    if(nextCategory!==categoryName)categoryData=null;
    categoryName=nextCategory;
    page=categoryName?'category':'overview';
  }else{page=titles[name]?name:'overview';categoryName=null;categoryData=null}
  $('#breadcrumb-page').textContent = (page==='category'?categoryName:titles[page]).toUpperCase();
  $('.page-heading').hidden=page==='category';
  $('#page-title').textContent = page==='category'?`${categoryName} metering`:titles[page];
  if(page==='category')$('#category-page-title').textContent=`${categoryName} metering`;
  $('#page-subtitle').textContent = page==='overview'?'Live usage against baseline across the production floor.':page==='map'?'Machine status and utility readings in the production flow.':page==='category'?'Live rate, incoming readings, and machine gauges.':descriptions[page];
  document.querySelectorAll('#nav a').forEach(link=>link.classList.toggle('active',link.dataset.page===(page==='category'?'overview':page)));
  document.querySelector('[data-view="overview"]').hidden=page!=='overview';
  document.querySelector('[data-view="notifications"]').hidden=page!=='notifications';
  document.querySelector('[data-view="ai_chat"]').hidden=page!=='ai_chat';
  document.querySelector('[data-view="app_settings"]').hidden=page!=='app_settings';
  document.querySelector('[data-view="map"]').hidden=page!=='map';
  document.querySelector('[data-view="work_plan"]').hidden=page!=='work_plan';
  document.querySelector('[data-view="work_plan_editor"]').hidden=page!=='work_plan_editor';
  document.querySelector('[data-view="category"]').hidden=page!=='category';
  document.querySelector('[data-view="report"]').hidden=!isReportPage();
  document.querySelector('[data-view="master"]').hidden=!config[page];
  if(config[page])renderMaster();
  if(page==='map')renderMap();
  if(page==='overview'&&data)refreshOverviewTrends();
  if(page==='notifications')loadAlerts();
  if(page==='category')refreshCategory();
  if(page==='app_settings'&&previousPage!==page)loadAISettings();
  if(isReportPage()){
    const kind=page==='daily_report'?'daily':'monthly';
    $('#report-heading').textContent=titles[page];
    $('#report-period').type=kind==='daily'?'date':'month';
    $('#report-period').value=reportSelections[page]||reportDefaultPeriod(kind);
    $('#report-period').max=reportDefaultPeriod(kind);
    if(previousPage!==page)loadReport();
  }else{reportGeneration++}
  if(previousPage!==page||previousCategory!==categoryName)window.scrollTo(0,0);
}
function isReportPage(){return page==='daily_report'||page==='monthly_report'}
function reportDefaultPeriod(kind){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(part=>[part.type,part.value]));
  return `${parts.year}-${parts.month}${kind==='daily'?`-${parts.day}`:''}`;
}
const planStates = new Map();
let planLocationId = null;
let planId = null;
let planLoadGeneration = 0;
let planDetail = null;
function planDate(value){return new Date(value).toLocaleString('en-GB',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'})}
async function loadPlanList(){
  $('#work-plan-list-status').textContent='Loading work plans…';
  try{
    const result=await api('/api/work-plans');
    if(page!=='work_plan')return;
    $('#work-plan-rows').innerHTML=result.plans.map(p=>`<tr><td>${esc(p.date)}</td><td>${esc(p.start_time)} WIB</td><td>${fmt(p.duration_hours)} h</td><td>${esc(p.pic)}</td><td>${p.machine_count}</td><td>${p.planned_off_count}</td><td><span class="pill ${p.status==='active'?'':'off'}">${esc(p.status)}</span></td><td><a class="text-link" href="#work_plan/${p.id}">View ↗</a></td></tr>`).join('');
    $('#work-plan-empty').hidden=result.plans.length>0;
    $('#work-plan-list-status').textContent=`${result.plans.length} work plan${result.plans.length===1?'':'s'} · Times shown in Asia/Jakarta`;
  }catch(error){$('#work-plan-list-status').textContent=`Unable to load work plans: ${error.message}`}
}
function selectedPlanMachines(){return [...planStates].map(([machine_id,planned_on])=>({machine_id,planned_on}))}
function renderPlanSelected(){
  if(!data)return;
  const chosen=data.machines.filter(machine=>planStates.has(machine.id));
  $('#work-plan-selected-count').textContent=chosen.length;
  $('#work-plan-selected-list').innerHTML=chosen.length?chosen.map(machine=>`<div class="plan-selected-row"><div><strong>${esc(machine.name)}</strong><small>${esc(machine.location_name)}</small></div><span class="plan-selected-state ${planStates.get(machine.id)?'on':'off'}">Planned ${planStates.get(machine.id)?'ON':'OFF'}</span></div>`).join(''):'<p class="plan-hint">Select machines on the map above.</p>';
}
function renderPlanMap(){
  if(!data||page!=='work_plan_editor')return;
  if(!data.locations.some(location=>location.id===planLocationId))planLocationId=data.locations[0]?.id??null;
  const select=$('#work-plan-location');
  select.innerHTML=data.locations.map(location=>`<option value="${location.id}" ${location.id===planLocationId?'selected':''}>${esc(location.name)} · ${esc(location.factory_name)}</option>`).join('');
  const {columns}=mapLayout(data.machines.filter(m=>m.location_id===planLocationId));
  const container=$('#work-plan-map-columns');container.style.setProperty('--map-column-count',Math.max(1,columns.length));
  container.innerHTML=columns.length?columns.map((machines,index)=>`<div class="map-column"><div class="map-stage">${String(index+1).padStart(2,'0')} / ${esc(machines[0].category)}</div>${machines.map(m=>`<div class="machine-node plan-machine-node ${planStates.has(m.id)?'selected':''} ${planStates.has(m.id)&&!planStates.get(m.id)?'planned-off':''}" data-machine-id="${m.id}"><div class="node-top"><div><strong>${esc(m.name)}</strong><small>${esc(m.code)}</small></div></div><div class="plan-machine-controls"><label class="plan-select-control"><input type="checkbox" data-plan-machine="${m.id}" ${planStates.has(m.id)?'checked':''}><span>Select</span></label><button type="button" class="plan-state-switch ${planStates.get(m.id)?'on':'off'}" data-plan-toggle="${m.id}" role="switch" aria-label="${esc(m.name)} planned state" aria-checked="${planStates.get(m.id)?'true':'false'}" ${planStates.has(m.id)?'':'disabled'}><i></i><span>${planStates.has(m.id)?planStates.get(m.id)?'ON':'OFF':'ON / OFF'}</span></button></div></div>`).join('')}</div>`).join(''):'<div class="map-empty">No machines are assigned to this location.</div>';
  requestAnimationFrame(drawPlanLines);
}
function drawPlanLines(){
  if(page!=='work_plan_editor'||!data)return;
  const board=$('#work-plan-map-board'),svg=$('#work-plan-map-lines');
  svg.setAttribute('viewBox',`0 0 ${board.scrollWidth} ${board.scrollHeight}`);
  const nodes=new Map([...board.querySelectorAll('.machine-node')].map(node=>[Number(node.dataset.machineId),node]));
  const rect=board.getBoundingClientRect();
  const {edges}=mapLayout(data.machines.filter(m=>m.location_id===planLocationId));
  svg.innerHTML=edges.map(([from,to])=>{const a=nodes.get(from)?.getBoundingClientRect(),b=nodes.get(to)?.getBoundingClientRect();if(!a||!b)return '';const x1=a.right-rect.left,y1=a.top-rect.top+a.height/2,x2=b.left-rect.left,y2=b.top-rect.top+b.height/2,mid=(x1+x2)/2;return `<path d="M ${x1} ${y1} H ${mid} V ${y2} H ${x2-5}" fill="none" stroke="#438f7b" stroke-width="1.5" opacity=".8"/>`}).join('');
}
function renderPlanAnalysis(){
  const box=$('#work-plan-analysis');
  if(!planDetail||planDetail.status==='upcoming'){box.hidden=true;return}
  box.hidden=false;
  const issues=planDetail.machines.flatMap(machine=>(machine.metering||[]).filter(m=>m.unexpected_use).map(m=>({machine,meter:m})));
  box.innerHTML=`<span class="eyebrow">METERING REVIEW</span><h2>${issues.length?`${issues.length} planned-OFF meter${issues.length===1?'':'s'} reported use`:'Metering review'}</h2><p>Observed from ${esc(planDate(planDetail.start_at))} through ${esc(planDate(new Date(Math.min(Date.parse(planDetail.end_at),Date.now())).toISOString()))}. Positive readings during planned OFF need investigation; standby load, shared metering, or noise may also explain them. This is not a confirmed leak.</p>${issues.length?`<div class="plan-issues">${issues.map(({machine,meter})=>`<div><strong>${esc(machine.machine_name)} · ${esc(meter.name)}</strong><span>Peak ${fmt(meter.peak_rate)} ${esc(meter.unit)} · ${meter.positive_samples} positive of ${meter.samples} samples</span></div>`).join('')}</div>`:'<p>No positive planned-OFF readings in the available samples. Missing metering does not prove zero use.</p>'}<div class="plan-coverage">${planDetail.machines.map(machine=>`<div><strong>${esc(machine.machine_name)} · planned ${machine.planned_on?'ON':'OFF'}</strong><span>${(machine.metering||[]).length?(machine.metering||[]).map(m=>`${esc(m.name)}: ${m.samples?`${m.samples} samples, latest ${fmt(m.latest_rate)} ${esc(m.unit)}`:'no samples'}`).join(' · '):'No metering assigned'}</span></div>`).join('')}</div>`;
}
async function openPlanEditor(id){
  const generation=++planLoadGeneration;
  planId=id==='new'?null:Number(id);planStates.clear();planDetail=null;
  $('#work-plan-editor-title').textContent=planId?`Work Plan #${planId}`:'Create Work Plan';
  $('#work-plan-editor-status').textContent=planId?'Loading…':'New plan';
  $('#work-plan-date').value=reportDefaultPeriod('daily');$('#work-plan-start').value='08:00';$('#work-plan-duration').value='8';$('#work-plan-pic').value='';
  $('#work-plan-delete').hidden=!planId;$('#work-plan-analysis').hidden=true;
  if(planId){
    try{
      const p=await api(`/api/work-plans/${planId}`);
      if(generation!==planLoadGeneration||page!=='work_plan_editor')return;
      planDetail=p;$('#work-plan-date').value=p.date;$('#work-plan-start').value=p.start_time;$('#work-plan-duration').value=p.duration_hours;$('#work-plan-pic').value=p.pic;
      for(const machine of p.machines)planStates.set(machine.machine_id,machine.planned_on);
      const first=data?.machines.find(m=>planStates.has(m.id));if(first)planLocationId=first.location_id;
      $('#work-plan-editor-status').textContent=`${p.status.toUpperCase()} · ${p.machine_count} machines · Asia/Jakarta`;
      renderPlanAnalysis();
    }catch(error){$('#work-plan-editor-status').textContent=`Unable to load plan: ${error.message}`}
  }
  renderPlanMap();renderPlanSelected();
}
function statusText(sensor){return sensor.status==='live'?'Live':sensor.status==='stale'?'Stale':'Off'}
function alertTime(value){return new Date(value).toLocaleString('en-GB',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'})+' WIB'}
function alertIsOpen(alert){return !alert.resolved_at&&!alert.review_status}
function renderAlerts(){
  if(!alertData)return;
  const rows=alertData.alerts.filter(alert=>alertFilter==='open'?alertIsOpen(alert):!alertIsOpen(alert));
  $('#alert-open-count').textContent=`${alertData.open_count} open notification${alertData.open_count===1?'':'s'}`;
  $('#alert-list-status').textContent=alertFilter==='open'?`${rows.length} currently open`:`${rows.length} handled or ended`;
  document.querySelectorAll('[data-alert-filter]').forEach(button=>{const selected=button.dataset.alertFilter===alertFilter;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected))});
  $('#alert-list').innerHTML=rows.length?rows.map(alert=>{
    const open=alertIsOpen(alert),type=alert.alert_type,reportedAt=Date.parse(alert.last_seen_at);
    const stale=open&&Date.now()-reportedAt>Math.max(15,Number(data?.interval||5)*3)*1000;
    const machineType=['machine_off_question','machine_on_question','metering_check'].includes(type);
    const sustained=type==='prolonged_maximum',maximum=type==='maximum'||sustained;
    const label=type==='machine_off_question'?'Machine may be off':type==='machine_on_question'?'Machine may be running':type==='metering_check'?'Check metering':sustained?'Sustained maximum':maximum?'Maximum':'Baseline';
    const state=alert.review_status?alert.review_status.replaceAll('_',' '):alert.resolved_at?'Condition ended':stale?'No recent reading':label;
    let message,detail,peak='';
    if(type==='machine_off_question'){
      message='All enabled metering points reported zero continuously for at least 1 minute. Is this machine off?';
      detail=`Metering: ${esc(alert.sensor_name||'—')}`;
    }else if(type==='machine_on_question'){
      message='Positive metering was detected while this machine is disabled in master data. Is it running again?';
      detail=`Positive metering: ${esc(alert.sensor_name||'—')}`;
    }else if(type==='metering_check'){
      message='Some metering points reported zero for at least 1 minute while other metering on this machine remained positive. Please check the metering.';
      detail=`Zero metering: ${esc(alert.sensor_name||'—')}`;
    }else{
      const threshold=Number(alert.threshold_value??alert.baseline),above=Number(alert.peak_value)-threshold;
      message=sustained?'Reading stayed above the operational maximum for at least 1 minute.':`Reading exceeded the configured ${label.toLowerCase()}.`;
      peak=`<strong class="alert-peak">Peak ${fmt(alert.peak_value)} / ${fmt(threshold)} ${esc(alert.unit)}</strong>`;
      detail=`${threshold>0?`${fmt(alert.peak_value/threshold*100)}% of ${label.toLowerCase()}`:`Above zero ${label.toLowerCase()}`} · +${fmt(above)} ${esc(alert.unit)} at peak`;
    }
    const actions=open?`<div class="alert-actions">${type==='machine_off_question'?`<button type="button" data-alert-action="confirm_off" data-alert-id="${alert.id}">Yes, machine is off</button>`:type==='machine_on_question'?`<button type="button" data-alert-action="confirm_on" data-alert-id="${alert.id}">Yes, machine is on</button>`:`<button type="button" data-alert-action="resolve" data-alert-id="${alert.id}">Resolve</button>`}<button type="button" class="secondary" data-alert-action="ignore" data-alert-id="${alert.id}">Ignore</button></div>`:'';
    const link=machineType?`<a href="#machines">View machine master data ↗</a>`:`<a href="#category/${encodeURIComponent(alert.utility_type)}">View ${esc(alert.utility_type)} detail ↗</a>`;
    return `<article class="alert-card panel ${open?'open':'resolved'} ${sustained?'sustained':maximum?'maximum':machineType?'machine-alert':'baseline'}"><div class="alert-card-head"><span class="alert-state ${open?'open':'resolved'}">${esc(state.toUpperCase())}</span><time>${esc(alertTime(alert.started_at))}</time></div><div class="alert-card-body"><div><h3>${esc(alert.machine_name)}${machineType?'':` · ${esc(alert.sensor_name)}`}</h3><p>${esc(alert.location_name)} · ${esc(message)}</p></div>${peak}</div><div class="alert-card-detail"><span>${detail}</span><span>Last observed ${esc(alertTime(alert.last_seen_at))}</span>${alert.reviewed_at?`<span>Reviewed ${esc(alertTime(alert.reviewed_at))}</span>`:alert.resolved_at?`<span>Ended ${esc(alertTime(alert.resolved_at))}</span>`:''}${alert.review_note?`<span>Note: ${esc(alert.review_note)}</span>`:''}</div>${actions}${link}</article>`;
  }).join(''):`<div class="alert-empty panel">${alertFilter==='open'?'No open notifications.':'No handled or ended notifications in the recent history.'}</div>`;
}
async function loadAlerts(){
  if(page!=='notifications'||alertsLoading)return;
  alertsLoading=true;
  try{alertData=await api('/api/notifications');if(page==='notifications')renderAlerts()}
  catch(error){if(page==='notifications')$('#alert-list-status').textContent=`Could not load notifications: ${error.message}`}
  finally{alertsLoading=false}
}
function renderOverview(){
  const liveSensors=data.sensors.filter(s=>s.status==='live');
  const liveMachines=data.machines.filter(m=>m.status==='live');
  const newest=liveSensors.map(s=>s.reading?.observed_at).filter(Boolean).sort().at(-1);
  const baselineAlerts=Number(data.metering_alert_count||0),alertBadge=$('#alert-nav-count');
  alertBadge.hidden=!baselineAlerts;alertBadge.textContent=baselineAlerts;
  $('#metering-alert-banner').hidden=!baselineAlerts;
  $('#metering-alert-banner').innerHTML=baselineAlerts?`<strong>${baselineAlerts} open notification${baselineAlerts===1?'':'s'}</strong><span>Review metering thresholds and machine-state questions.</span><a href="#notifications">Review notifications ↗</a>`:'';
  $('#summary-grid').innerHTML=[
    ['Live machines',`${liveMachines.length} / ${data.machines.length}`,'Reporting fresh telemetry'],
    ['Enabled metering',`${data.sensors.filter(s=>s.enabled).length} / ${data.sensors.length}`,'Metering points publishing to MQTT'],
    ['Metered categories',new Set(data.sensors.map(s=>s.type)).size,'Utilities tracked across the plant'],
    ['ClickHouse readings',fmt(data.telemetry_count),'Stored MQTT messages'],
  ].map(([label,value,detail])=>`<article class="summary-card"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></article>`).join('');
  $('#hero-status').textContent=newest?`${liveSensors.length} meters reporting live`:'Waiting for fresh telemetry';
  $('#hero-time').textContent=newest?`Latest ${new Date(newest).toLocaleTimeString()}`:'—';
  const categoryIcons={'Electricity':'ϟ','Compressed Air':'◌','Clean Water':'◉','Natural Gas':'♨','Diesel':'◈'};
  const categories=[...new Set(data.sensors.map(s=>s.type))];
  const grid=$('#category-grid'),catalog=categories.join('|');
  if(grid.dataset.categories!==catalog){
    grid.innerHTML=categories.map(type=>`<a class="category-card utility-card" href="#category/${encodeURIComponent(type)}" aria-label="Open live ${esc(type)} metering detail"><div class="category-top"><div class="category-title"><span class="category-icon">${esc(categoryIcons[type]||'◇')}</span>${esc(type)}</div><span class="category-count" data-live-count>—</span></div><div class="utility-reading"><strong data-current>—</strong><span data-unit></span></div><div class="utility-threshold-values"><span data-baseline>Baseline —</span><span data-maximum>Max —</span></div><div class="utility-tank" role="img"><div class="utility-level-fill"></div><div class="utility-limit utility-limit-max"><span>MAX</span></div><div class="utility-limit utility-limit-baseline"><span>BASELINE</span></div></div><div class="utility-level-caption" data-level-caption>No live data</div><div class="utility-trend"><div class="utility-trend-head"><strong>Last 60 mins</strong><span>RATE TREND</span></div><div class="utility-spark-wrap"><svg class="utility-spark" viewBox="0 0 300 90" preserveAspectRatio="none" role="img" aria-label="${esc(type)} rate in the last 60 minutes"></svg><span class="utility-spark-empty" hidden>No readings in the last hour</span></div><div class="utility-trend-times"><span data-trend-start>—</span><span data-trend-end>—</span></div></div><span class="category-open">View live detail ↗</span></a>`).join('');
    grid.dataset.categories=catalog;
  }
  categories.forEach((type,index)=>{
    const group=data.sensors.filter(s=>s.type===type),live=group.filter(s=>s.status==='live');
    const usage=live.reduce((sum,s)=>sum+Number(s.reading.value),0);
    const baseline=live.reduce((sum,s)=>sum+Number(s.baseline),0);
    const maximum=live.reduce((sum,s)=>sum+Number(s.max_value),0);
    const unit=group[0]?.unit||'';
    const card=grid.children[index],hasLive=live.length>0,atMax=hasLive&&maximum>0&&usage>=maximum;
    const scale=Math.max(1,maximum*1.15,baseline*1.05,usage*1.08);
    const percentage=value=>`${Math.max(0,Math.min(100,value/scale*100)).toFixed(2)}%`;
    card.classList.toggle('is-max',atMax);card.classList.toggle('is-off',!hasLive);
    card.dataset.current=String(usage);card.dataset.maximum=String(maximum);
    card.querySelector('[data-live-count]').textContent=`${live.length} / ${group.length} LIVE`;
    card.querySelector('[data-current]').textContent=hasLive?fmt(usage):'—';
    card.querySelector('[data-unit]').textContent=unit;
    card.querySelector('[data-baseline]').textContent=`Baseline ${hasLive?fmt(baseline):'—'} ${unit}`;
    card.querySelector('[data-maximum]').textContent=`Max ${hasLive?fmt(maximum):'—'} ${unit}`;
    card.querySelector('.utility-level-fill').style.height=hasLive?percentage(usage):'0%';
    card.querySelector('.utility-limit-baseline').style.bottom=percentage(baseline);
    card.querySelector('.utility-limit-max').style.bottom=percentage(maximum);
    card.querySelector('.utility-limit-baseline').hidden=!hasLive;
    card.querySelector('.utility-limit-max').hidden=!hasLive||maximum<=0;
    card.querySelector('.utility-tank').setAttribute('aria-label',hasLive?`${type}: current ${fmt(usage)} ${unit}, baseline ${fmt(baseline)} ${unit}, maximum ${fmt(maximum)} ${unit}`:`${type}: no live reading`);
    card.querySelector('[data-level-caption]').textContent=!hasLive?'No live reading':atMax?'At or above maximum':`${fmt(usage/Math.max(maximum,1)*100)}% of maximum`;
  });
  if(overviewTrends)renderOverviewCategoryTrends();
  const featured=data.machines.filter(m=>m.sensors.length).slice(0,7);
  $('#equipment-list').innerHTML=featured.map(m=>`<div class="equipment-row"><div><strong>${esc(m.name)}</strong><small>${esc(m.category)} · ${esc(m.location_name)}</small></div><div>${m.sensors.map(s=>s.status==='live'?`<b>${fmt(s.reading.value)} / ${fmt(s.baseline)} ${esc(s.unit)}</b>`:`<span class="state-tag off"><i></i>${statusText(s)}</span>`).join('<br>')}</div></div>`).join('');
  $('#pipeline-details').innerHTML=[['MQTT subscriber',data.ingest.connected?'Connected':'Disconnected'],['Last ingested message',data.ingest.last_message?new Date(data.ingest.last_message).toLocaleTimeString():'—'],['PostgreSQL master records',data.factories.length+data.locations.length+data.production_lines.length+data.machines.length+data.sensors.length],['ClickHouse rows',fmt(data.telemetry_count)]].map(([key,value])=>`<div class="pipeline-line"><span>${esc(key)}</span><strong>${esc(value)}</strong></div>`).join('');
  $('#sidebar-pipeline').textContent=data.ingest.connected?'MQTT → ClickHouse live':'MQTT disconnected';
  const badge=$('#live-badge');badge.classList.toggle('off',!data.ingest.connected);badge.querySelector('span').textContent=data.ingest.connected?'MQTT CONNECTED':'MQTT OFFLINE';
  if(data.ingest.error){$('#error-banner').textContent=data.ingest.error;$('#error-banner').hidden=false}else{$('#error-banner').hidden=true}
}

async function refreshOverviewTrends(){
  if(page!=='overview'||overviewTrendLoading)return;
  overviewTrendLoading=true;
  try{
    overviewTrends=await api('/api/overview/trends');
    if(page==='overview')renderOverviewCategoryTrends();
  }catch(error){if(page==='overview')document.querySelectorAll('.utility-spark-empty').forEach(node=>{node.textContent=`Trend unavailable: ${error.message}`;node.hidden=false})}
  finally{overviewTrendLoading=false}
}
function renderOverviewCategoryTrends(){
  if(!data||!overviewTrends)return;
  const end=Math.floor(new Date(overviewTrends.updated_at).getTime()/60000)*60000,start=end-59*60000;
  const time=value=>new Date(value).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
  const categories=[...new Set(data.sensors.map(s=>s.type))];
  categories.forEach((type,index)=>{
    const card=$('#category-grid').children[index];if(!card)return;
    const points=Array(60).fill(null);
    for(const point of overviewTrends.series[type]||[]){
      const position=Math.round((new Date(point.minute).getTime()-start)/60000);
      if(position>=0&&position<60)points[position]=Number(point.value);
    }
    const values=points.filter(value=>value!==null),scale=Math.max(1,Number(card.dataset.maximum)*1.12,...values)*1.06;
    const x=position=>4+position*292/59,y=value=>80-value/scale*68;
    const segments=[];let segment=[];
    points.forEach((value,position)=>{if(value===null){if(segment.length)segments.push(segment);segment=[]}else segment.push([x(position),y(value)])});
    if(segment.length)segments.push(segment);
    card.querySelector('.utility-spark').innerHTML=segments.map(part=>part.length>1?`<polyline class="utility-spark-line" points="${part.map(([px,py])=>`${px.toFixed(1)},${py.toFixed(1)}`).join(' ')}"/>`:`<circle class="utility-spark-dot" cx="${part[0][0]}" cy="${part[0][1]}" r="3"/>`).join('');
    const empty=card.querySelector('.utility-spark-empty');empty.textContent='No readings in the last hour';empty.hidden=values.length>0;
    card.querySelector('[data-trend-start]').textContent=time(start);
    card.querySelector('[data-trend-end]').textContent=time(end);
  });
}
async function refreshCategory(){
  if(page!=='category'||!categoryName||categoryLoading)return;
  const requested=categoryName;categoryLoading=true;
  try{
    const result=await api(`/api/category/${encodeURIComponent(requested)}`);
    if(page==='category'&&requested===categoryName){categoryData=result;renderCategory()}
  }catch(error){
    if(page==='category'&&requested===categoryName){$('#error-banner').textContent=`Category detail unavailable: ${error.message}`;$('#error-banner').hidden=false}
  }finally{categoryLoading=false}
}
function renderCategory(){
  if(page!=='category'||!categoryData)return;
  const detail=categoryData,meters=detail.machines.flatMap(machine=>machine.meters);
  const live=meters.filter(meter=>meter.status==='live');
  const usage=live.reduce((total,meter)=>total+meter.reading.value,0);
  const baseline=live.reduce((total,meter)=>total+Number(meter.baseline),0);
  const maximum=live.reduce((total,meter)=>total+Number(meter.max_value),0);
  $('#detail-name').textContent=detail.category;
  $('#detail-usage').textContent=live.length?`${fmt(usage)} ${detail.unit}`:'—';
  $('#detail-baseline').textContent=live.length?`${fmt(baseline)} ${detail.unit}`:'—';
  $('#detail-max').textContent=live.length?`${fmt(maximum)} ${detail.unit}`:'—';
  $('#detail-reporting').textContent=`${live.length} / ${meters.length}`;
  $('#detail-machine-count').textContent=`${detail.machines.length} MACHINES`;
  $('#feed-state').textContent=live.length?'LIVE':'NO LIVE METERING';
  $('#feed-state').classList.toggle('off',!live.length);
  $('#feed-footer-text').textContent=live.length?`${live.length} metering points reporting`:'Waiting for live readings';
  renderCategoryChart(detail.series,live.length?baseline:null,live.length?maximum:null,detail.unit,detail.updated_at);
  renderCategoryFeed(detail.events,detail.unit);
  renderMachineShare(detail.machines,detail.unit);
  const focusedMachineId=document.activeElement?.dataset?.machineId;
  const gaugeTicks=[0,25,50,75,100].map(value=>{
    const angle=(135+value*2.7)*Math.PI/180;
    const x1=110+79*Math.cos(angle),y1=100+79*Math.sin(angle);
    const x2=110+88*Math.cos(angle),y2=100+88*Math.sin(angle);
    const tx=110+93*Math.cos(angle),ty=104+93*Math.sin(angle);
    return `<line class="gauge-tick" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/><text class="gauge-tick-label" x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle">${value}</text>`;
  }).join('');
  $('#machine-gauges').innerHTML=detail.machines.map(machine=>{
    const reporting=machine.meters.filter(meter=>meter.status==='live');
    const current=reporting.reduce((total,meter)=>total+meter.reading.value,0);
    const target=reporting.reduce((total,meter)=>total+Number(meter.baseline),0);
    const percent=target>0?current/target*100:0,fill=reporting.length?Math.max(0,Math.min(100,percent)):0;
    const needleAngle=(135+fill*2.7)*Math.PI/180;
    const needleX=110+49*Math.cos(needleAngle),needleY=100+49*Math.sin(needleAngle);
    const percentLabel=reporting.length&&target>0?`${fmt(percent)}%`:'—';
    const meterRows=machine.meters.length?machine.meters.map(meter=>`<div><span>${esc(meter.name)}</span><strong>${meter.status==='live'?`${fmt(meter.reading.value)} ${esc(meter.unit)}`:statusText(meter)}</strong></div>`).join(''):'<div class="gauge-unmetered">No metering assigned for this category</div>';
    return `<article class="gauge-card panel ${machine.status==='live'?'':'off'} ${target>0&&current>target?'over-baseline':''}" role="button" tabindex="0" data-machine-id="${machine.id}" aria-label="View live ${esc(detail.category)} trend for ${esc(machine.name)}"><div class="gauge-top"><div><strong>${esc(machine.name)}</strong><small>${esc(machine.location_name)} · ${esc(machine.code)}</small></div><span class="state-tag ${machine.status==='live'?'':'off'}"><i></i>${machine.status==='live'?'Live':machine.meters.length?'Off':'No meter'}</span></div><div class="gauge-visual"><svg viewBox="0 0 220 205" role="img" aria-label="${esc(machine.name)} usage gauge, ${percentLabel} of baseline"><path class="gauge-track" d="M57 153 A75 75 0 1 1 163 153" pathLength="100"/><path class="gauge-fill" d="M57 153 A75 75 0 1 1 163 153" pathLength="100" stroke-dasharray="${fill.toFixed(1)} 100"/>${gaugeTicks}${reporting.length?`<line class="gauge-needle" x1="110" y1="100" x2="${needleX.toFixed(1)}" y2="${needleY.toFixed(1)}"/><circle class="gauge-hub" cx="110" cy="100" r="5"/>`:''}</svg><div class="gauge-center"><strong>${percentLabel}</strong><span>OF BASELINE</span></div></div><div class="gauge-reading"><strong>${reporting.length?fmt(current):'—'} <small>/ ${reporting.length?fmt(target):'—'} ${esc(detail.unit)}</small></strong><span>${machine.meters.length?`${reporting.length} / ${machine.meters.length} live`:'Unmetered'}</span></div><div class="gauge-meters">${meterRows}</div><div class="gauge-open-hint">View live trend ↗</div></article>`;
  }).join('');
  if(focusedMachineId)$('#machine-gauges').querySelector(`[data-machine-id="${focusedMachineId}"]`)?.focus({preventScroll:true});
  renderMachineDialogSummary();
  $('#error-banner').hidden=true;
}
function renderMachineShare(machines,unit){
  const palette=['#56cfb3','#438de8','#9a84f2','#e89966','#dd6cab','#66c5df','#d3be58','#ea777d'];
  const rows=machines.map(machine=>({
    name:machine.name,
    value:machine.meters.filter(meter=>meter.status==='live'&&meter.reading).reduce((sum,meter)=>sum+Math.max(0,Number(meter.reading.value)||0),0),
    live:machine.meters.some(meter=>meter.status==='live'&&meter.reading)
  })).filter(machine=>machine.live).sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name));
  const total=rows.reduce((sum,machine)=>sum+machine.value,0),donut=$('#share-donut');
  const track='<circle cx="150" cy="150" r="96" fill="none" stroke="#2a414d" stroke-width="62"/>';
  let offset=0;
  const slices=total>0?rows.map((machine,index)=>{
    const share=machine.value/total,percent=share*100,color=palette[index%palette.length];
    const middle=-Math.PI/2+(offset+share/2)*Math.PI*2;
    const label=share>=.075?`<text x="${(150+96*Math.cos(middle)).toFixed(1)}" y="${(154+96*Math.sin(middle)).toFixed(1)}" text-anchor="middle" class="share-slice-label">${Math.round(percent)}%</text>`:'';
    const arc=`<circle cx="150" cy="150" r="96" fill="none" stroke="${color}" stroke-width="62" pathLength="100" stroke-dasharray="${Math.max(0,percent-.45).toFixed(3)} 100" stroke-dashoffset="${(-offset*100).toFixed(3)}" transform="rotate(-90 150 150)"/>`;
    offset+=share;
    return {arc,label};
  }):[];
  donut.innerHTML=`${track}${slices.map(slice=>slice.arc).join('')}${slices.map(slice=>slice.label).join('')}<text x="150" y="145" text-anchor="middle" class="share-center-caption">TOP MACHINE</text><text x="150" y="177" text-anchor="middle" class="share-center-value">${total>0?`${Math.round(rows[0].value/total*100)}%`:'—'}</text>`;
  donut.setAttribute('aria-label',total>0?`Current ${unit} usage share by machine. Highest: ${rows[0].name}, ${Math.round(rows[0].value/total*100)} percent.`:'No current live machine usage to compare');
  $('#share-empty').hidden=total>0;
  $('#share-leader').textContent=total>0?rows[0].name:'—';
  $('#share-leader-detail').textContent=total>0?`${fmt(rows[0].value)} ${unit} · ${Math.round(rows[0].value/total*100)}% of live usage`:'Waiting for live utility usage';
  $('#share-ranking').innerHTML=rows.length?rows.map((machine,index)=>{
    const percent=total>0?machine.value/total*100:0,color=palette[index%palette.length];
    return `<div class="share-row"><span class="share-rank">${index+1}</span><i class="share-swatch" style="background:${color}"></i><div class="share-machine"><strong title="${esc(machine.name)}">${esc(machine.name)}</strong><div class="share-bar"><span style="width:${percent.toFixed(2)}%;background:${color}"></span></div></div><span class="share-rate">${fmt(machine.value)} ${esc(unit)}</span><b>${Math.round(percent)}%</b></div>`;
  }).join(''):'<div class="share-no-machines">No machines are reporting live metering in this category.</div>';
}
function renderCategoryChart(series,baseline,maximum,unit,updatedAt){
  renderRateChart(series,baseline,maximum,unit,updatedAt,'detail');
}
function renderRateChart(series,baseline,maximum,unit,updatedAt,prefix){
  const end=Math.floor(new Date(updatedAt).getTime()/60000)*60000,start=end-59*60000;
  const points=Array(60).fill(null);
  for(const point of series){const index=Math.round((new Date(point.minute).getTime()-start)/60000);if(index>=0&&index<60)points[index]=Number(point.value)}
  const values=points.filter(value=>value!==null),scaleMax=Math.max(1,baseline||0,maximum||0,...values)*1.12;
  const x=index=>52+index*828/59,y=value=>224-value/scaleMax*185;
  const grid=[0,.25,.5,.75,1].map(part=>`<g><line x1="52" y1="${y(scaleMax*part)}" x2="880" y2="${y(scaleMax*part)}" class="trend-gridline"/><text x="43" y="${y(scaleMax*part)+4}" text-anchor="end" class="trend-label">${fmt(scaleMax*part)}</text></g>`).join('');
  const baselineLine=baseline!==null?`<line x1="52" y1="${y(baseline)}" x2="880" y2="${y(baseline)}" class="trend-target"/>`:'';
  const maximumLine=maximum!==null?`<line x1="52" y1="${y(maximum)}" x2="880" y2="${y(maximum)}" class="trend-maximum"/>`:'';
  const segments=[];let segment=[];
  points.forEach((value,index)=>{if(value===null){if(segment.length)segments.push(segment);segment=[]}else segment.push([x(index),y(value)])});
  if(segment.length)segments.push(segment);
  const paths=segments.map(part=>part.length>1?`<polyline class="trend-line" points="${part.map(([px,py])=>`${px.toFixed(1)},${py.toFixed(1)}`).join(' ')}"/>`:`<circle class="trend-dot" cx="${part[0][0]}" cy="${part[0][1]}" r="4"/>`).join('');
  $(`#${prefix}-chart`).innerHTML=`${grid}${baselineLine}${maximumLine}${paths}<text x="880" y="22" text-anchor="end" class="trend-unit">${esc(unit)}</text>`;
  $(`#${prefix}-chart-empty`).hidden=values.length>0;
  const time=value=>new Date(value).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
  $(`#${prefix}-chart-start`).textContent=time(start);$(`#${prefix}-chart-mid`).textContent=time(start+30*60000);$(`#${prefix}-chart-end`).textContent=time(end);
}
function renderMachineDialogSummary(){
  if(!$('#machine-dialog').open||!categoryData||selectedMachineId===null)return;
  const machine=categoryData.machines.find(item=>item.id===selectedMachineId);
  if(!machine){$('#machine-dialog').close();return}
  const live=machine.meters.filter(meter=>meter.status==='live'&&meter.reading);
  const current=live.reduce((sum,meter)=>sum+Number(meter.reading.value),0);
  const baseline=live.reduce((sum,meter)=>sum+Number(meter.baseline),0);
  const maximum=live.reduce((sum,meter)=>sum+Number(meter.max_value),0);
  $('#machine-dialog-title').textContent=machine.name;
  $('#machine-dialog-subtitle').textContent=`${categoryData.category} · ${machine.location_name} · ${machine.code}`;
  $('#machine-dialog-current').textContent=live.length?`${fmt(current)} ${categoryData.unit}`:'—';
  $('#machine-dialog-baseline').textContent=live.length?`${fmt(baseline)} ${categoryData.unit}`:'—';
  $('#machine-dialog-max').textContent=live.length?`${fmt(maximum)} ${categoryData.unit}`:'—';
  $('#machine-dialog-status').textContent=live.length?`${live.length} / ${machine.meters.length} live`:machine.meters.length?'Off / no fresh reading':'No metering assigned';
  $('#machine-dialog-status').classList.toggle('off',!live.length);
}
function openMachineDialog(machineId){
  if(!categoryData?.machines.some(machine=>machine.id===machineId))return;
  selectedMachineId=machineId;machineTrend=null;machineTrendLoading=false;machineTrendGeneration++;
  $('#machine-chart-empty').textContent='Loading machine readings…';
  $('#machine-dialog').showModal();
  renderMachineDialogSummary();
  renderRateChart([],null,null,categoryData.unit,new Date().toISOString(),'machine');
  refreshMachineTrend();
}
async function refreshMachineTrend(){
  if(page!=='category'||!$('#machine-dialog').open||selectedMachineId===null||machineTrendLoading)return;
  const machineId=selectedMachineId,category=categoryName,generation=machineTrendGeneration;
  machineTrendLoading=true;
  try{
    const trend=await api(`/api/machine/${machineId}/trend?category=${encodeURIComponent(category)}`);
    if(generation!==machineTrendGeneration||machineId!==selectedMachineId||category!==categoryName)return;
    machineTrend=trend;
    const machine=categoryData.machines.find(item=>item.id===machineId);
    const live=machine?.meters.filter(meter=>meter.status==='live')||[];
    const baseline=live.length?live.reduce((sum,meter)=>sum+Number(meter.baseline),0):null;
    const maximum=live.length?live.reduce((sum,meter)=>sum+Number(meter.max_value),0):null;
    $('#machine-chart-empty').textContent='No readings in the last hour for this machine.';
    renderRateChart(trend.series,baseline,maximum,categoryData.unit,trend.updated_at,'machine');
  }catch(error){
    if(generation===machineTrendGeneration){$('#machine-chart-empty').textContent=`Machine trend unavailable: ${error.message}`;$('#machine-chart-empty').hidden=false}
  }finally{if(generation===machineTrendGeneration)machineTrendLoading=false}
}
function renderCategoryFeed(events,unit){
  const feed=$('#live-feed'),signature=events.map(event=>event.id).join('|');
  if(feed.dataset.signature===signature)return;
  const follow=!feed.dataset.ready||feed.scrollHeight-feed.scrollTop-feed.clientHeight<45,previousScroll=feed.scrollTop;
  feed.innerHTML=events.length?events.slice().reverse().map(event=>`<div class="feed-item"><time>${new Date(event.observed_at).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</time><div><strong>${esc(event.machine_name)}</strong><span>reported <b>${fmt(event.value)} ${esc(unit)}</b></span></div><i></i></div>`).join(''):'<div class="feed-empty">No readings in the last hour. New MQTT readings will appear here.</div>';
  feed.dataset.ready='1';feed.dataset.signature=signature;if(follow)feed.scrollTop=feed.scrollHeight;else feed.scrollTop=previousScroll;
}

function mapLayout(machines){
  const byId=new Map(machines.map(machine=>[machine.id,machine]));
  const incoming=new Map(machines.map(machine=>[machine.id,0]));
  const levels=new Map(machines.map(machine=>[machine.id,1]));
  const edges=[];
  for(const machine of machines)for(const rightId of machine.right_machine_ids||[]){
    if(!byId.has(rightId))continue;
    edges.push([machine.id,rightId]);incoming.set(rightId,incoming.get(rightId)+1);
  }
  const connected=new Set(edges.flat());
  const pending=machines.filter(machine=>connected.has(machine.id)&&incoming.get(machine.id)===0);
  for(let index=0;index<pending.length;index++){
    const machine=pending[index];
    for(const [leftId,rightId] of edges){
      if(leftId!==machine.id)continue;
      levels.set(rightId,Math.max(levels.get(rightId),levels.get(leftId)+1));
      incoming.set(rightId,incoming.get(rightId)-1);
      if(incoming.get(rightId)===0)pending.push(byId.get(rightId));
    }
  }
  const columns=[];
  for(const machine of machines.filter(machine=>connected.has(machine.id))){
    const level=levels.get(machine.id);(columns[level-1]??=[]).push(machine);
  }
  const unconnected=machines.filter(machine=>!connected.has(machine.id));
  if(unconnected.length)columns.push(unconnected);
  return {columns,edges};
}
function renderMap(){
  if(!data||page!=='map')return;
  if(!data.locations.some(location=>location.id===mapLocationId))mapLocationId=data.locations[0]?.id??null;
  const selectedLocation=data.locations.find(location=>location.id===mapLocationId);
  $('#map-location').innerHTML=data.locations.map(location=>`<option value="${location.id}" ${location.id===mapLocationId?'selected':''}>${esc(location.name)} · ${esc(location.factory_name)}</option>`).join('');
  $('#map-location-title').textContent=selectedLocation?.name||'Location map';
  const {columns}=mapLayout(data.machines.filter(m=>m.location_id===mapLocationId));
  const container=$('#map-columns');container.style.setProperty('--map-column-count',Math.max(1,columns.length));
  container.innerHTML=columns.length?columns.map((machines,index)=>{
    const categories=[...new Set(machines.map(machine=>machine.category))];
    const label=machines.every(machine=>!(machine.left_machine_ids||[]).length&&!(machine.right_machine_ids||[]).length)?'Unconnected':categories.length===1?categories[0]:'Mixed equipment';
    return `<div class="map-column"><div class="map-stage">${String(index+1).padStart(2,'0')} / ${esc(label)}</div>${machines.map(m=>`<div class="machine-node ${m.status==='live'?'':'off'}" data-machine-id="${m.id}"><div class="node-top"><div><strong>${esc(m.name)}</strong><small>${esc(m.code)}</small></div><span class="state-tag ${m.status==='live'?'':'off'}"><i></i></span></div><div class="node-readings">${m.sensors.length?m.sensors.map(s=>s.status==='live'?`<span>${esc(s.type)} ${fmt(s.reading.value)} / ${fmt(s.baseline)} ${esc(s.unit)}</span>`:`<em>${esc(s.type)} · ${statusText(s)}</em>`).join(''):'<em>No metering assigned</em>'}</div></div>`).join('')}</div>`;
  }).join(''):'<div class="map-empty">No machines are assigned to this location.</div>';
  requestAnimationFrame(drawLines);
}
function drawLines(){
  if(page!=='map')return;
  const board=$('#map-board'),svg=$('#map-lines'),width=board.scrollWidth,height=board.scrollHeight;
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  const nodes=new Map([...board.querySelectorAll('.machine-node')].map(node=>[Number(node.dataset.machineId),node]));
  const coordinate=(node,end)=>{const a=node.getBoundingClientRect(),b=board.getBoundingClientRect();return [end?a.right-b.left:a.left-b.left,a.top-b.top+a.height/2]};
  const {edges}=mapLayout(data.machines.filter(m=>m.location_id===mapLocationId));
  svg.innerHTML=edges.map(([from,to])=>{
    const left=nodes.get(from),right=nodes.get(to);if(!left||!right)return '';
    const [x1,y1]=coordinate(left,true),[x2,y2]=coordinate(right,false),mid=(x1+x2)/2;
    const active=left.classList.contains('off')||right.classList.contains('off')?'#4f6570':'#438f7b';
    return `<path d="M ${x1} ${y1} H ${mid} V ${y2} H ${x2-5}" fill="none" stroke="${active}" stroke-width="1.5" opacity=".8"/><path d="M ${x2-6} ${y2-4} L ${x2} ${y2} L ${x2-6} ${y2+4}" fill="none" stroke="${active}" stroke-width="1.5"/>`;
  }).join('');
}
function cellValue(row,key){
  if(key==='enabled')return `<span class="pill ${row.enabled?'':'off'}">${row.enabled?'Enabled':'Off'}</span>`;
  if(key==='baseline')return `${fmt(row.baseline)} ${esc(row.unit)}`;
  if(key==='left_machine_ids'||key==='right_machine_ids')return (row[key]||[]).map(id=>esc(data.machines.find(machine=>machine.id===id)?.name||id)).join(', ')||'—';
  return esc(row[key]??'—');
}
function renderMaster(){
  if(!data||!config[page])return;
  const schema=config[page],query=$('#table-search').value.trim().toLowerCase(),records=data[schema.resource||page];
  $('#master-title').textContent=titles[page];$('#master-description').textContent=descriptions[page];
  const rows=records.filter(row=>!query||JSON.stringify(row).toLowerCase().includes(query));
  $('#record-count').textContent=`${rows.length} of ${records.length} records`;
  $('#master-head').innerHTML=`<tr>${schema.columns.map(([,label])=>`<th>${esc(label)}</th>`).join('')}<th>ACTIONS</th></tr>`;
  $('#master-body').innerHTML=rows.map(row=>`<tr>${schema.columns.map(([key])=>`<td>${cellValue(row,key)}</td>`).join('')}<td><div class="table-actions"><button data-action="edit" data-id="${esc(row.id)}">Edit</button><button class="delete" data-action="delete" data-id="${esc(row.id)}">Delete</button></div></td></tr>`).join('');
  $('#table-empty').hidden=rows.length>0;
}
function optionText(type,row){return type==='machines'?`${row.name} · ${row.location_name}`:type==='production_lines'?`${row.name} · ${row.location_name}`:row.name}
function renderNeighborChoices(form,row){
  const lineId=Number(form.elements.production_line_id.value);
  const peers=data.machines.filter(machine=>machine.production_line_id===lineId&&machine.id!==row?.id);
  for(const side of ['left_machine_ids','right_machine_ids']){
    const selected=new Set(row?.[side]||[]);
    const target=form.querySelector(`[data-neighbor-options="${side}"]`);
    target.innerHTML=peers.length?peers.map(machine=>`<label><input type="checkbox" data-neighbor-side="${side}" value="${machine.id}" ${selected.has(machine.id)?'checked':''}><span>${esc(machine.name)}</span></label>`).join(''):'<span class="neighbor-empty">No other machines on this production line.</span>';
  }
}
function openDialog(row=null){
  editing=row;
  $('#dialog-title').textContent=`${row?'Edit':'Add'} ${page==='metering'?'metering point':titles[page].toLowerCase().replace(/s$/,'')}`;
  $('#form-fields').innerHTML=config[page].fields.map(([key,label,type])=>{
    const value=row?.[key]??(key==='stage'||key==='lane'?1:key==='min_value'?0:key==='max_value'?200:key==='enabled'&&page==='machines'?true:'');
    const wide=['name','description','id'].includes(key)?'wide':'';
    if(type==='machine_neighbors')return `<fieldset class="neighbor-field"><legend>${esc(label)}</legend><div class="neighbor-options" data-neighbor-options="${key}"></div></fieldset>`;
    if(type==='checkbox')return `<label class="check ${wide}"><input name="${key}" type="checkbox" ${value?'checked':''}>${esc(label)}</label>`;
    if(type==='category')return `<label class="${wide}">${esc(label)}<select name="${key}">${['Electricity','Compressed Air','Clean Water','Natural Gas','Diesel'].map(item=>`<option value="${esc(item)}" ${item===value?'selected':''}>${esc(item)}</option>`).join('')}</select></label>`;
    if(data[type])return `<label class="${wide}">${esc(label)}<select name="${key}">${data[type].map(item=>`<option value="${esc(item.id)}" ${String(item.id)===String(value)?'selected':''}>${esc(optionText(type,item))}</option>`).join('')}</select></label>`;
    const numeric=type==='number'||type==='decimal';
    return `<label class="${wide}">${esc(label)}<input name="${key}" type="${numeric?'number':'text'}" ${numeric?`step="${type==='decimal'?'any':'1'}"`:''} value="${esc(value)}" ${key==='id'&&row?'readonly':''} ${key==='description'?'':'required'}></label>`;
  }).join('');
  if(page==='machines')renderNeighborChoices($('#record-form'),row);
  $('#record-dialog').showModal();
}
const reportFmt=value=>value===null||value===undefined?'N/A':Number(value).toLocaleString(undefined,{maximumFractionDigits:2});
function renderReportFactories(){
  if(!data)return;
  const select=$('#report-factory'),selected=select.value;
  const options='<option value="">All factories</option>'+data.factories.map(factory=>`<option value="${factory.id}">${esc(factory.name)}</option>`).join('');
  if(select.innerHTML===options)return;
  select.innerHTML=options;
  if([...select.options].some(option=>option.value===selected))select.value=selected;
}
async function loadReport(){
  if(!isReportPage())return;
  const generation=++reportGeneration,kind=page==='daily_report'?'daily':'monthly';
  const period=$('#report-period').value,factoryId=$('#report-factory').value;
  reportSelections[page]=period;
  if(!period){$('#report-status').textContent='Choose a reporting period.';return}
  const params=new URLSearchParams({period});if(factoryId)params.set('factory_id',factoryId);
  reportData=null;
  $('#report-content').hidden=true;
  $('#report-status').textContent='Calculating report from ClickHouse telemetry…';
  $('#report-status').hidden=false;
  $('#report-download').removeAttribute('href');
  try{
    const result=await api(`/api/reports/${kind}?${params}`);
    if(generation!==reportGeneration||!isReportPage())return;
    reportData=result;
    renderReport();
    $('#report-download').href=`/api/reports/${kind}/pdf?${params}`;
    $('#report-status').textContent=result.samples?'Report ready. PDF uses fresh data when downloaded.':'No readings in this period. The report documents metering gaps and unavailable KPIs.';
  }catch(error){
    if(generation!==reportGeneration)return;
    reportData=null;$('#report-content').hidden=true;
    $('#report-status').textContent=`Report unavailable: ${error.message}`;
  }
}
function renderReport(){
  if(!reportData)return;
  const report=reportData;
  $('#report-content').hidden=false;
  $('#report-period-label').textContent=`${report.kind==='daily'?'DAY':'MONTH'} · ${report.label}${report.partial?' · IN PROGRESS':''}`;
  $('#report-origin').textContent=`${report.data_origin.toUpperCase()} TELEMETRY`;
  $('#report-through').textContent=`THROUGH ${new Date(report.period_end).toLocaleString(undefined,{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'})} WIB`;
  $('#report-summary').innerHTML=[
    ['Utility groups',report.utilities.length,'Current catalog in this report'],
    ['Reporting meters',`${report.reporting_meters} / ${report.meter_count}`,'Points with at least one reading'],
    ['Sample coverage',`${reportFmt(report.coverage_pct)}%`,'Across current metering catalog'],
    ['Readings',reportFmt(report.samples),'ClickHouse samples in period'],
  ].map(([label,value,note])=>`<article class="summary-card"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`).join('');
  $('#report-utility-rows').innerHTML=report.utilities.length?report.utilities.map(group=>{
    const total=group.observed_total===null?'N/A':`${reportFmt(group.observed_total)} ${esc(group.quantity_unit)}`;
    const utilization=group.utilization_pct===null?'N/A':`${reportFmt(group.utilization_pct)}%`;
    return `<tr><td>${esc(group.category)} <small>${esc(group.rate_unit)}</small></td><td><strong>${total}</strong></td><td>${reportFmt(group.coverage_pct)}%</td><td>${utilization}</td><td>${group.reporting_meters} / ${group.meter_count}</td></tr>`;
  }).join(''):'<tr><td colspan="5">No metering points in the selected factory.</td></tr>';
  $('#report-review').innerHTML=report.review_items.map(item=>`<div class="report-list-item"><i>!</i><p>${esc(item)}</p></div>`).join('');
  $('#report-unavailable').innerHTML=report.unavailable.map(item=>`<div class="report-list-item muted"><i>—</i><p>${esc(item)}</p></div>`).join('');
  $('#report-machine-rows').innerHTML=report.utilities.map(group=>{
    const machine=group.machines[0];if(!machine)return '';
    const share=group.observed_total?machine.total/group.observed_total*100:null;
    return `<tr><td>${esc(group.category)}</td><td>${esc(machine.name)} <small>${esc(machine.location)}</small></td><td>${reportFmt(machine.total)} ${esc(group.quantity_unit)}</td><td>${share===null?'N/A':`${reportFmt(share)}%`}</td></tr>`;
  }).join('')||'<tr><td colspan="4">No machine use reported in this period.</td></tr>';
  $('#report-meter-rows').innerHTML=report.meter_quality.map(meter=>`<tr><td>${esc(meter.name)}</td><td>${esc(meter.type)}</td><td>${esc(meter.machine_name)}</td><td>${reportFmt(meter.coverage_pct)}%</td><td>${reportFmt(meter.samples)}</td></tr>`).join('')||'<tr><td colspan="5">No metering points in the selected factory.</td></tr>';
  $('#report-method-text').textContent=report.method;
  const select=$('#report-trend-category'),previous=select.value;
  select.innerHTML=report.utilities.map((group,index)=>`<option value="${index}">${esc(group.category)} · ${esc(group.quantity_unit||group.rate_unit)}</option>`).join('');
  if([...select.options].some(option=>option.value===previous))select.value=previous;
  renderReportTrend();
}
function renderReportTrend(){
  const group=reportData?.utilities[Number($('#report-trend-category').value)];
  const svg=$('#report-trend');
  if(!group){svg.innerHTML='';$('#report-trend-empty').hidden=false;$('#report-trend-times').textContent='';return}
  $('#report-trend-description').textContent=`Observed ${group.quantity_unit||group.rate_unit} by local ${reportData.kind==='daily'?'hour':'day'}. Gaps are unmeasured.`;
  const points=group.trend,values=points.map(point=>point.value).filter(value=>value!==null);
  const maximum=Math.max(1,...values)*1.12,barWidth=610/Math.max(1,points.length),barGap=Math.min(7,barWidth*.18);
  const y=value=>195-value/maximum*155;
  const grid=[0,.25,.5,.75,1].map(part=>`<g><line x1="55" y1="${y(maximum*part)}" x2="680" y2="${y(maximum*part)}" class="trend-gridline"/><text x="48" y="${y(maximum*part)+4}" text-anchor="end" class="trend-label">${fmt(maximum*part)}</text></g>`).join('');
  const bars=points.map((point,index)=>point.value===null?`<rect x="${55+index*barWidth+barGap/2}" y="193" width="${Math.max(2,barWidth-barGap)}" height="2" class="report-missing-bar"/>`:`<rect x="${55+index*barWidth+barGap/2}" y="${y(point.value)}" width="${Math.max(2,barWidth-barGap)}" height="${195-y(point.value)}" rx="2" class="report-value-bar"/>`).join('');
  svg.innerHTML=`${grid}${bars}<text x="680" y="24" text-anchor="end" class="trend-unit">${esc(group.quantity_unit||group.rate_unit)}</text>`;
  $('#report-trend-empty').hidden=values.length>0;
  $('#report-trend-times').innerHTML=points.length?`<span>${esc(points[0].bucket)}</span><span>${esc(points[Math.floor((points.length-1)/2)].bucket)}</span><span>${esc(points.at(-1).bucket)}</span>`:'';
}
async function loadAISettings(){
  const status=$('#ai-settings-status');status.textContent='Loading settings…';
  try{
    const settings=await api('/api/ai/settings');
    $('#ai-api-url').value=settings.api_url||'';
    $('#ai-model').value=settings.model||'';
    $('#ai-api-key').value='';
    $('#ai-clear-key').checked=false;
    $('#ai-key-state').textContent=settings.has_api_key?'A key is saved. Leave this blank to keep it.':'No key saved. Local services may not require one.';
    status.textContent=settings.api_url?'Connection settings loaded.':'Enter a service URL and model to enable chat.';
  }catch(error){status.textContent=`Settings unavailable: ${error.message}`}
}
function addAIMessage(role,text){
  const messages=$('#ai-messages');
  messages.querySelector('.ai-welcome')?.remove();
  const item=document.createElement('article');item.className=`ai-message ${role}`;
  item.innerHTML=`<div class="ai-message-label">${role==='user'?'YOU':'UTILITY AI'}</div><div class="ai-message-text"></div>`;
  item.querySelector('.ai-message-text').textContent=text;
  messages.append(item);messages.scrollTop=messages.scrollHeight;
  return item;
}
function renderAIVisual(visual,evidence){
  const source=evidence.find(item=>item.id===visual.query_id);
  if(!source)return null;
  const rows=source.result.rows,columns=source.result.columns;
  const card=document.createElement('section');card.className='ai-visual';
  const heading=document.createElement('h4');heading.textContent=visual.title;card.append(heading);
  if(visual.kind==='table'){
    const wrap=document.createElement('div');wrap.className='ai-table-wrap';
    wrap.innerHTML=`<table><thead><tr>${columns.map(column=>`<th>${esc(column)}</th>`).join('')}</tr></thead><tbody>${rows.slice(0,20).map(row=>`<tr>${columns.map(column=>`<td>${esc(row[column]??'—')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    card.append(wrap);
  }else{
    const points=rows.filter(row=>Number.isFinite(Number(row[visual.y]))&&row[visual.y]!==null).slice(0,visual.kind==='bar'?18:60);
    if(!points.length)return null;
    const max=Math.max(1,...points.map(row=>Number(row[visual.y])))*1.12;
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 700 250');svg.setAttribute('role','img');svg.setAttribute('aria-label',visual.title);
    const grid=[0,.25,.5,.75,1].map(fraction=>`<g><line x1="52" y1="${205-fraction*170}" x2="680" y2="${205-fraction*170}" class="trend-gridline"/><text x="45" y="${209-fraction*170}" text-anchor="end" class="trend-label">${fmt(max*fraction)}</text></g>`).join('');
    let marks='';
    if(visual.kind==='bar'){
      const width=610/points.length;
      marks=points.map((row,index)=>{const value=Math.max(0,Number(row[visual.y])),height=value/max*170;return `<rect x="${58+index*width}" y="${205-height}" width="${Math.max(3,width-5)}" height="${height}" rx="3" class="report-value-bar"><title>${esc(row[visual.x])}: ${fmt(value)} ${esc(visual.unit)}</title></rect>`}).join('');
    }else{
      const coordinates=points.map((row,index)=>`${58+index*610/Math.max(1,points.length-1)},${205-Math.max(0,Number(row[visual.y]))/max*170}`).join(' ');
      marks=`<polyline points="${coordinates}" class="trend-line"/>`;
    }
    svg.innerHTML=`${grid}${marks}<text x="680" y="24" text-anchor="end" class="trend-unit">${esc(visual.unit)}</text>`;
    card.append(svg);
    const labels=document.createElement('div');labels.className='ai-chart-labels';
    labels.innerHTML=`<span>${esc(points[0][visual.x])}</span><span>${esc(points.at(-1)[visual.x])}</span>`;
    card.append(labels);
  }
  const provenance=document.createElement('small');provenance.textContent=`${visual.query_id} · ${source.database} · ${rows.length}${source.result.truncated?'+':''} rows`;
  card.append(provenance);return card;
}
function renderAIResult(item,result){
  const evidence=result.evidence||[];
  for(const visual of result.visuals||[]){const card=renderAIVisual(visual,evidence);if(card)item.append(card)}
  if(evidence.length){
    const details=document.createElement('details');details.className='ai-evidence';
    const summary=document.createElement('summary');summary.textContent=`View ${evidence.length} data ${evidence.length===1?'query':'queries'}`;details.append(summary);
    for(const source of evidence){
      const block=document.createElement('div');block.className='ai-query';
      const title=document.createElement('strong');title.textContent=`${source.id} · ${source.database} · ${source.result.row_count} rows${source.result.truncated?' (limited)':''}`;
      const sql=document.createElement('pre');sql.textContent=source.sql;
      block.append(title,sql);details.append(block);
    }
    item.append(details);
  }
}
async function askAI(question){
  question=question.trim();if(!question||aiBusy)return;
  const preceding=aiHistory.slice(-6);
  aiHistory.push({role:'user',content:question});
  addAIMessage('user',question);
  $('#ai-question').value='';aiBusy=true;$('#ai-send').disabled=true;$('#ai-send').textContent='Thinking…';
  const pending=addAIMessage('assistant','Checking the utility data…');pending.classList.add('pending');
  try{
    const result=await api('/api/ai/chat','POST',{question,history:preceding});
    pending.classList.remove('pending');
    const answerNode=pending.querySelector('.ai-message-text');
    if(typeof result.answer_html==='string')answerNode.innerHTML=result.answer_html;
    else answerNode.textContent=result.answer;
    renderAIResult(pending,result);
    aiHistory.push({role:'assistant',content:result.answer});
  }catch(error){
    pending.classList.remove('pending');pending.classList.add('failed');
    pending.querySelector('.ai-message-text').textContent=`I could not answer this question: ${error.message}`;
    aiHistory.pop();
  }finally{aiBusy=false;$('#ai-send').disabled=false;$('#ai-send').textContent='Send ↗';$('#ai-messages').scrollTop=$('#ai-messages').scrollHeight}
}
async function refresh(){
  try{data=await api('/api/dashboard');renderOverview();renderReportFactories();if(config[page])renderMaster();if(page==='map')renderMap();if(page==='overview')refreshOverviewTrends();if(page==='notifications')loadAlerts();if(page==='work_plan_editor'&&!$('#work-plan-map-columns').children.length){renderPlanMap();renderPlanSelected()}}
  catch(error){$('#error-banner').textContent=`Dashboard unavailable: ${error.message}`;$('#error-banner').hidden=false;$('#live-badge').classList.add('off');$('#live-badge span').textContent='DATA OFFLINE'}
}
$('#nav').addEventListener('click',event=>{const link=event.target.closest('[data-page]');if(link)showPage(link.dataset.page)});
$('#menu-toggle').addEventListener('click',()=>{
  const open=!$('#sidebar').classList.contains('mobile-open');
  $('#sidebar').classList.toggle('mobile-open',open);
  $('#sidebar-backdrop').hidden=!open;
  $('#menu-toggle').setAttribute('aria-expanded',String(open));
});
$('#sidebar-backdrop').addEventListener('click',closeSidebar);
$('#nav-search-trigger').addEventListener('click',openNavSearch);
$('#nav-search-close').addEventListener('click',()=>$('#nav-search-dialog').close());
$('#nav-search-input').addEventListener('input',renderNavSearch);
$('#nav-search-results').addEventListener('click',event=>{
  const result=event.target.closest('[data-search-page]');if(!result)return;
  $('#nav-search-dialog').close();location.hash=`#${result.dataset.searchPage}`;
});
$('#nav-search-input').addEventListener('keydown',event=>{
  if(event.key!=='Enter')return;
  const first=$('#nav-search-results [data-search-page]');
  if(first){event.preventDefault();first.click()}
});
document.addEventListener('keydown',event=>{
  if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){
    event.preventDefault();
    if($('#nav-search-dialog').open)$('#nav-search-dialog').close();else openNavSearch();
  }
});
$('.alert-filters').addEventListener('click',event=>{const button=event.target.closest('[data-alert-filter]');if(!button)return;alertFilter=button.dataset.alertFilter;renderAlerts()});
async function submitAlertAction(id,action,note=''){
  await api(`/api/notifications/${id}/action`,'POST',{action,note});
  alertData=await api('/api/notifications');
  if(page==='notifications')renderAlerts();
  await refresh();
}
$('#alert-list').addEventListener('click',async event=>{
  const button=event.target.closest('[data-alert-action]');if(!button)return;
  const id=Number(button.dataset.alertId),action=button.dataset.alertAction;
  if(action==='resolve'){
    resolvingAlertId=id;$('#alert-resolve-note').value='';$('#alert-resolve-dialog').showModal();$('#alert-resolve-note').focus();return;
  }
  button.disabled=true;
  try{await submitAlertAction(id,action);toast(action==='ignore'?'Notification ignored':'Machine status updated')}
  catch(error){toast(error.message,true);button.disabled=false}
});
$('#alert-resolve-cancel').addEventListener('click',()=>$('#alert-resolve-dialog').close());
$('#alert-resolve-dialog').addEventListener('close',()=>{resolvingAlertId=null});
$('#alert-resolve-form').addEventListener('submit',async event=>{
  event.preventDefault();if(resolvingAlertId===null)return;
  const button=event.currentTarget.querySelector('button[type="submit"]');button.disabled=true;
  try{await submitAlertAction(resolvingAlertId,'resolve',$('#alert-resolve-note').value.trim());$('#alert-resolve-dialog').close();toast('Notification resolved')}
  catch(error){toast(error.message,true)}
  finally{button.disabled=false}
});
document.addEventListener('click',event=>{const link=event.target.closest('[data-jump]');if(link)showPage(link.dataset.jump)});
window.addEventListener('hashchange',()=>showPage(location.hash.slice(1)));
window.addEventListener('resize',()=>{drawLines();drawPlanLines()});
$('#map-location').addEventListener('change',event=>{mapLocationId=Number(event.target.value);renderMap()});
$('#work-plan-location').addEventListener('change',event=>{planLocationId=Number(event.target.value);renderPlanMap()});
$('#work-plan-map-columns').addEventListener('change',event=>{
  const input=event.target.closest('[data-plan-machine]');if(!input)return;
  const id=Number(input.dataset.planMachine);if(input.checked)planStates.set(id,true);else planStates.delete(id);
  renderPlanMap();renderPlanSelected();
});
$('#work-plan-map-columns').addEventListener('click',event=>{
  const toggle=event.target.closest('[data-plan-toggle]');if(!toggle)return;
  const id=Number(toggle.dataset.planToggle);if(!planStates.has(id))return;
  planStates.set(id,!planStates.get(id));renderPlanMap();renderPlanSelected();
});
$('#work-plan-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const body={date:$('#work-plan-date').value,start_time:$('#work-plan-start').value,duration_hours:Number($('#work-plan-duration').value),pic:$('#work-plan-pic').value.trim(),machines:selectedPlanMachines()};
  if(!body.machines.length){toast('Select at least one machine.',true);return}
  const button=$('#work-plan-save');button.disabled=true;$('#work-plan-save-state').textContent='Saving…';
  try{
    const result=await api(planId?`/api/work-plans/${planId}`:'/api/work-plans',planId?'PUT':'POST',body);
    $('#work-plan-save-state').textContent='Saved';toast('Work plan saved');location.hash=`#work_plan/${result.id}`;
    if(planId===result.id)openPlanEditor(String(result.id));
  }catch(error){$('#work-plan-save-state').textContent=error.message;toast(error.message,true)}
  finally{button.disabled=false}
});
$('#work-plan-delete').addEventListener('click',async()=>{
  if(!planId||!confirm(`Delete Work Plan #${planId}?`))return;
  try{await api(`/api/work-plans/${planId}`,'DELETE');toast('Work plan deleted');location.hash='#work_plan'}catch(error){toast(error.message,true)}
});
$('#work-plan-rows').addEventListener('click',event=>{const link=event.target.closest('a[href^="#work_plan/"]');if(link)showPage(link.getAttribute('href').slice(1))});
$('#table-search').addEventListener('input',renderMaster);
$('#add-record').addEventListener('click',()=>openDialog());
$('#close-dialog').addEventListener('click',()=>$('#record-dialog').close());
$('#cancel-dialog').addEventListener('click',()=>$('#record-dialog').close());
$('#record-form').addEventListener('change',event=>{
  if(page!=='machines')return;
  const form=event.currentTarget;
  if(event.target.name==='production_line_id')renderNeighborChoices(form,editing);
  const side=event.target.dataset.neighborSide;
  if(side&&event.target.checked){
    const other=side==='left_machine_ids'?'right_machine_ids':'left_machine_ids';
    const matching=form.querySelector(`[data-neighbor-side="${other}"][value="${event.target.value}"]`);
    if(matching)matching.checked=false;
  }
});
$('#report-refresh').addEventListener('click',loadReport);
$('#report-period').addEventListener('change',loadReport);
$('#report-factory').addEventListener('change',loadReport);
$('#report-trend-category').addEventListener('change',renderReportTrend);
$('#report-download').addEventListener('click',event=>{if(!event.currentTarget.hasAttribute('href'))event.preventDefault()});
$('#ai-settings-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const status=$('#ai-settings-status');status.textContent='Saving…';
  const values={api_url:$('#ai-api-url').value.trim(),model:$('#ai-model').value.trim(),
    api_key:$('#ai-api-key').value,clear_api_key:$('#ai-clear-key').checked};
  try{
    const result=await api('/api/ai/settings','POST',values);
    $('#ai-api-key').value='';$('#ai-clear-key').checked=false;
    $('#ai-key-state').textContent=result.has_api_key?'A key is saved. Leave this blank to keep it.':'No key saved. Local services may not require one.';
    status.textContent='AI settings saved.';toast('AI settings saved');
  }catch(error){status.textContent=`Could not save: ${error.message}`;toast(error.message,true)}
});
$('#ai-test').addEventListener('click',async event=>{
  const button=event.currentTarget,status=$('#ai-settings-status');
  button.disabled=true;status.textContent='Contacting the saved AI service…';
  try{await api('/api/ai/settings/test','POST',{});status.textContent='Connection works. You can use Chat with AI.'}
  catch(error){status.textContent=`Connection failed: ${error.message}`}
  finally{button.disabled=false}
});
$('#ai-form').addEventListener('submit',event=>{event.preventDefault();askAI($('#ai-question').value)});
$('#ai-question').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();askAI(event.currentTarget.value)}});
$('#ai-messages').addEventListener('click',event=>{const button=event.target.closest('[data-prompt]');if(button)askAI(button.dataset.prompt)});
$('#machine-gauges').addEventListener('click',event=>{
  const card=event.target.closest('[data-machine-id]');
  if(card)openMachineDialog(Number(card.dataset.machineId));
});
$('#machine-gauges').addEventListener('keydown',event=>{
  if(event.key!=='Enter'&&event.key!==' ')return;
  const card=event.target.closest('[data-machine-id]');
  if(card){event.preventDefault();openMachineDialog(Number(card.dataset.machineId))}
});
$('#close-machine-dialog').addEventListener('click',()=>$('#machine-dialog').close());
$('#machine-dialog').addEventListener('close',()=>{selectedMachineId=null;machineTrend=null;machineTrendLoading=false;machineTrendGeneration++});
$('#master-body').addEventListener('click',async event=>{
  const button=event.target.closest('button[data-action]');if(!button)return;
  const row=data[config[page].resource||page].find(item=>String(item.id)===button.dataset.id);if(!row)return;
  if(button.dataset.action==='edit')return openDialog(row);
  if(!confirm(`Delete ${row.name || row.id}? Items with related records cannot be deleted.`))return;
  try{await api(`/api/master/${config[page].resource||page}`,'DELETE',{id:row.id});toast('Record deleted');await refresh()}catch(error){toast(error.message,true)}
});
$('#record-form').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget,values={};
  for(const [key,,type] of config[page].fields){
    if(type==='machine_neighbors'){values[key]=[...form.querySelectorAll(`[data-neighbor-side="${key}"]:checked`)].map(input=>Number(input.value));continue}
    const input=form.elements[key];values[key]=type==='checkbox'?input.checked:['number','decimal','factories','locations','production_lines','machines'].includes(type)?Number(input.value):input.value.trim();
  }
  if(editing)values.id=editing.id;
  try{await api(`/api/master/${config[page].resource||page}`,editing?'PUT':'POST',values);$('#record-dialog').close();toast('Record saved');await refresh()}catch(error){toast(error.message,true)}
});
function clock(){ $('#clock').textContent=new Date().toLocaleString(undefined,{weekday:'short',hour:'2-digit',minute:'2-digit'}) }
clock();setInterval(clock,30000);showPage(location.hash.slice(1));refresh();setInterval(refresh,5000);setInterval(refreshCategory,2000);setInterval(refreshMachineTrend,2000);setInterval(()=>{if(page==='work_plan_editor'&&planId)api(`/api/work-plans/${planId}`).then(p=>{if(page==='work_plan_editor'&&planId===p.id){planDetail=p;renderPlanAnalysis()}}).catch(()=>{})},5000);
