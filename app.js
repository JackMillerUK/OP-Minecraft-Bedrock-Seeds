
(() => {
  const STORAGE_KEY = 'seed-scout:v1';

  /** @type {Array<{id:string,seed:string,description:string,version:string,createdAt:number,updatedAt:number}>} */
  let state = load();

  // Elements
  const q = document.getElementById('q');
  const versionFilter = document.getElementById('versionFilter');
  const sortSel = document.getElementById('sort');
  const exportBtn = document.getElementById('exportBtn');
  const importFile = document.getElementById('importFile');
  const form = document.getElementById('seedForm');
  const seedInput = document.getElementById('seedInput');
  const descInput = document.getElementById('descInput');
  const verInput = document.getElementById('verInput');
  const listEl = document.getElementById('list');
  const emptyEl = document.getElementById('empty');
  const countEl = document.getElementById('count');
  const exportPanel = document.getElementById('exportPanel');
  const exportText = document.getElementById('exportText');
  const copyJsonBtn = document.getElementById('copyJsonBtn');
  const shareJsonBtn = document.getElementById('shareJsonBtn');
  const closeExportPanel = document.getElementById('closeExportPanel');

  // Initial render
  refreshVersionFilter();
  render();

  // Event wiring
  q.addEventListener('input', render);
  versionFilter.addEventListener('change', render);
  sortSel.addEventListener('change', render);
  exportBtn.addEventListener('click', onExport);
  importFile.addEventListener('change', onImport);
  form.addEventListener('submit', onAdd);
  copyJsonBtn.addEventListener('click', () => {
    navigator.clipboard?.writeText(exportText.value).then(()=>toast('JSON copied')).catch(()=>toast('Copy failed'));
  });
  shareJsonBtn.addEventListener('click', async () => {
    const data = exportText.value;
    const file = new File([data], fileName(), { type: 'application/json' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Seed Scout export' }); } catch {}
    } else if (navigator.share) {
      try { await navigator.share({ title: 'Seed Scout export', text: data }); } catch {}
    } else {
      toast('Sharing not supported here');
    }
  });
  closeExportPanel.addEventListener('click', () => exportPanel.style.display = 'none');

  function onAdd(e){
    e.preventDefault();
    const seed = seedInput.value.trim();
    const description = descInput.value.trim();
    const version = verInput.value.trim();

    if(!seed || !version){ toast('Seed and version are required.'); return; }
    const exists = state.some(s => s.seed.toLowerCase() === seed.toLowerCase());
    if(exists){ toast('That seed already exists.'); return; }

    const now = Date.now();
    const item = { id: crypto.randomUUID ? crypto.randomUUID() : String(now)+Math.random().toString(36).slice(2), seed, description, version, createdAt: now, updatedAt: now };
    state.unshift(item);
    save();
    form.reset();
    refreshVersionFilter();
    render();
    seedInput.focus();
  }

  function onEdit(id){
    const item = state.find(s => s.id === id);
    if(!item) return;
    const seed = prompt('Edit seed:', item.seed);
    if(seed === null) return;
    if(seed.trim().toLowerCase() !== item.seed.toLowerCase()){
      const dupe = state.some(s => s.seed.toLowerCase() === seed.trim().toLowerCase());
      if(dupe){ toast('Another entry already uses that seed.'); return; }
    }
    const description = prompt('Edit description:', item.description ?? '') ?? '';
    const version = prompt('Edit version:', item.version ?? '') ?? '';
    if(!seed.trim() || !version.trim()){ toast('Seed and version are required.'); return; }
    item.seed = seed.trim(); item.description = description.trim(); item.version = version.trim(); item.updatedAt = Date.now();
    save(); refreshVersionFilter(); render();
  }

  function onDelete(id){
    const item = state.find(s => s.id === id);
    if(!item) return;
    if(confirm(`Delete seed "${item.seed}"? This cannot be undone.`)){
      state = state.filter(s => s.id !== id);
      save(); refreshVersionFilter(); render();
    }
  }

  async function onCopy(seed){
    try{ await navigator.clipboard.writeText(seed); toast('Seed copied!'); }
    catch{ toast('Copy failed—select and copy manually.'); }
  }

  async function onShare(item){
    if(navigator.share){
      try{ await navigator.share({title:'Minecraft Seed', text:`Seed: ${item.seed}
Version: ${item.version}
${item.description||''}`.trim()}); }
      catch{}
    }else{ onCopy(item.seed); }
  }

  function dataJson(){
    return JSON.stringify({ exportedAt: new Date().toISOString(), items: state }, null, 2);
  }

  function fileName(){
    return `seed-scout-${new Date().toISOString().slice(0,10)}.json`;
  }

  function showFallbackPanel(data){
    exportText.value = data;
    exportPanel.style.display = 'block';
    exportText.focus();
    exportText.select();
  }

  function onExport(){
    const data = dataJson();

    // 1) Try File System Access API (very rare on iOS; mostly unsupported)
    if (window.showSaveFilePicker) {
      (async () => {
        try{
          const handle = await showSaveFilePicker({ suggestedName: fileName(), types:[{description:'JSON', accept:{'application/json':['.json']}}] });
          const writable = await handle.createWritable();
          await writable.write(new Blob([data], {type:'application/json'}));
          await writable.close();
          toast('Saved');
        }catch(err){ showFallbackPanel(data); }
      })();
      return;
    }

    // 2) Try Web Share (files)
    try{
      const file = new File([data], fileName(), { type: 'application/json' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: 'Seed Scout export' }).catch(()=>{});
        return;
      }
    }catch{}

    // 3) Try download via object URL (fails on many WKWebViews)
    try{
      const blob = new Blob([data], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName();
      a.rel = 'noopener';
      a.target = '_blank'; // helps in some iOS cases
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 2000);
      // If it silently fails, user will use fallback panel
      setTimeout(()=> showFallbackPanel(data), 600);
      return;
    }catch{}

    // 4) Data URL fallback
    try{
      const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(data);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = fileName();
      a.target = '_blank';
      a.click();
      setTimeout(()=> showFallbackPanel(data), 400);
      return;
    }catch{}

    // 5) Final fallback: show panel
    showFallbackPanel(data);
  }

  function onImport(e){
    const file = e.target.files?.[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const json = JSON.parse(reader.result);
        const items = Array.isArray(json?.items) ? json.items : Array.isArray(json) ? json : [];
        if(!Array.isArray(items)) throw new Error('Invalid format');
        let added = 0, updated = 0;
        items.forEach(obj => {
          if(!obj || !obj.seed || !obj.version) return;
          const existing = state.find(s => s.seed.toLowerCase() === String(obj.seed).toLowerCase());
          if(existing){
            existing.description = obj.description ?? existing.description ?? '';
            existing.version = obj.version ?? existing.version ?? '';
            existing.updatedAt = Date.now();
            updated++;
          }else{
            state.push({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now())+Math.random().toString(36).slice(2), seed: String(obj.seed), description: String(obj.description ?? ''), version: String(obj.version ?? ''), createdAt: Date.now(), updatedAt: Date.now() });
            added++;
          }
        });
        save(); refreshVersionFilter(); render(); toast(`Import done: ${added} added, ${updated} updated.`);
      }catch(err){ toast('Import failed: invalid JSON.'); }
      finally{ e.target.value = ''; }
    };
    reader.readAsText(file);
  }

  function render(){
    const qv = q.value.trim().toLowerCase();
    const vf = versionFilter.value;
    const sort = sortSel.value;
    let items = state.slice();

    if(qv){ items = items.filter(s => s.seed.toLowerCase().includes(qv) || (s.description||'').toLowerCase().includes(qv)); }
    if(vf){ items = items.filter(s => s.version === vf); }

    switch(sort){
      case 'oldest': items.sort((a,b)=>a.createdAt - b.createdAt); break;
      case 'seed-asc': items.sort((a,b)=>a.seed.localeCompare(b.seed, undefined, {numeric:true, sensitivity:'base'})); break;
      case 'seed-desc': items.sort((a,b)=>b.seed.localeCompare(a.seed, undefined, {numeric:true, sensitivity:'base'})); break;
      default: items.sort((a,b)=>b.createdAt - a.createdAt);
    }

    countEl.textContent = `${items.length} item${items.length===1?'':'s'}`;
    emptyEl.hidden = items.length !== 0;

    listEl.innerHTML = '';
    const frag = document.createDocumentFragment();
    items.forEach(item => {
      const card = document.createElement('article');
      card.className = 'seed';
      card.setAttribute('role','listitem');
      card.innerHTML = `
        <div class="row">
          <div class="chip" title="Minecraft version">${escapeHtml(item.version)}</div>
          <div class="meta">Added ${timeAgo(item.createdAt)}${item.updatedAt>item.createdAt ? ` • edited ${timeAgo(item.updatedAt)}`:''}</div>
          <div class="actions" style="margin-left:auto">
            <button class="btn secondary" data-act="copy" title="Copy seed">Copy</button>
            <button class="btn secondary" data-act="share" title="Share">Share</button>
            <button class="btn secondary" data-act="edit" title="Edit">Edit</button>
            <button class="btn danger" data-act="delete" title="Delete">Delete</button>
          </div>
        </div>
        <div class="row gap12">
          <div class="kbd" title="Seed">${escapeHtml(item.seed)}</div>
        </div>
        <div class="desc">${item.description ? escapeHtml(item.description) : '<span class="meta">No description</span>'}</div>
      `;
      card.querySelector('[data-act="copy"]').addEventListener('click', ()=>onCopy(item.seed));
      card.querySelector('[data-act="share"]').addEventListener('click', ()=>onShare(item));
      card.querySelector('[data-act="edit"]').addEventListener('click', ()=>onEdit(item.id));
      card.querySelector('[data-act="delete"]').addEventListener('click', ()=>onDelete(item.id));
      frag.appendChild(card);
    });
    listEl.appendChild(frag);
  }

  function refreshVersionFilter(){
    const set = new Set(state.map(s => s.version).filter(Boolean));
    const current = versionFilter.value;
    versionFilter.innerHTML = '<option value="">All versions</option>' + Array.from(set).sort((a,b)=>a.localeCompare(b, undefined, {numeric:true})).map(v => `<option>${escapeHtml(v)}</option>`).join('');
    if(current && set.has(current)) versionFilter.value = current;
  }

  function timeAgo(ts){
    const sec = Math.floor((Date.now()-ts)/1000);
    if(sec<60) return `${sec}s ago`;
    const m = Math.floor(sec/60);
    if(m<60) return `${m}m ago`;
    const h = Math.floor(m/60);
    if(h<24) return `${h}h ago`;
    const d = Math.floor(h/24);
    if(d<30) return `${d}d ago`;
    const dt = new Date(ts);
    return dt.toLocaleDateString();
  }

  function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function load(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return [];
      const arr = JSON.parse(raw);
      if(!Array.isArray(arr)) return [];
      return arr.map(s => ({
        id: s.id || (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)),
        seed: String(s.seed ?? ''),
        description: String(s.description ?? ''),
        version: String(s.version ?? ''),
        createdAt: Number(s.createdAt ?? Date.now()),
        updatedAt: Number(s.updatedAt ?? s.createdAt ?? Date.now()),
      }));
    }catch{ return []; }
  }

  function toast(msg){
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = `position:fixed; left:50%; transform:translateX(-50%); bottom:20px; background:rgba(20,24,32,.95); color:white; padding:10px 14px; border-radius:10px; border:1px solid var(--border); box-shadow:0 10px 30px rgba(0,0,0,.35); z-index:9999; font-weight:600;`;
    document.body.appendChild(el);
    setTimeout(()=> el.remove(), 2200);
  }

  function escapeHtml(s){
    return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  }
})();
