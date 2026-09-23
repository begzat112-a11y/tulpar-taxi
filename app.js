/* =========================================================
   TULPAR TAXI — FULL APP.JS
   2GIS MapGL + Directions + Firebase Realtime Database
   ========================================================= */

const API_KEY = 'd771d962-3726-43ba-bf11-e82ed12d3085';
const DEFAULT_CENTER = [74.6036, 42.8746], DEFAULT_ZOOM = 12.5;

const TARIFFS = {
  economy:{name:'Эконом',start:50,km:12,minFare:120},
  comfort:{name:'Комфорт',start:80,km:18,minFare:170},
  premium:{name:'Premium',start:150,km:30,minFare:250},
  porter:{name:'Porter',start:300,km:25,minute:5,minFare:300,description:'Грузовой Портер для вещей и рынков'},
  aimak:{name:'Аймак',description:'Межгород и дальние поездки'}
};

const PAYMENT_METHODS = {
  cash:{name:'Наличные',icon:'💵'},
  elcart:{name:'Элкарт',icon:'💳'},
  mbank:{name:'MBANK',icon:'🏦'},
  odengi:{name:'O!Деньги',icon:'📱'}
};

const TULPAR_SURGE = {peak:1.3,rain:1.4,snow:1.6};
let tulparWeather = 'sunny';

const LANG_PACK = {
  ru:{order:'Заказать Tulpar',routeReady:'Маршрут готов',noPlace:'Место не найдено',routeError:'Не удалось построить маршрут',locationError:'Разрешите геолокацию в браузере',locationUnavailable:'Геолокация недоступна',selectedPoint:'Выбранная точка',myLocation:'Моё местоположение',home:'Дом',work:'Работа',peak:'Высокий спрос в часы пик',rain:'Высокий спрос из-за дождя',snow:'Высокий спрос из-за снега',peakRain:'Часы пик и дождь: высокий спрос',peakSnow:'Часы пик и снег: высокий спрос'},
  kg:{order:'Tulpar заказ кылуу',routeReady:'Маршрут даяр',noPlace:'Жер табылган жок',routeError:'Маршрут түзүлбөдү',locationError:'Браузерде геолокацияга уруксат бериңиз',locationUnavailable:'Геолокация жеткиликтүү эмес',selectedPoint:'Тандалган жер',myLocation:'Менин жайгашкан жерим',home:'Үй',work:'Жумуш',peak:'Кызуу маалда суроо-талап жогору',rain:'Жамгырга байланыштуу суроо-талап жогору',snow:'Карга байланыштуу суроо-талап жогору',peakRain:'Кызуу маал жана жамгыр: суроо-талап жогору',peakSnow:'Кызуу маал жана кар: суроо-талап жогору'},
  en:{order:'Order Tulpar',routeReady:'Route ready',noPlace:'Place not found',routeError:'Could not build route',locationError:'Allow location access in your browser',locationUnavailable:'Geolocation unavailable',selectedPoint:'Selected location',myLocation:'My location',home:'Home',work:'Work',peak:'High demand during peak hours',rain:'High demand due to rain',snow:'High demand due to snow',peakRain:'Peak hours and rain: high demand',peakSnow:'Peak hours and snow: high demand'}
};

let currentLang='ru';
let map=null,directions=null,fromPoint=null,toPoint=null,fromMarker=null,toMarker=null,myMarker=null;
let carMarkers=[],taxiCars=[],activeMode='car',activeTariff='economy',pickMode=null,searchTimer=null,routeData=null,currentOrder=null,sheetDragY=null;

const $=id=>document.getElementById(id);
const sheet=$('routeSheet'),input=$('searchInput'),suggestions=$('suggestions'),toast=$('toast');

function toastMsg(message){if(!toast)return;toast.textContent=message;toast.classList.remove('hidden');clearTimeout(toastMsg.timer);toastMsg.timer=setTimeout(()=>toast.classList.add('hidden'),2800)}
function loading(show){const el=$('loader');if(!el)return;el.style.opacity=show?'1':'0';el.style.pointerEvents=show?'auto':'none'}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function dist(m){if(m==null)return'—';return m<1000?Math.round(m)+' м':(m/1000).toFixed(m<10000?1:0)+' км'}
function time(s){if(s==null)return'—';const m=Math.max(1,Math.round(s/60));return m<60?m+' мин':Math.floor(m/60)+' ч'+(m%60?' '+m%60+' мин':'')}
function kmFromMeters(m){return Math.max(0,Number(m||0)/1000)}
function minutesFromSeconds(s){return Math.max(1,Math.round(Number(s||0)/60))}
function storageGet(k,f=null){try{const v=localStorage.getItem(k);return v===null?f:JSON.parse(v)}catch{return f}}
function storageSet(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
function t(k){return LANG_PACK[currentLang]?.[k]||LANG_PACK.ru[k]||k}

function savePlace(slot,point,label){storageSet(`tulpar_${slot}`,{point,label})}
function getPlace(slot){return storageGet(`tulpar_${slot}`,null)}
function getRecentTrips(){return storageGet('tulpar_recent_trips',[])}
function saveRecentTrip(){
  if(!fromPoint||!toPoint)return;
  const trips=getRecentTrips();
  trips.unshift({from:{point:fromPoint,label:$('fromText')?.textContent||''},to:{point:toPoint,label:$('toText')?.textContent||''},tariff:activeTariff,createdAt:Date.now()});
  storageSet('tulpar_recent_trips',trips.slice(0,3));
}

function openSheet(){sheet?.classList.remove('collapsed');sheet?.classList.add('expanded')}
function collapseSheet(){sheet?.classList.remove('expanded');sheet?.classList.add('collapsed');suggestions?.classList.add('hidden')}
function pick(mode){pickMode=mode;openSheet();$('pickHint')?.classList.remove('hidden');if(sheet)sheet.style.opacity='.78'}
function stopPick(){pickMode=null;$('pickHint')?.classList.add('hidden');if(sheet)sheet.style.opacity='1'}

function createRouteMarker(point,type){
  if(!map)return null;
  return new mapgl.HtmlMarker(map,{coordinates:point,html:type==='from'?'<div class="tm-marker tm-from"></div>':'<div class="tm-marker tm-to">✦</div>'});
}
function setFrom(point,label){
  fromPoint=point;
  if($('fromText'))$('fromText').textContent=label||t('myLocation');
  fromMarker?.destroy();
  fromMarker=createRouteMarker(point,'from');
  if(toPoint)route();
}
function setTo(point,label){
  toPoint=point;
  if($('toText'))$('toText').textContent=label||t('selectedPoint');
  toMarker?.destroy();
  toMarker=createRouteMarker(point,'to');
  $('closeRouteBtn')?.classList.remove('hidden');
  if($('orderBtn'))$('orderBtn').disabled=false;
  openSheet();
  route();
}

async function reverse(point){
  try{
    const u=new URL('https://catalog.api.2gis.com/3.0/items/geocode');
    u.searchParams.set('lon',point[0]);u.searchParams.set('lat',point[1]);u.searchParams.set('locale','ru_KG');u.searchParams.set('key',API_KEY);
    const d=await(await fetch(u)).json(),i=d?.result?.items?.[0];
    return i?.address_name||i?.full_name||t('selectedPoint');
  }catch{return t('selectedPoint')}
}
async function objects(q){
  const u=new URL('https://catalog.api.2gis.com/3.0/items');
  u.searchParams.set('q',q);u.searchParams.set('fields','items.point,items.address,items.full_address_name,items.rubrics');u.searchParams.set('page_size','8');u.searchParams.set('locale','ru_KG');u.searchParams.set('key',API_KEY);
  if(map){const c=map.getCenter();u.searchParams.set('location',`${c[0]},${c[1]}`)}
  const d=await(await fetch(u)).json();return d?.result?.items||[];
}
async function suggest(q){
  const u=new URL('https://catalog.api.2gis.com/3.0/suggests');
  u.searchParams.set('q',q);u.searchParams.set('page_size','8');u.searchParams.set('locale','ru_KG');u.searchParams.set('key',API_KEY);
  if(map){const c=map.getCenter();u.searchParams.set('location',`${c[0]},${c[1]}`)}
  const d=await(await fetch(u)).json();return d?.result?.items||[];
}
function renderSuggestions(items){
  if(!suggestions)return;
  suggestions.innerHTML='';
  if(!items.length){suggestions.classList.add('hidden');return}
  items.slice(0,8).forEach(i=>{
    const b=document.createElement('button');b.className='suggestion';
    const n=i.name||i.title||i.full_name||'Объект',s=i.address_name||i.full_name||i.type||'';
    b.innerHTML=`<span class="s-icon">${i.type==='building'?'⌂':'•'}</span><span class="s-main"><strong>${esc(n)}</strong><small>${esc(s)}</small></span>`;
    b.onclick=async()=>{suggestions.classList.add('hidden');input.value=n;await selectPlace(n)};
    suggestions.appendChild(b);
  });
  suggestions.classList.remove('hidden');
}
async function selectPlace(q){
  try{
    const a=await objects(q),i=a.find(x=>x.point?.lon!=null&&x.point?.lat!=null);if(!i)throw 0;
    const p=[+i.point.lon,+i.point.lat],l=i.full_address_name||i.address_name||i.full_name||i.name||q;
    map?.setCenter(p);map?.setZoom(16);
    pickMode==='from'?setFrom(p,l):setTo(p,l);
    stopPick();input.value='';$('clearSearch')?.classList.add('hidden');
  }catch{toastMsg(t('noPlace'))}
}

function renderRouteVariants(routes){
  const box=$('routeVariants');if(!box)return;box.innerHTML='';
  if(!Array.isArray(routes)||routes.length<2){box.classList.add('hidden');return}
  routes.slice(0,3).forEach((r,i)=>{
    const b=document.createElement('button');b.className='variant'+(!i?' active':'');
    b.innerHTML=`<b>${!i?'Основной маршрут':'Вариант '+(i+1)}</b><small>${r.ui_total_duration||time(r.total_duration)} • ${r.ui_total_distance?.value||dist(r.total_distance)}</small>`;
    b.onclick=()=>{box.querySelectorAll('.variant').forEach(x=>x.classList.remove('active'));b.classList.add('active');routeData=r;updatePrices(r.total_distance,r.total_duration)};
    box.appendChild(b);
  });
  box.classList.remove('hidden');
}

function getCurrentMinutes(){const d=new Date();return d.getHours()*60+d.getMinutes()}
function isPeakHour(){const m=getCurrentMinutes();return(m>=480&&m<=570)||(m>=1050&&m<=1170)}
function getSurgeInfo(){
  const peak=isPeakHour();let multiplier=1;
  if(peak)multiplier*=TULPAR_SURGE.peak;
  if(tulparWeather==='rain')multiplier*=TULPAR_SURGE.rain;
  if(tulparWeather==='snow')multiplier*=TULPAR_SURGE.snow;
  let reason='';
  if(peak&&tulparWeather==='rain')reason=t('peakRain');
  else if(peak&&tulparWeather==='snow')reason=t('peakSnow');
  else if(peak)reason=t('peak');
  else if(tulparWeather==='rain')reason=t('rain');
  else if(tulparWeather==='snow')reason=t('snow');
  return{multiplier,reason,peak};
}
function setTulparWeather(weather){
  if(!['sunny','rain','snow'].includes(weather))return;
  tulparWeather=weather;
  if(routeData)updatePrices(routeData.total_distance,routeData.total_duration);
}

function calculateBasePrice(meters,seconds,tariff){
  const x=TARIFFS[tariff];if(!x||!meters)return 0;
  const km=kmFromMeters(meters),minutes=minutesFromSeconds(seconds);
  if(tariff==='porter')return Math.max(x.minFare,Math.round(x.start+km*x.km+minutes*x.minute));
  return Math.max(x.minFare,Math.round(x.start+km*x.km));
}
function normalizePlaceName(v){return String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[—–-]/g,' ').replace(/[.,]/g,' ').replace(/\s+/g,' ').trim()}
function hasAny(text,words){return words.some(w=>text.includes(normalizePlaceName(w)))}
function getAimakFixedPrice(){
  const combined=`${normalizePlaceName($('fromText')?.textContent)} ${normalizePlaceName($('toText')?.textContent)}`;
  if(hasAny(combined,['чолпон ата','cholpon ata'])&&hasAny(combined,['бишкек','bishkek']))return 3500;
  if(hasAny(combined,['каракол','karakol'])&&hasAny(combined,['бишкек','bishkek']))return 5000;
  if(hasAny(combined,['ош','osh'])&&hasAny(combined,['бишкек','bishkek']))return 12000;
  return null;
}
function calculateAimakPrice(meters){return getAimakFixedPrice()||Math.max(500,Math.round(kmFromMeters(meters)*20))}
function applySurgePrice(base,tariff){if(tariff==='aimak')return Math.round(base/10)*10;const s=getSurgeInfo();return Math.round(base*s.multiplier/10)*10}
function getPrice(meters,seconds,tariff){
  if(!meters)return'—';
  const base=tariff==='aimak'?calculateAimakPrice(meters):calculateBasePrice(meters,seconds,tariff);
  return `${applySurgePrice(base,tariff)} с`;
}
function updatePrices(meters,seconds){
  if(!meters)return;
  ['economy','comfort','premium','porter','aimak'].forEach(tariff=>{
    const el=$(`${tariff}Price`);if(el)el.textContent=getPrice(meters,seconds,tariff);
  });
  updateSurgeIndicators();
}
function updateSurgeIndicators(){
  const info=getSurgeInfo();
  document.querySelectorAll('.surge-indicator').forEach(el=>el.remove());
  if(info.multiplier<=1)return;
  document.querySelectorAll('.tariff').forEach(button=>{
    if(button.dataset.type==='aimak')return;
    const el=document.createElement('small');el.className='surge-indicator';el.textContent=`⚡ ×${info.multiplier.toFixed(1)}`;button.appendChild(el);
  });
}

async function route(){
  if(!fromPoint||!toPoint||!directions)return;
  $('routeInfo')?.classList.add('hidden');$('tariffs')?.classList.add('hidden');$('routeVariants')?.classList.add('hidden');
  try{
    directions.clear();
    directions.once('directionsLoaded',e=>{
      const r=e?.routes?.[0];if(!r)return;
      routeData=r;
      if($('routeTime'))$('routeTime').textContent=r.ui_total_duration||time(r.total_duration);
      if($('routeDistance'))$('routeDistance').textContent=r.ui_total_distance?.value?`${r.ui_total_distance.value} ${r.ui_total_distance.unit||''}`:dist(r.total_distance);
      $('routeInfo')?.classList.remove('hidden');updatePrices(r.total_distance,r.total_duration);$('tariffs')?.classList.remove('hidden');renderRouteVariants(e.routes);
      if(r.total_distance>50000){
        activeTariff='aimak';
        document.querySelectorAll('.tariff').forEach(b=>b.classList.toggle('active',b.dataset.type==='aimak'));
        toastMsg('🏔️ Дальняя поездка — доступен тариф Аймак');
      }
      if($('sheetTitle'))$('sheetTitle').textContent=t('routeReady');
    });
    if(activeMode==='walk')await directions.pedestrianRoute({points:[fromPoint,toPoint]});
    else await directions.carRoute({points:[fromPoint,toPoint],style:{routeLineWidth:6,substrateLineWidth:12,haloLineWidth:18}});
  }catch(e){console.error(e);toastMsg(t('routeError'))}
}

const TAXI_START_POINTS=[[74.590,42.867],[74.615,42.878],[74.628,42.853],[74.575,42.889],[74.650,42.874],[74.606,42.902],[74.557,42.863],[74.640,42.906]];
function randomNearbyPoint(c){return[c[0]+(Math.random()-.5)*.025,c[1]+(Math.random()-.5)*.018]}
function createTaxiCars(){
  taxiCars.forEach(t=>t.marker?.destroy());taxiCars=[];
  TAXI_START_POINTS.forEach((position,index)=>{
    const marker=new mapgl.HtmlMarker(map,{coordinates:position,html:`<div class="car-marker" data-taxi="${index}">🚕</div>`});
    taxiCars.push({id:`taxi_${index+1}`,position:[...position],marker,busy:false});
  });
  carMarkers=taxiCars.map(t=>t.marker);
}
function moveTaxiTo(taxi,target,duration=3500){
  if(!taxi?.marker)return Promise.resolve();
  const start=[...taxi.position],startTime=performance.now();
  return new Promise(resolve=>{
    function frame(now){
      const p=Math.min(1,(now-startTime)/duration),e=p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2;
      const cur=[start[0]+(target[0]-start[0])*e,start[1]+(target[1]-start[1])*e];
      taxi.position=cur;taxi.marker.setCoordinates(cur);
      if(p<1)requestAnimationFrame(frame);else{taxi.position=[...target];resolve()}
    }
    requestAnimationFrame(frame);
  });
}
function startTaxiSimulation(){
  if(!map)return;
  setInterval(async()=>{
    const available=taxiCars.filter(t=>!t.busy);if(!available.length)return;
    const taxi=available[Math.floor(Math.random()*available.length)];
    await moveTaxiTo(taxi,randomNearbyPoint(taxi.position),4500);
  },5200);
}
function coordinateDistance(a,b){const dx=a[0]-b[0],dy=a[1]-b[1];return Math.sqrt(dx*dx+dy*dy)}
function findNearestTaxi(point){
  if(!point)return null;let nearest=null,distance=Infinity;
  taxiCars.forEach(t=>{if(t.busy)return;const d=coordinateDistance(t.position,point);if(d<distance){distance=d;nearest=t}});
  return nearest;
}
async function animateTaxiToPickup(taxi,pickup){
  if(!taxi||!pickup)return;
  taxi.busy=true;const start=[...taxi.position],steps=18;
  for(let i=1;i<=steps;i++){
    const p=i/steps,target=[start[0]+(pickup[0]-start[0])*p,start[1]+(pickup[1]-start[1])*p];
    await moveTaxiTo(taxi,target,350);
  }
}

function locate(){
  if(!navigator.geolocation){toastMsg(t('locationUnavailable'));return}
  navigator.geolocation.getCurrentPosition(pos=>{
    const p=[pos.coords.longitude,pos.coords.latitude];
    myMarker?.destroy();
    myMarker=new mapgl.HtmlMarker(map,{coordinates:p,html:'<div class="me-marker"><span></span></div>'});
    map.setCenter(p);map.setZoom(15);
    if(!fromPoint)setFrom(p,t('myLocation'));
  },()=>toastMsg(t('locationError')),{enableHighAccuracy:true,timeout:10000,maximumAge:60000});
}
function reset(){
  directions?.clear();toMarker?.destroy();toMarker=null;toPoint=null;routeData=null;currentOrder=null;
  if($('toText'))$('toText').textContent='Выберите место или найдите его';
  $('routeInfo')?.classList.add('hidden');$('routeVariants')?.classList.add('hidden');$('tariffs')?.classList.add('hidden');
  if($('orderBtn'))$('orderBtn').disabled=true;$('closeRouteBtn')?.classList.add('hidden');
  if($('sheetTitle'))$('sheetTitle').textContent='Куда едем?';removeOrderUI();
}

function firebaseReady(){return Boolean(window.TulparFirebase?.db)}
function firebaseRef(path){return firebaseReady()?window.TulparFirebase.ref(window.TulparFirebase.db,path):null}
function generateOrderId(){return['order',Date.now(),Math.random().toString(36).slice(2,8)].join('_')}
function buildOrderData(){
  if(!routeData||!fromPoint||!toPoint)return null;
  const base=activeTariff==='aimak'?calculateAimakPrice(routeData.total_distance):calculateBasePrice(routeData.total_distance,routeData.total_duration,activeTariff);
  return{id:generateOrderId(),status:'searching',createdAt:Date.now(),updatedAt:Date.now(),tariff:activeTariff,tariffName:TARIFFS[activeTariff]?.name||activeTariff,payment:storageGet('tulpar_payment','cash'),from:{point:fromPoint,label:$('fromText')?.textContent||''},to:{point:toPoint,label:$('toText')?.textContent||''},distance:routeData.total_distance,duration:routeData.total_duration,price:applySurgePrice(base,activeTariff),currency:'KGS',surge:getSurgeInfo(),weather:tulparWeather,driver:null}
}
async function saveOrderToFirebase(order){
  if(!firebaseReady())return false;
  try{await window.TulparFirebase.set(firebaseRef(`orders/${order.id}`),order);return true}catch(e){console.error('Firebase order error:',e);return false}
}
async function updateOrder(id,data){
  if(!firebaseReady())return false;
  try{await window.TulparFirebase.update(firebaseRef(`orders/${id}`),{...data,updatedAt:Date.now()});return true}catch(e){console.error('Firebase update error:',e);return false}
}

async function assignDriver(order){
  const taxi=findNearestTaxi(order.from.point);if(!taxi)return null;
  const names=['Бакыт','Эрмек','Нурбек','Азиз','Данияр','Руслан','Азамат','Кубаныч'];
  const cars=['Toyota Prius','Honda Fit','Toyota Camry','Hyundai Sonata','Toyota Corolla'];
  const driver={id:taxi.id,name:names[Math.floor(Math.random()*names.length)],car:cars[Math.floor(Math.random()*cars.length)],number:'01 '+(100+Math.floor(Math.random()*899))+' AA',rating:(4.7+Math.random()*.3).toFixed(1),taxiId:taxi.id};
  taxi.busy=true;order.driver=driver;
  await updateOrder(order.id,{status:'driver_assigned',driver});
  showDriverUI(order);
  await animateTaxiToPickup(taxi,order.from.point);
  await updateOrder(order.id,{status:'driver_arrived'});showDriverArrivedUI();
  setTimeout(async()=>{taxi.busy=false;await updateOrder(order.id,{status:'completed'});showOrderCompletedUI()},20000);
  return driver;
}

function removeOrderUI(){document.querySelectorAll('.tulpar-order-panel').forEach(el=>el.remove())}
function showDriverUI(order){
  removeOrderUI();
  const panel=document.createElement('div');panel.className='tulpar-order-panel';
  panel.innerHTML=`<div class="tulpar-driver-card"><div class="tulpar-driver-icon">🚕</div><div class="tulpar-driver-info"><strong>${esc(order.driver?.name||'Водитель')}</strong><small>${esc(order.driver?.car||'')} • ${esc(order.driver?.number||'')}</small><small>⭐ ${esc(order.driver?.rating||'4.9')}</small></div><div class="tulpar-driver-status">Едет</div></div><button class="tulpar-cancel-order" id="cancelTulparOrder">Отменить поездку</button>`;
  document.body.appendChild(panel);$('cancelTulparOrder').onclick=cancelCurrentOrder;
}
function showDriverArrivedUI(){const s=document.querySelector('.tulpar-driver-status');if(s)s.textContent='🚕 Водитель на месте'}
function showOrderCompletedUI(){const s=document.querySelector('.tulpar-driver-status');if(s)s.textContent='✓ Поездка завершена';setTimeout(removeOrderUI,3500)}

async function createOrder(){
  if(!routeData||!fromPoint||!toPoint){toastMsg('Сначала выберите маршрут');return}
  if(currentOrder){toastMsg('У вас уже есть активная поездка');return}
  const order=buildOrderData();if(!order)return;
  currentOrder=order;saveRecentTrip();storageSet('tulpar_active_order',order);
  const saved=await saveOrderToFirebase(order);
  toastMsg(saved?'🚕 Заказ создан':'🚕 Заказ создан локально');
  showSearchingUI();
  setTimeout(()=>assignDriver(order),2200);
}
function showSearchingUI(){
  removeOrderUI();
  const panel=document.createElement('div');panel.className='tulpar-order-panel';
  panel.innerHTML=`<div class="tulpar-driver-card"><div class="tulpar-driver-icon">🔎</div><div class="tulpar-driver-info"><strong>Ищем водителя…</strong><small>${esc(TARIFFS[currentOrder?.tariff]?.name||'Tulpar')}</small><small>${esc(getPrice(currentOrder?.distance,currentOrder?.duration,currentOrder?.tariff))}</small></div><div class="tulpar-driver-status">Поиск</div></div><button class="tulpar-cancel-order" id="cancelTulparOrder">Отменить</button>`;
  document.body.appendChild(panel);$('cancelTulparOrder').onclick=cancelCurrentOrder;
}
async function cancelCurrentOrder(){
  if(!currentOrder)return;
  await updateOrder(currentOrder.id,{status:'cancelled'});storageSet('tulpar_active_order',null);currentOrder=null;taxiCars.forEach(t=>t.busy=false);removeOrderUI();toastMsg('Поездка отменена');
}

function getPaymentMethod(){return storageGet('tulpar_payment','cash')}
function setPaymentMethod(method){
  if(!PAYMENT_METHODS[method])return;
  storageSet('tulpar_payment',method);window.TulparPayment=method;
  document.dispatchEvent(new CustomEvent('tulpar:payment-change',{detail:{method,data:PAYMENT_METHODS[method]}}));
}
function setupPaymentUI(){
  document.querySelectorAll('[data-payment]').forEach(b=>b.onclick=()=>{const m=b.dataset.payment;setPaymentMethod(m);document.querySelectorAll('[data-payment]').forEach(x=>x.classList.toggle('active',x.dataset.payment===m))});
  setPaymentMethod(getPaymentMethod());
}
function setupTariffs(){
  document.querySelectorAll('.tariff').forEach(b=>b.onclick=()=>{
    const tariff=b.dataset.type;if(!TARIFFS[tariff])return;
    activeTariff=tariff;document.querySelectorAll('.tariff').forEach(x=>x.classList.toggle('active',x.dataset.type===tariff));
    if(routeData)updatePrices(routeData.total_distance,routeData.total_duration);
  });
}
function setupSavedPlaces(){
  document.querySelectorAll('[data-slot]').forEach(b=>b.onclick=()=>{
    const slot=b.dataset.slot,place=getPlace(slot);
    if(!place){pick('to');toastMsg(`Выберите точку — сохраним как ${slot==='home'?t('home'):t('work')}`);window.TulparSavingSlot=slot;return}
    setTo(place.point,place.label);map?.setCenter(place.point);map?.setZoom(15);
  });
}
const originalSetTo=setTo;
setTo=function(point,label){
  originalSetTo(point,label);
  if(window.TulparSavingSlot){savePlace(window.TulparSavingSlot,point,label);toastMsg(`Сохранено: ${window.TulparSavingSlot==='home'?t('home'):t('work')}`);window.TulparSavingSlot=null}
}

function init(){
  if(!window.mapgl){toastMsg('Не загрузилась библиотека 2ГИС');return}
  try{
    map=new mapgl.Map('map',{key:API_KEY,center:DEFAULT_CENTER,zoom:DEFAULT_ZOOM,copyright:'bottomLeft'});
    map.on('click',async e=>{if(!pickMode)return;const p=e.lngLat,l=await reverse(p);pickMode==='from'?setFrom(p,l):setTo(p,l);stopPick()});
    map.on('idle',()=>loading(false));
    directions=new mapgl.Directions(map,{directionsApiKey:API_KEY});
    createTaxiCars();startTaxiSimulation();setTimeout(locate,900);
  }catch(e){console.error(e);loading(false);toastMsg('Ошибка запуска карты')}
}

function setupSearch(){
  input?.addEventListener('focus',openSheet);
  input?.addEventListener('input',()=>{
    clearTimeout(searchTimer);const q=input.value.trim();$('clearSearch')?.classList.toggle('hidden',!q);
    if(q.length<2){suggestions?.classList.add('hidden');return}
    searchTimer=setTimeout(async()=>{try{renderSuggestions(await suggest(q))}catch{suggestions?.classList.add('hidden')}},260);
  });
  input?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();const q=input.value.trim();if(q)selectPlace(q)}});
  $('clearSearch')?.addEventListener('click',()=>{input.value='';suggestions?.classList.add('hidden');$('clearSearch')?.classList.add('hidden');input.focus()});
}
function setupUI(){
  $('locateBtn')?.addEventListener('click',locate);
  $('zoomInBtn')?.addEventListener('click',()=>map?.setZoom(map.getZoom()+1));
  $('zoomOutBtn')?.addEventListener('click',()=>map?.setZoom(map.getZoom()-1));
  $('miniBrand')?.addEventListener('click',()=>sheet?.classList.contains('collapsed')?openSheet():collapseSheet());
  $('sheetHandle')?.addEventListener('click',()=>sheet?.classList.contains('collapsed')?openSheet():collapseSheet());
  $('toRow')?.addEventListener('click',()=>{openSheet();input?.focus()});
  $('fromRow')?.addEventListener('click',()=>pick('from'));
  $('pickOnMapBtn')?.addEventListener('click',()=>pick('to'));
  $('cancelPickBtn')?.addEventListener('click',stopPick);
  $('closeRouteBtn')?.addEventListener('click',reset);
  document.querySelectorAll('.mode').forEach(b=>b.onclick=()=>{document.querySelectorAll('.mode').forEach(x=>x.classList.remove('active'));b.classList.add('active');activeMode=b.dataset.mode;if(fromPoint&&toPoint)route()});
  $('orderBtn')?.addEventListener('click',createOrder);
  document.addEventListener('click',e=>{if(!e.target.closest('.search-wrap'))suggestions?.classList.add('hidden')});
  $('sheetHandle')?.addEventListener('touchstart',e=>sheetDragY=e.touches[0].clientY,{passive:true});
  $('sheetHandle')?.addEventListener('touchend',e=>{if(sheetDragY===null)return;const d=e.changedTouches[0].clientY-sheetDragY;sheetDragY=null;if(d<-25)openSheet();else if(d>25)collapseSheet()},{passive:true});
}

window.addEventListener('tulpar:firebase-ready',()=>{
  console.log('🔥 Tulpar Firebase ready');
  const active=storageGet('tulpar_active_order',null);
  if(active&&active.status!=='completed'&&active.status!=='cancelled'){currentOrder=active;showSearchingUI()}
});
window.addEventListener('tulpar:firebase-error',e=>console.error('Tulpar Firebase error:',e.detail));

window.Tulpar={
  get map(){return map},
  get route(){return routeData},
  get order(){return currentOrder},
  get tariff(){return activeTariff},
  setWeather:setTulparWeather,
  setLanguage:language=>{if(LANG_PACK[language]){currentLang=language;return true}return false},
  calculatePrice:(meters,seconds,tariff)=>getPrice(meters,seconds,tariff),
  reset
};

setupSearch();
setupUI();
setupTariffs();
setupSavedPlaces();
setupPaymentUI();
window.addEventListener('load',init);
