const API_KEY = 'd771d962-3726-43ba-bf11-e82ed12d3085';
const DEFAULT_CENTER = [74.6036, 42.8746]; // Bishkek
const DEFAULT_ZOOM = 12.5;

let map = null;
let directions = null;
let fromPoint = null;
let toPoint = null;
let fromMarker = null;
let toMarker = null;
let myMarker = null;
let carMarkers = [];
let activeMode = 'car';
let pickMode = null;
let searchTimer = null;

const $ = (id) => document.getElementById(id);
const searchInput = $('searchInput');
const suggestions = $('suggestions');
const toast = $('toast');

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => toast.classList.add('hidden'), 2600);
}

function setLoading(show) {
  $('loader').style.opacity = show ? '1' : '0';
  $('loader').style.pointerEvents = show ? 'auto' : 'none';
}

function savePlace(slot, point, label) {
  localStorage.setItem('tulpar_' + slot, JSON.stringify({point, label}));
}

function getPlace(slot) {
  try { return JSON.parse(localStorage.getItem('tulpar_' + slot)); } catch { return null; }
}

function formatDistance(m) {
  if (m == null) return '—';
  return m < 1000 ? `${Math.round(m)} м` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} км`;
}

function formatTime(s) {
  if (s == null) return '—';
  const min = Math.max(1, Math.round(s / 60));
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

function estimatePrice(distanceM) {
  if (!distanceM) return '—';
  const price = Math.max(120, Math.round((90 + distanceM / 1000 * 28) / 10) * 10);
  return `≈ ${price} с`;
}

function makeMarker(point, kind) {
  const html = kind === 'from'
    ? '<div class="tm-marker tm-from"></div>'
    : '<div class="tm-marker tm-to">✦</div>';
  return new mapgl.HtmlMarker(map, {coordinates: point, html});
}

function clearPointMarker(marker) {
  if (marker) marker.destroy();
}

function setFrom(point, label) {
  fromPoint = point;
  $('fromText').textContent = label || 'Моё местоположение';
  clearPointMarker(fromMarker);
  fromMarker = makeMarker(point, 'from');
}

function setTo(point, label) {
  toPoint = point;
  $('toText').textContent = label || 'Выбранная точка';
  clearPointMarker(toMarker);
  toMarker = makeMarker(point, 'to');
  $('closeRouteBtn').classList.remove('hidden');
  $('orderBtn').disabled = false;
  calculateRoute();
}

async function reverseGeocode(point) {
  const url = new URL('https://catalog.api.2gis.com/3.0/items/geocode');
  url.searchParams.set('lon', point[0]);
  url.searchParams.set('lat', point[1]);
  url.searchParams.set('fields', 'items.adm_div,items.address');
  url.searchParams.set('locale', 'ru_KG');
  url.searchParams.set('key', API_KEY);
  try {
    const res = await fetch(url);
    const data = await res.json();
    const item = data?.result?.items?.[0];
    return item?.address_name || item?.full_name || 'Выбранная точка';
  } catch {
    return 'Выбранная точка';
  }
}

async function searchObjects(query) {
  const url = new URL('https://catalog.api.2gis.com/3.0/items');
  url.searchParams.set('q', query);
  url.searchParams.set('fields', 'items.point,items.address,items.full_address_name,items.rubrics');
  url.searchParams.set('page_size', '6');
  url.searchParams.set('locale', 'ru_KG');
  url.searchParams.set('key', API_KEY);
  if (map) {
    const c = map.getCenter();
    url.searchParams.set('location', `${c[0]},${c[1]}`);
  }
  const res = await fetch(url);
  const data = await res.json();
  return data?.result?.items || [];
}

async function getSuggestions(query) {
  const url = new URL('https://catalog.api.2gis.com/3.0/suggests');
  url.searchParams.set('q', query);
  url.searchParams.set('page_size', '6');
  url.searchParams.set('locale', 'ru_KG');
  url.searchParams.set('key', API_KEY);
  if (map) {
    const c = map.getCenter();
    url.searchParams.set('location', `${c[0]},${c[1]}`);
  }
  const res = await fetch(url);
  const data = await res.json();
  return data?.result?.items || [];
}

function renderSuggestions(items) {
  suggestions.innerHTML = '';
  if (!items.length) {
    suggestions.classList.add('hidden');
    return;
  }
  items.slice(0, 6).forEach((item) => {
    const btn = document.createElement('button');
    btn.className = 'suggestion';
    const name = item.name || item.title || item.full_name || 'Объект';
    const subtitle = item.address_name || item.full_name || item.type || '';
    btn.innerHTML = `<span class="s-icon">${item.type === 'building' ? '⌂' : '•'}</span><span class="s-main"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(subtitle)}</small></span>`;
    btn.addEventListener('click', async () => {
      suggestions.classList.add('hidden');
      searchInput.value = name;
      await selectSearchResult(name);
    });
    suggestions.appendChild(btn);
  });
  suggestions.classList.remove('hidden');
}

async function selectSearchResult(query) {
  try {
    const items = await searchObjects(query);
    const item = items.find(x => x.point?.lon != null && x.point?.lat != null);
    if (!item) throw new Error('not found');
    const point = [Number(item.point.lon), Number(item.point.lat)];
    const label = item.full_address_name || item.address_name || item.full_name || item.name || query;
    map.setCenter(point);
    map.setZoom(16);
    if (pickMode === 'from') {
      setFrom(point, label);
      pickMode = null;
    } else {
      setTo(point, label);
    }
    $('searchInput').value = '';
  } catch (e) {
    showToast('Место не найдено');
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

async function calculateRoute() {
  if (!fromPoint || !toPoint || !directions) return;
  $('routeInfo').classList.add('hidden');
  try {
    directions.clear();
    const handler = (ev) => {
      const route = ev?.routes?.[0];
      if (!route) return;
      $('routeTime').textContent = route.ui_total_duration || formatTime(route.total_duration);
      $('routeDistance').textContent = route.ui_total_distance?.value ? `${route.ui_total_distance.value} ${route.ui_total_distance.unit || ''}` : formatDistance(route.total_distance);
      $('routePrice').textContent = estimatePrice(route.total_distance);
      $('routeInfo').classList.remove('hidden');
    };
    directions.once('directionsLoaded', handler);
    if (activeMode === 'walk') {
      await directions.pedestrianRoute({points: [fromPoint, toPoint]});
    } else {
      await directions.carRoute({
        points: [fromPoint, toPoint],
        style: {routeLineWidth: 6, substrateLineWidth: 12, haloLineWidth: 18}
      });
    }
  } catch (e) {
    console.error(e);
    showToast('Не удалось построить маршрут');
  }
}

function startPick(mode) {
  pickMode = mode;
  $('pickHint').classList.remove('hidden');
  $('routeSheet').style.opacity = '.72';
}

function stopPick() {
  pickMode = null;
  $('pickHint').classList.add('hidden');
  $('routeSheet').style.opacity = '1';
}

function createTulparCars() {
  const points = [
    [74.590,42.867],[74.615,42.878],[74.628,42.853],[74.575,42.889],
    [74.650,42.874],[74.606,42.902],[74.557,42.863],[74.640,42.906]
  ];
  carMarkers.forEach(m => m.destroy());
  carMarkers = points.map((p, i) => new mapgl.HtmlMarker(map, {
    coordinates:p,
    html:`<div class="car-marker" title="Tulpar ${i+1}">🚕</div>`
  }));
}

function setMyLocation(point) {
  clearPointMarker(myMarker);
  myMarker = new mapgl.HtmlMarker(map, {
    coordinates: point,
    html:'<div class="me-marker"><span></span></div>'
  });
  map.setCenter(point);
  map.setZoom(15);
}

function useGeolocation() {
  if (!navigator.geolocation) {
    showToast('Геолокация недоступна');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      const p = [pos.coords.longitude, pos.coords.latitude];
      setMyLocation(p);
      if (!fromPoint) setFrom(p, 'Моё местоположение');
    },
    () => showToast('Разрешите доступ к геолокации в браузере'),
    {enableHighAccuracy:true, timeout:10000, maximumAge:60000}
  );
}

function initMap() {
  if (!window.mapgl) {
    showToast('Не загрузилась библиотека 2ГИС');
    return;
  }
  try {
    map = new mapgl.Map('map', {
      key: API_KEY,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      copyright: 'bottomLeft'
    });

    map.on('click', async (e) => {
      if (!pickMode) return;
      const p = e.lngLat;
      const label = await reverseGeocode(p);
      if (pickMode === 'from') setFrom(p, label);
      else setTo(p, label);
      stopPick();
    });

    map.on('idle', () => setLoading(false));

    directions = new mapgl.Directions(map, {directionsApiKey: API_KEY});
    createTulparCars();

    // Restore saved places if available.
    const home = getPlace('home');
    if (home) $('quickPlaces').querySelector('[data-slot="home"]').title = home.label;
    const work = getPlace('work');
    if (work) $('quickPlaces').querySelector('[data-slot="work"]').title = work.label;

    $('fromText').textContent = 'Моё местоположение';
    setTimeout(useGeolocation, 900);
  } catch (e) {
    console.error(e);
    setLoading(false);
    showToast('Ошибка запуска карты. Проверьте ключ 2ГИС.');
  }
}

searchInput.addEventListener('input', () => {
  $('clearSearch').classList.toggle('hidden', !searchInput.value);
  clearTimeout(searchTimer);
  const q = searchInput.value.trim();
  if (q.length < 2) {
    suggestions.classList.add('hidden');
    return;
  }
  searchTimer = setTimeout(async () => {
    try {
      renderSuggestions(await getSuggestions(q));
    } catch (e) {
      console.error(e);
      suggestions.classList.add('hidden');
    }
  }, 260);
});

searchInput.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const q = searchInput.value.trim();
    if (q) {
      suggestions.classList.add('hidden');
      await selectSearchResult(q);
    }
  }
});

$('clearSearch').addEventListener('click', () => {
  searchInput.value = '';
  suggestions.classList.add('hidden');
  $('clearSearch').classList.add('hidden');
  searchInput.focus();
});

$('locateBtn').addEventListener('click', useGeolocation);
$('zoomInBtn').addEventListener('click', () => map?.setZoom(map.getZoom() + 1));
$('zoomOutBtn').addEventListener('click', () => map?.setZoom(map.getZoom() - 1));

$('toRow').addEventListener('click', () => startPick('to'));
$('fromRow').addEventListener('click', () => startPick('from'));
$('pickOnMapBtn').addEventListener('click', () => startPick('to'));
$('cancelPickBtn').addEventListener('click', stopPick);

$('closeRouteBtn').addEventListener('click', () => {
  directions?.clear();
  clearPointMarker(toMarker);
  toMarker = null;
  toPoint = null;
  $('toText').textContent = 'Выберите место на карте';
  $('routeInfo').classList.add('hidden');
  $('orderBtn').disabled = true;
  $('closeRouteBtn').classList.add('hidden');
});

document.querySelectorAll('.quick-chip[data-slot]').forEach(btn => {
  btn.addEventListener('click', () => {
    const slot = btn.dataset.slot;
    const saved = getPlace(slot);
    if (!saved) {
      startPick('to');
      showToast(`Выберите точку — сохраним как ${slot === 'home' ? 'Дом' : 'Работа'}`);
      const oldHandler = async () => {};
      return;
    }
    setTo(saved.point, saved.label);
    map.setCenter(saved.point);
    map.setZoom(15);
  });
});

document.querySelectorAll('.mode').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeMode = btn.dataset.mode;
    if (fromPoint && toPoint) calculateRoute();
  });
});

$('orderBtn').addEventListener('click', () => {
  if (!toPoint) return;
  showToast('Заказ Tulpar: следующий этап подключим к водителям');
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-wrap')) suggestions.classList.add('hidden');
});

// Long press is intentionally not used: map click remains simple on phones.
window.addEventListener('load', initMap);
