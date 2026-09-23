(() => {
const KEY=window.TULPAR_2GIS_KEY, $=id=>document.getElementById(id);
let map,from=null,to=null,fromMarker=null,toMarker=null;
function status(s){$('status').textContent=s}
function marker(c){return new mapgl.Marker(map,{coordinates:c})}
function clear(){if(fromMarker)fromMarker.destroy();if(toMarker)toMarker.destroy();fromMarker=toMarker=null;from=to=null;$('fromInput').value='';$('toInput').value='';$('routeInfo').textContent='';status('Нажмите карту: первая точка — «Откуда», вторая — «Куда».')}
function pick(c){
 if(!from){from=c;fromMarker=marker(c);$('fromInput').value=c[1].toFixed(6)+', '+c[0].toFixed(6);status('«Откуда» выбрано. Теперь выберите «Куда».');return}
 if(!to){to=c;toMarker=marker(c);$('toInput').value=c[1].toFixed(6)+', '+c[0].toFixed(6);status('Обе точки выбраны. Нажмите «Построить маршрут».');return}
 if(toMarker)toMarker.destroy();to=c;toMarker=marker(c);$('toInput').value=c[1].toFixed(6)+', '+c[0].toFixed(6);status('Точка «Куда» обновлена. Нажмите «Построить маршрут».')
}
function init(){
 if(!window.mapgl){status('2GIS не загрузился. Проверьте интернет.');return}
 map=new mapgl.Map('map',{key:KEY,center:[37.6173,55.7558],zoom:12});
 map.on('click',e=>{let c=e.lngLat||e.coordinates;if(c)pick([c[0],c[1]])});
 $('clearBtn').onclick=clear;
 $('locateBtn').onclick=()=>{
  if(!navigator.geolocation){status('Геолокация недоступна');return}
  status('Определяем местоположение…');
  navigator.geolocation.getCurrentPosition(p=>{
   const c=[p.coords.longitude,p.coords.latitude];map.setCenter(c);map.setZoom(15);
   if(fromMarker)fromMarker.destroy();from=c;fromMarker=marker(c);
   $('fromInput').value=c[1].toFixed(6)+', '+c[0].toFixed(6);status('Ваше положение установлено как «Откуда».')
  },()=>status('Разрешите геолокацию в браузере.'));
 };
 $('routeBtn').onclick=()=>{if(!from||!to){status('Сначала выберите две точки.');return}status('Точки выбраны. Маршрутизация 2GIS подключается следующим этапом.')}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();