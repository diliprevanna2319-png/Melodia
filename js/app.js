// app.js — Melodia UI, navigation, and audio player.

const audio = document.getElementById('audio');
const $ = id => document.getElementById(id);

// ---------- state ----------
let currentView = 'home';
let current = null;            // currently loaded track/station
let archiveQueue = [];         // tracks of the open album (for next/prev within album)
const FAV_KEY = 'melodia.favorites';
const VOL_KEY = 'melodia.volume';

const favorites = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
const localFiles = []; // {title, sub, url} — object URLs, session only

// Popular genres/languages (good free-radio coverage, India-friendly)
const GENRES = ['Pop','Rock','Bollywood','Hindi','Tamil','Telugu','Punjabi','Classical',
  'Jazz','Lofi','Chill','EDM','Dance','Hip Hop','Devotional','Bhajan','Romance','80s','90s',
  'Oldies','Country','Reggae','Metal','News','Kannada','Malayalam'];

// ---------- helpers ----------
function saveFavs(){ localStorage.setItem(FAV_KEY, JSON.stringify(favorites)); }
function isFav(item){ return favorites.some(f => f.id === item.id); }
function esc(s){ return (s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function artHTML(item, cls){
  if(item.art) return `<div class="${cls}"><img src="${esc(item.art)}" alt="" onerror="this.remove()"></div>`;
  const ico = item.type === 'radio' ? '📻' : item.type === 'album' ? '💿' : '🎵';
  return `<div class="${cls}">${ico}</div>`;
}

// ---------- rendering ----------
const content = $('content');

function showLoading(msg='Loading…'){ content.innerHTML = `<div class="loading"><div class="spinner"></div>${esc(msg)}</div>`; }
function showError(msg){
  content.innerHTML = `<div class="empty"><div class="big">😕</div><div>${esc(msg)}</div>
    <div class="hint" style="margin-top:10px">Check your internet connection and try again. Some free stations go offline occasionally — try another one.</div></div>`;
}

function cardGrid(items, onClick){
  if(!items.length){ content.innerHTML = `<div class="empty"><div class="big">🔍</div>No results — try another search or genre.</div>`; return; }
  const grid = document.createElement('div');
  grid.className = 'grid';
  items.forEach(item => {
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `${artHTML(item,'card-art')}
      <div class="card-title">${esc(item.title)}</div>
      <div class="card-sub">${esc(item.sub)}</div>
      <div class="card-badge">${item.type === 'radio' ? '📻 Live radio' : '💿 Free album'}</div>`;
    el.onclick = () => onClick(item);
    grid.appendChild(el);
  });
  content.innerHTML = '';
  content.appendChild(grid);
}

function trackList(tracks, headerHTML=''){
  const wrap = document.createElement('div');
  if(headerHTML) wrap.innerHTML = headerHTML;
  tracks.forEach(t => {
    const row = document.createElement('div');
    row.className = 'row' + (current && current.id === t.id ? ' playing' : '');
    row.innerHTML = `<div class="row-ico">${current && current.id===t.id ? '🔊' : '▶'}</div>
      <div class="row-main"><div class="row-title">${esc(t.title)}</div><div class="row-sub">${esc(t.sub)}</div></div>`;
    row.onclick = () => { archiveQueue = tracks; play(t); };
    wrap.appendChild(row);
  });
  content.innerHTML = '';
  content.appendChild(wrap);
}

// ---------- views ----------
const views = {
  async home(){
    content.innerHTML = `
      <div class="section-title">Browse by genre &amp; language</div>
      <div class="chips" id="genre-chips"></div>
      <div class="section-title">🔥 Popular stations right now</div>
      <div id="top-stations"><div class="loading"><div class="spinner"></div>Loading top stations…</div></div>`;
    const chips = $('genre-chips');
    GENRES.forEach(g => {
      const c = document.createElement('div');
      c.className = 'chip'; c.textContent = g;
      c.onclick = () => { setView('radio'); loadGenre(g); };
      chips.appendChild(c);
    });
    try {
      const top = await Sources.Radio.top(24);
      const host = $('top-stations'); if(!host) return;
      const grid = document.createElement('div'); grid.className = 'grid';
      top.forEach(item => {
        const el = document.createElement('div'); el.className='card';
        el.innerHTML = `${artHTML(item,'card-art')}<div class="card-title">${esc(item.title)}</div>
          <div class="card-sub">${esc(item.sub)}</div><div class="card-badge">📻 Live radio</div>`;
        el.onclick = () => play(item);
        grid.appendChild(el);
      });
      host.innerHTML=''; host.appendChild(grid);
    } catch(e){ const host=$('top-stations'); if(host) host.innerHTML = `<div class="hint">Couldn't reach the radio directory right now. Try the Radio tab or search.</div>`; }
  },

  radio(){
    content.innerHTML = `
      <div class="section-title">Pick a genre or search above</div>
      <div class="chips" id="genre-chips2"></div>
      <div id="radio-results" style="margin-top:8px"></div>`;
    const chips = $('genre-chips2');
    GENRES.forEach(g => {
      const c = document.createElement('div'); c.className='chip'; c.textContent=g;
      c.onclick = () => loadGenre(g); chips.appendChild(c);
    });
  },

  archive(){
    content.innerHTML = `
      <div class="empty"><div class="big">📚</div>
      <div class="hint" style="margin:0 auto">The <b>Free Library</b> searches the Internet Archive — millions of free &amp; public-domain tracks, full albums and live concerts.<br><br>
      Type an artist, album, song or genre in the search box above and press Enter.</div></div>`;
  },

  files(){
    content.innerHTML = `
      <div class="empty"><div class="big">💾</div>
      <div class="hint" style="margin:0 auto">Play music files you already own. They stay on your device — nothing is uploaded.</div>
      <button class="btn" id="pick-files">＋ Add music files</button></div>
      <div id="file-list" style="margin-top:20px"></div>
      <input id="file-input" type="file" accept="audio/*" multiple hidden>`;
    $('pick-files').onclick = () => $('file-input').click();
    $('file-input').onchange = e => {
      [...e.target.files].forEach(f => localFiles.push({
        type:'track', id:'local:'+f.name+f.size, title:f.name.replace(/\.[^.]+$/,''),
        sub:'My files · '+(f.type||'audio'), url:URL.createObjectURL(f), art:''
      }));
      renderFiles();
    };
    renderFiles();
  },

  favorites(){
    if(!favorites.length){
      content.innerHTML = `<div class="empty"><div class="big">❤️</div>No favorites yet.<div class="hint" style="margin:10px auto 0">Tap the heart on the player bar while something is playing to save it here.</div></div>`;
      return;
    }
    cardGrid(favorites, item => { archiveQueue=[]; play(item); });
  }
};

function renderFiles(){
  const host = $('file-list'); if(!host) return;
  if(!localFiles.length){ host.innerHTML=''; return; }
  host.innerHTML = '<div class="section-title">Your tracks</div>';
  const list = document.createElement('div');
  localFiles.forEach(t => {
    const row=document.createElement('div');
    row.className='row'+(current&&current.id===t.id?' playing':'');
    row.innerHTML=`<div class="row-ico">${current&&current.id===t.id?'🔊':'▶'}</div>
      <div class="row-main"><div class="row-title">${esc(t.title)}</div><div class="row-sub">${esc(t.sub)}</div></div>`;
    row.onclick=()=>{ archiveQueue=localFiles; play(t); };
    list.appendChild(row);
  });
  host.appendChild(list);
}

async function loadGenre(tag){
  const host = $('radio-results') || content;
  host.innerHTML = `<div class="loading"><div class="spinner"></div>Finding ${esc(tag)} stations…</div>`;
  try {
    const items = await Sources.Radio.byTag(tag.toLowerCase(), 48);
    if($('radio-results')){
      if(!items.length){ host.innerHTML=`<div class="hint">No live ${esc(tag)} stations found right now. Try another genre.</div>`; return; }
      const grid=document.createElement('div'); grid.className='grid';
      items.forEach(item=>{ const el=document.createElement('div'); el.className='card';
        el.innerHTML=`${artHTML(item,'card-art')}<div class="card-title">${esc(item.title)}</div>
          <div class="card-sub">${esc(item.sub)}</div><div class="card-badge">📻 Live radio</div>`;
        el.onclick=()=>play(item); grid.appendChild(el); });
      host.innerHTML=''; host.appendChild(grid);
    }
  } catch(e){ showError('Could not load stations.'); }
}

// ---------- search ----------
async function doSearch(){
  const q = $('search').value.trim();
  if(!q) return;
  if(currentView === 'archive' || currentView === 'files' || currentView === 'favorites'){
    // Search the free library when on those tabs
    setView('archive');
    showLoading(`Searching the free library for “${q}”…`);
    try {
      const albums = await Sources.Archive.search(q, 36);
      cardGrid(albums, openAlbum);
    } catch(e){ showError('Search failed.'); }
  } else {
    // Radio search
    setView('radio');
    const host = $('radio-results') || content;
    host.innerHTML = `<div class="loading"><div class="spinner"></div>Searching stations for “${esc(q)}”…</div>`;
    try {
      const items = await Sources.Radio.search(q, 48);
      const grid=document.createElement('div'); grid.className='grid';
      if(!items.length){ host.innerHTML='<div class="hint">No stations matched. Try the Free Library tab for songs &amp; albums.</div>'; return; }
      items.forEach(item=>{ const el=document.createElement('div'); el.className='card';
        el.innerHTML=`${artHTML(item,'card-art')}<div class="card-title">${esc(item.title)}</div>
          <div class="card-sub">${esc(item.sub)}</div><div class="card-badge">📻 Live radio</div>`;
        el.onclick=()=>play(item); grid.appendChild(el); });
      host.innerHTML=''; host.appendChild(grid);
    } catch(e){ showError('Search failed.'); }
  }
}

async function openAlbum(album){
  showLoading(`Opening “${album.title}”…`);
  try {
    const tracks = await Sources.Archive.tracks(album.id);
    if(!tracks.length){ showError('No playable tracks found in this item.'); return; }
    archiveQueue = tracks;
    trackList(tracks, `<div class="section-title">${esc(album.title)} — ${tracks.length} track(s)</div>`);
  } catch(e){ showError('Could not open this album.'); }
}

// ---------- player ----------
function play(item){
  current = item;
  archiveQueue = archiveQueue.length ? archiveQueue : [];
  $('player').hidden = false;
  $('np-title').textContent = item.title;
  $('np-sub').textContent = item.sub || (item.type==='radio'?'Live radio':'');
  $('np-art').innerHTML = item.art ? `<img src="${esc(item.art)}" onerror="this.remove()">` : (item.type==='radio'?'📻':'🎵');
  $('np-fav').textContent = isFav(item) ? '❤️' : '🤍';
  $('btn-play').classList.add('loading-state');
  $('status').textContent = 'Connecting…';
  audio.src = item.url;
  audio.play().catch(()=>{ $('status').textContent='Tap ▶ to start'; $('btn-play').classList.remove('loading-state'); $('btn-play').textContent='▶'; });
  // refresh row highlight if listing tracks/files
  if(currentView==='files') renderFiles();
}

function togglePlay(){
  if(!current) return;
  if(audio.paused) audio.play(); else audio.pause();
}

function playNext(dir=1){
  if(!archiveQueue.length || !current) return;
  const i = archiveQueue.findIndex(t => t.id === current.id);
  const next = archiveQueue[i + dir];
  if(next) play(next);
}

audio.addEventListener('playing', ()=>{ $('btn-play').classList.remove('loading-state'); $('btn-play').textContent='⏸'; $('status').textContent = current?.type==='radio'?'● Live':'Playing'; });
audio.addEventListener('pause', ()=>{ $('btn-play').textContent='▶'; if($('status').textContent!=='Connecting…') $('status').textContent='Paused'; });
audio.addEventListener('waiting', ()=>{ $('status').textContent='Buffering…'; });
audio.addEventListener('ended', ()=> playNext(1));
audio.addEventListener('error', ()=>{ $('btn-play').classList.remove('loading-state'); $('btn-play').textContent='▶'; $('status').textContent='⚠ Stream unavailable'; });

$('btn-play').onclick = togglePlay;
$('np-fav').onclick = () => {
  if(!current) return;
  const i = favorites.findIndex(f=>f.id===current.id);
  if(i>=0){ favorites.splice(i,1); $('np-fav').textContent='🤍'; }
  else { favorites.unshift({...current}); $('np-fav').textContent='❤️'; }
  saveFavs();
  if(currentView==='favorites') views.favorites();
};

// volume (persisted)
const savedVol = parseFloat(localStorage.getItem(VOL_KEY));
audio.volume = isNaN(savedVol) ? 1 : savedVol;
$('vol').value = audio.volume;
$('vol').oninput = e => { audio.volume = +e.target.value; localStorage.setItem(VOL_KEY, e.target.value); };

// media keys / lockscreen
if('mediaSession' in navigator){
  navigator.mediaSession.setActionHandler('play', ()=>audio.play());
  navigator.mediaSession.setActionHandler('pause', ()=>audio.pause());
  navigator.mediaSession.setActionHandler('nexttrack', ()=>playNext(1));
  navigator.mediaSession.setActionHandler('previoustrack', ()=>playNext(-1));
}

// ---------- navigation ----------
function setView(view){
  currentView = view;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view===view));
  $('view-title').textContent = ({home:'Home',radio:'Radio',archive:'Free Library',files:'My Files',favorites:'Favorites'})[view] || view;
  const searchEl = $('search');
  searchEl.placeholder = (view==='archive') ? 'Search songs, artists, albums…' : 'Search stations or genres…';
  if(views[view]) views[view]();
}
document.querySelectorAll('.nav-item').forEach(n => n.addEventListener('click', ()=>setView(n.dataset.view)));
$('search-btn').onclick = doSearch;
$('search').addEventListener('keydown', e => { if(e.key==='Enter') doSearch(); });

// 🎲 Surprise me — play a random popular station
let surprisePool = [];
async function surpriseMe(){
  const btn = $('surprise'); const label = btn.textContent;
  btn.disabled = true; btn.textContent = '🎲 Finding…';
  try {
    if(!surprisePool.length) surprisePool = await Sources.Radio.randomPool(300);
    if(surprisePool.length){
      const pick = surprisePool[Math.floor(Math.random() * surprisePool.length)];
      archiveQueue = [];
      play(pick);
    }
  } catch(e){
    $('player').hidden = false;
    $('status').textContent = '⚠ Couldn’t fetch a station — try again';
  } finally {
    btn.disabled = false; btn.textContent = label;
  }
}
$('surprise').onclick = surpriseMe;

// ---------- boot ----------
setView('home');
