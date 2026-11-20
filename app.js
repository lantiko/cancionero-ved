/* ============================================
   Cancionero VeD — Lógica web
   ============================================ */

const THEMES = [
  { id: 'claro', label: 'Claro' },
  { id: 'crema', label: 'Crema' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'atardecer', label: 'Atardecer' },
  { id: 'oscuro', label: 'Oscuro' },
];

let currentTheme = 'claro';
let misaMode = false;
let songs = [];
let activeSongId = null;
let editing = false;       // carga rápida
let sylEditing = false;    // editor de sílabas

// Estado del editor de sílabas
let sylData = [];          // array de líneas, cada línea: array de {text, chord, melisma}
let sylSelected = null;    // {line, idx}

// ---------- Temas ----------
function applyTheme(id) {
  currentTheme = id;
  document.body.setAttribute('data-theme', id);
  document.querySelectorAll('.theme-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === id);
  });
  localStorage.setItem('ved_theme', id);
}

function buildThemeBar() {
  const bar = document.getElementById('theme-bar');
  bar.innerHTML = '';
  THEMES.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'theme-btn';
    btn.dataset.theme = t.id;
    btn.textContent = t.label;
    btn.onclick = () => { misaMode = false; applyTheme(t.id); updateMisaBtn(); };
    bar.appendChild(btn);
  });
}

function toggleMisa() {
  misaMode = !misaMode;
  if (misaMode) {
    document.body.setAttribute('data-theme', 'misa');
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
  } else {
    applyTheme(currentTheme);
  }
  updateMisaBtn();
}
function updateMisaBtn() {
  const btn = document.getElementById('btn-misa');
  btn.textContent = misaMode ? 'Salir de misa' : 'Modo misa';
  btn.classList.toggle('btn-danger', misaMode);
}

// ---------- Persistencia ----------
function loadSongs() {
  try { songs = JSON.parse(localStorage.getItem('ved_songs') || '[]'); }
  catch (e) { songs = []; }
}
function saveSongs() { localStorage.setItem('ved_songs', JSON.stringify(songs)); }

// ---------- Lista ----------
function renderSongList() {
  const ul = document.getElementById('song-list');
  ul.innerHTML = '';
  if (songs.length === 0) {
    ul.innerHTML = '<li class="empty-state"><h3>Sin canciones</h3><p>Cargá la primera con el botón de abajo.</p></li>';
    return;
  }
  songs.forEach(s => {
    const li = document.createElement('li');
    li.className = 'song-item' + (s.id === activeSongId ? ' active' : '');
    li.innerHTML = `<div class="title">${escapeHtml(s.titulo)}</div>
      <div class="meta">Tono: ${escapeHtml(s.tono)} · ${s.lineas ? s.lineas.length : 0} líneas</div>`;
    li.onclick = () => { activeSongId = s.id; editing = false; sylEditing = false; renderAll(); };
    ul.appendChild(li);
  });
}

// ---------- Parser inline ----------
function parseLine(line) {
  const segs = [];
  const re = /\[([^\]]+)\]|(\S+)/g;
  let m, pending = null;
  while ((m = re.exec(line)) !== null) {
    if (m[1] !== undefined) pending = m[1].trim();
    else if (m[2] !== undefined) { segs.push({ chord: pending, text: m[2] }); pending = null; }
  }
  if (pending) segs.push({ chord: pending, text: '' });
  return segs;
}

// ---------- Render vista de canción ----------
function renderSongView(song) {
  const view = document.getElementById('song-view');
  if (!song) {
    view.innerHTML = '<div class="empty-state"><h3>Seleccioná una canción</h3><p>O cargá una nueva.</p></div>';
    return;
  }
  let html = `<h2>${escapeHtml(song.titulo)}</h2>
    <div class="song-meta">Tono: ${escapeHtml(song.tono)}</div>`;

  if (song.syllables && song.syllables.length) {
    song.syllables.forEach(line => {
      html += '<div class="song-line"><div class="chord-line">';
      line.forEach(syl => {
        const cls = syl.melisma ? 'txt melisma' : 'txt';
        html += `<span class="seg">
          <span class="chord">${syl.chord ? escapeHtml(syl.chord) : '&nbsp;'}</span>
          <span class="${cls}">${escapeHtml(syl.text)}</span>
        </span>`;
      });
      html += '</div></div>';
    });
  } else if (song.lineas) {
    song.lineas.forEach(line => {
      const segs = parseLine(line);
      html += '<div class="song-line"><div class="chord-line">';
      segs.forEach(seg => {
        html += `<span class="seg">
          <span class="chord">${seg.chord ? escapeHtml(seg.chord) : '&nbsp;'}</span>
          <span class="txt">${escapeHtml(seg.text)}</span>
        </span>`;
      });
      html += '</div></div>';
    });
  }
  view.innerHTML = html;
}

// ---------- Carga rápida ----------
function showEditor() {
  editing = true; sylEditing = false;
  renderAll();
}
function hideEditor() { editing = false; renderAll(); }

function saveNewSong() {
  const titulo = document.getElementById('inp-titulo').value.trim();
  const tono = document.getElementById('inp-tono').value.trim() || 'Do';
  const letra = document.getElementById('inp-letra').value;
  if (!titulo) { showToast('Falta el título'); return; }
  if (!letra.trim()) { showToast('Falta la letra'); return; }
  const lineas = letra.split('\n').map(l => l.trimEnd()).filter(l => l.trim() !== '');
  const song = { id: 's_' + Date.now(), titulo, tono, lineas, fecha: new Date().toISOString() };
  songs.unshift(song);
  saveSongs();
  activeSongId = song.id;
  editing = false;
  document.getElementById('inp-titulo').value = '';
  document.getElementById('inp-tono').value = '';
  document.getElementById('inp-letra').value = '';
  renderAll();
  showToast('Canción guardada');
}

// ---------- Editor de sílabas ----------
function showSylEditor() {
  sylEditing = true; editing = false;
  sylData = [];
  document.getElementById('syl-titulo').value = '';
  document.getElementById('syl-tono').value = '';
  document.getElementById('syl-input').value = '';
  document.getElementById('syl-workspace').innerHTML = '';
  sylSelected = null;
  renderAll();
}

function parseSyllables(text) {
  // Parte por espacios y guiones, preservando melismas
  const lines = text.split('\n').map(l => l.trim()).filter(l => l !== '');
  return lines.map(line => {
    const syls = [];
    // Primero intentar por guiones (melisma): "Glo - o - ria"
    if (line.includes(' - ')) {
      line.split(/\s+/).forEach(tok => {
        if (tok === '-') return;
        syls.push({ text: tok, chord: null, melisma: false });
      });
      // Marcar melismas: si hay guiones, las "o" sueltas son melisma
      // Heurística: token de una sola letra que no es la primera → melisma
      for (let i = 1; i < syls.length; i++) {
        if (syls[i].text.length <= 2 && /^[aoeiouáéíóú]+$/i.test(syls[i].text)) {
          syls[i].melisma = true;
        }
      }
    } else {
      // Partir por espacios (palabras como sílabas simples)
      line.split(/\s+/).forEach(w => {
        if (w) syls.push({ text: w, chord: null, melisma: false });
      });
    }
    return syls;
  });
}

function renderSylWorkspace() {
  const ws = document.getElementById('syl-workspace');
  ws.innerHTML = '';
  if (sylData.length === 0) return;

  sylData.forEach((line, li) => {
    const container = document.createElement('div');
    container.className = 'line-container';
    container.style.cssText = 'margin-bottom:16px;padding:12px;background:var(--tarjeta);border-radius:8px;border:1px solid var(--borde);';

    const label = document.createElement('div');
    label.style.cssText = 'font-size:12px;color:var(--muted);margin-bottom:6px;';
    label.textContent = `Línea ${li + 1}`;
    container.appendChild(label);

    const chordRow = document.createElement('div');
    chordRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:2px;margin-bottom:4px;min-height:24px;';
    const sylRow = document.createElement('div');
    sylRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:2px;';

    line.forEach((syl, si) => {
      // chord slot
      const cslot = document.createElement('span');
      cslot.className = 'chord-slot' + (syl.chord ? ' has-chord' : ' empty');
      cslot.style.cssText = `display:inline-block;min-width:40px;text-align:center;padding:2px 4px;border:1px dashed var(--borde);border-radius:4px;margin-right:2px;cursor:pointer;font-size:13px;font-weight:bold;color:var(--acorde);`;
      if (syl.chord) { cslot.style.borderColor = 'var(--acorde)'; cslot.style.background = 'var(--tarjeta)'; }
      cslot.textContent = syl.chord || '·';
      cslot.onclick = () => selectSyl(li, si);
      chordRow.appendChild(cslot);

      // syllable
      const sspan = document.createElement('span');
      sspan.style.cssText = `display:inline-block;padding:4px 6px;margin-right:2px;border-radius:4px;cursor:pointer;border:2px solid transparent;font-size:18px;`;
      if (syl.melisma) { sspan.style.fontStyle = 'italic'; sspan.style.color = 'var(--muted)'; }
      if (syl.chord) { sspan.style.background = 'var(--tarjeta)'; }
      sspan.textContent = syl.text;
      sspan.onclick = () => selectSyl(li, si);
      if (sylSelected && sylSelected.line === li && sylSelected.idx === si) {
        sspan.style.borderColor = 'var(--subrayado)';
        sspan.style.background = 'var(--fondo)';
      }
      sylRow.appendChild(sspan);
    });

    container.appendChild(chordRow);
    container.appendChild(sylRow);
    ws.appendChild(container);
  });

  // info
  const info = document.createElement('div');
  info.id = 'syl-info';
  info.style.cssText = 'margin-top:12px;padding:10px;background:var(--tarjeta);border-radius:6px;font-size:13px;color:var(--subrayado);';
  info.textContent = sylSelected
    ? `Sílaba seleccionada: "${sylData[sylSelected.line][sylSelected.idx].text}" (línea ${sylSelected.line+1})${sylData[sylSelected.line][sylSelected.idx].chord ? ' · acorde: ' + sylData[sylSelected.line][sylSelected.idx].chord : ' · sin acorde'}`
    : 'Seleccioná una sílaba para asignarle un acorde.';
  ws.appendChild(info);
}

function selectSyl(li, si) {
  sylSelected = { line: li, idx: si };
  renderSylWorkspace();
}

function assignChord() {
  if (!sylSelected) { showToast('Seleccioná una sílaba primero'); return; }
  const chord = document.getElementById('syl-chord-input').value.trim();
  if (!chord) { showToast('Ingresá un acorde'); return; }
  sylData[sylSelected.line][sylSelected.idx].chord = chord;
  renderSylWorkspace();
  showToast('Acorde asignado');
}

function removeChordSyl() {
  if (!sylSelected) { showToast('Seleccioná una sílaba primero'); return; }
  sylData[sylSelected.line][sylSelected.idx].chord = null;
  renderSylWorkspace();
}

function saveSylSong() {
  const titulo = document.getElementById('syl-titulo').value.trim();
  const tono = document.getElementById('syl-tono').value.trim() || 'Do';
  if (!titulo) { showToast('Falta el título'); return; }
  if (sylData.length === 0) { showToast('No hay sílabas'); return; }

  // Construir líneas inline a partir de sílabas
  const lineas = sylData.map(line =>
    line.map(syl => syl.chord ? `[${syl.chord}]${syl.text}` : syl.text).join(' ')
  );

  const song = {
    id: 's_' + Date.now(),
    titulo, tono, lineas,
    syllables: sylData.map(line => line.map(s => ({ text: s.text, chord: s.chord, melisma: s.melisma }))),
    fecha: new Date().toISOString(),
  };
  songs.unshift(song);
  saveSongs();
  activeSongId = song.id;
  sylEditing = false;
  renderAll();
  showToast('Canción guardada');
}

// ---------- Render general ----------
function renderAll() {
  renderSongList();
  const song = songs.find(s => s.id === activeSongId);

  const view = document.getElementById('song-view');
  const form = document.getElementById('editor-form');
  const syl = document.getElementById('syl-editor');

  if (sylEditing) {
    view.style.display = 'none';
    form.style.display = 'none';
    syl.style.display = 'block';
    renderSylWorkspace();
  } else if (editing) {
    view.style.display = 'none';
    form.style.display = 'block';
    syl.style.display = 'none';
  } else {
    view.style.display = 'block';
    form.style.display = 'none';
    syl.style.display = 'none';
    renderSongView(song);
  }

  const delBtn = document.getElementById('btn-delete');
  delBtn.style.display = (!editing && !sylEditing && activeSongId) ? 'inline-block' : 'none';
}

// ---------- Utilidades ----------
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2000);
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
  buildThemeBar();
  loadSongs();
  const savedTheme = localStorage.getItem('ved_theme') || 'claro';
  applyTheme(savedTheme);
  if (songs.length) activeSongId = songs[0].id;
  renderAll();

  document.getElementById('btn-new').onclick = showEditor;
  document.getElementById('btn-cancel').onclick = () => { editing = false; renderAll(); };
  document.getElementById('btn-save').onclick = saveNewSong;
  document.getElementById('btn-delete').onclick = deleteActive;
  document.getElementById('btn-open-syl').onclick = showSylEditor;
  document.getElementById('btn-misa').onclick = toggleMisa;

  // Syl editor events
  document.getElementById('btn-parse-lines').onclick = () => {
    const text = document.getElementById('syl-input').value;
    sylData = parseSyllables(text);
    sylSelected = null;
    renderSylWorkspace();
  };
  document.getElementById('btn-assign-chord').onclick = assignChord;
  document.getElementById('btn-remove-chord').onclick = removeChordSyl;
  document.getElementById('btn-syl-save').onclick = saveSylSong;
  document.getElementById('btn-syl-cancel').onclick = () => { sylEditing = false; renderAll(); };
});

function deleteActive() {
  if (!activeSongId) return;
  if (!confirm('¿Eliminar esta canción?')) return;
  songs = songs.filter(s => s.id !== activeSongId);
  saveSongs();
  activeSongId = songs.length ? songs[0].id : null;
  renderAll();
  showToast('Eliminada');
}