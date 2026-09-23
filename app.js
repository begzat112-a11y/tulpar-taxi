let map, userMarker, destMarker, routeLine;
let userPoint=[42.8746,74.5698], destPoint=null, currentMode="car", searchMarkers=[];
const modeText={car:"Авто",walk:"Пешком",bike:"Велосипед"};

function init(){
  map=L.map("map",{zoomControl:false}).setView([42.88,74.57],12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
  map.on("click",e=>{destPoint=[e.latlng.lat,e.latlng.lng];setDestinationMarker(destPoint);reverse(e.latlng.lat,e.latlng.lng,"to");});
  setUserMarker(userPoint);
  setTimeout(()=>map.invalidateSize(),300);
}
function setUserMarker(p){
  if(userMarker)userMarker.remove();
  userMarker=L.circleMarker(p,{radius:9,color:"#fff",weight:3,fillColor:"#3f8768",fillOpacity:1}).addTo(map).bindPopup("Ваше местоположение");
}
function setDestinationMarker(p){
  if(destMarker)destMarker.remove();
  destMarker=L.marker(p).addTo(map).bindPopup("Пункт назначения").openPopup();
}
function useMyLocation(){
  if(!navigator.geolocation){info("Ваш браузер не поддерживает геолокацию.");return}
  info("Определяем ваше местоположение…");
  navigator.geolocation.getCurrentPosition(pos=>{
    userPoint=[pos.coords.latitude,pos.coords.longitude];setUserMarker(userPoint);map.flyTo(userPoint,15);
    reverse(userPoint[0],userPoint[1],"from");info("Местоположение определено.");
  },()=>info("Разрешите доступ к геолокации в браузере."),{enableHighAccuracy:true,timeout:10000});
}
async function reverse(lat,lon,field){
  try{
    const r=await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=ru`);
    const d=await r.json();document.getElementById(field).value=d.display_name||`${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  }catch(e){document.getElementById(field).value=`${lat.toFixed(5)}, ${lon.toFixed(5)}`}
}
async function searchPlace(){
  const q=document.getElementById("search").value.trim();if(!q)return;
  const box=document.getElementById("suggestions");box.style.display="block";box.innerHTML='<div class="suggestion">Ищу на карте…</div>';
  try{
    const r=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&accept-language=ru&q=${encodeURIComponent(q)}`);
    const data=await r.json();
    box.innerHTML=data.length?data.map((x,i)=>`<div class="suggestion" onclick="selectSearch(${i})">${escape(x.display_name)}</div>`).join(""):'<div class="suggestion">Ничего не найдено.</div>';
    window.lastSearch=data;
  }catch(e){box.innerHTML='<div class="suggestion">Поиск временно недоступен.</div>'}
}
function selectSearch(i){
  const x=window.lastSearch[i],p=[+x.lat,+x.lon];
  document.getElementById("suggestions").style.display="none";document.getElementById("search").value=x.display_name;
  showPlace(x,p);map.flyTo(p,16);destPoint=p;setDestinationMarker(p);document.getElementById("to").value=x.display_name;
}
async function categorySearch(q){
  const center=map.getCenter();document.getElementById("search").value=q;
  try{
    const r=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=12&bounded=1&viewbox=${center.lng+.08},${center.lat+.08},${center.lng-.08},${center.lat-.08}&accept-language=ru&q=${encodeURIComponent(q)}`);
    const data=await r.json();clearSearchMarkers();
    if(!data.length){info("Поблизости ничего не найдено.");return}
    data.forEach(x=>{
      const p=[+x.lat,+x.lon],m=L.marker(p).addTo(map).bindPopup(`<b>${escape(x.display_name.split(",")[0])}</b><br><button onclick='selectSearchResult(${JSON.stringify(p)},${JSON.stringify(x.display_name)})'>Выбрать</button>`);
      searchMarkers.push(m);
    });
    map.fitBounds(L.featureGroup(searchMarkers).getBounds().pad(.15));info(`Найдено объектов: ${data.length}`);
  }catch(e){info("Поиск объектов временно недоступен.")}
}
function selectSearchResult(p,name){destPoint=p;setDestinationMarker(p);document.getElementById("to").value=name;closePlace()}
function clearSearchMarkers(){searchMarkers.forEach(m=>m.remove());searchMarkers=[]}
function clearSearch(){document.getElementById("search").value="";document.getElementById("suggestions").style.display="none"}
async function searchDestination(){
  const q=document.getElementById("to").value.trim();if(!q)return;
  document.getElementById("search").value=q;await searchPlace();
}
function setMode(m){
  currentMode=m;document.querySelectorAll(".mode").forEach(x=>x.classList.toggle("active",x.dataset.mode===m));
}
async function buildRoute(){
  if(!destPoint){await searchDestination();if(!destPoint){info("Укажите пункт назначения.");return}}
  if(currentMode!=="car"){
    info(`${modeText[currentMode]}: интерфейс готов. Для точного пешеходного/веломаршрута подключим отдельный routing-сервер на следующем этапе.`);
    return;
  }
  const url=`https://router.project-osrm.org/route/v1/driving/${userPoint[1]},${userPoint[0]};${destPoint[1]},${destPoint[0]}?overview=full&geometries=geojson`;
  try{
    const r=await fetch(url),d=await r.json();
    if(!d.routes?.[0])throw Error();
    const rt=d.routes[0];if(routeLine)routeLine.remove();
    routeLine=L.geoJSON(rt.geometry,{style:{color:"#d6ad58",weight:7,opacity:.9}}).addTo(map);
    map.fitBounds(routeLine.getBounds().pad(.15));
    const km=rt.distance/1000,min=Math.round(rt.duration/60);
    document.getElementById("routeInfo").innerHTML=`<strong>${km.toFixed(1)} км</strong> · примерно <strong>${min} мин</strong> · ${modeText[currentMode]}`;
  }catch(e){info("Не удалось построить маршрут. Попробуйте ещё раз.")}
}
function showPlace(x,p){
  document.getElementById("placeCard").classList.remove("hidden");
  document.getElementById("placeContent").innerHTML=`<h3>${escape(x.display_name.split(",")[0])}</h3><p>${escape(x.display_name)}</p><div class="place-actions"><button class="route" onclick="document.getElementById('to').value=${JSON.stringify(x.display_name)};destPoint=[${p[0]},${p[1]}];setDestinationMarker(destPoint);closePlace()">🧭 Маршрут</button><button class="taxi" onclick="openTaxi()">🚕 Такси</button></div>`;
}
function closePlace(){document.getElementById("placeCard").classList.add("hidden")}
function openTaxi(){
  document.getElementById("to").value=document.getElementById("to").value||document.getElementById("search").value;
  alert("Раздел ТулпарТакси: здесь подключим настоящий заказ, водителей и диспетчера после подключения сервера.");
}
function zoomIn(){map.zoomIn()}function zoomOut(){map.zoomOut()}
function resetMap(){map.setView([42.88,74.57],12);clearSearchMarkers();if(routeLine)routeLine.remove();destPoint=null}
function showInfo(){document.getElementById("modal").classList.remove("hidden")}
function closeModal(){document.getElementById("modal").classList.add("hidden")}
function info(t){document.getElementById("routeInfo").textContent=t}
function escape(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
document.addEventListener("DOMContentLoaded",init);
