import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Configuración de PDF.js para renderizado móvil
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Configuración original de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDNOup0pRqx8ZKTcVrpYvCc8JUB967eLYw",
  authDomain: "los-proverbios-4toa.firebaseapp.com",
  projectId: "los-proverbios-4toa",
  storageBucket: "los-proverbios-4toa.firebasestorage.app",
  messagingSenderId: "629657930138",
  appId: "1:629657930138:web:ea4eb998ea8783c8c05223",
  measurementId: "G-8JE142E4FS"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const M = [
  { n: 'Matemáticas', c: '#f4b400' },
  { n: 'Inglés', c: '#f4a020' },
  { n: 'Francés', c: '#9aa0a6' },
  { n: 'Ciencias Naturales', c: '#e8554e' },
  { n: 'Ciencias Sociales', c: '#34a853' },
  { n: 'Educación Artística', c: '#e87fae' },
  { n: 'Educación Física', c: '#4285f4' },
  { n: 'Formación Humana', c: '#26c6da' },
  { n: 'Lengua Española', c: '#a142f4' },
  { n: 'Moral y Cívica', c: '#34a853' },
  { n: 'Biología', c: '#7cb342' },
  { n: 'Opt. Lengua Española', c: '#e8554e' },
  { n: 'Opt. de Sociales', c: '#26c6da' }
];

const FOLDER = c => `<svg viewBox="0 0 48 40" xmlns="http://www.w3.org/2000/svg"><path d="M4 8c0-2.2 1.8-4 4-4h10l4 4h18c2.2 0 4 1.8 4 4v4H4V8z" fill="${c}" opacity=".55"/><path d="M4 12h40v20c0 2.2-1.8 4-4 4H8c-2.2 0-4-1.8-4-4V12z" fill="${c}"/><circle cx="24" cy="23" r="2.6" fill="rgba(255,255,255,.9)"/><path d="M19.3 30c.6-2.7 2.5-4.1 4.7-4.1s4.1 1.4 4.7 4.1" stroke="rgba(255,255,255,.9)" stroke-width="1.7" fill="none" stroke-linecap="round"/></svg>`;

let DOCS = [], loaded = false, tt, dropFile = null, currentBlobUrl = null;
const $ = id => document.getElementById(id);
const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const fdate = ts => new Date(ts).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' });

function toast(m) {
  const t = $('toast');
  t.textContent = m;
  t.classList.add('on');
  clearTimeout(tt);
  tt = setTimeout(() => t.classList.remove('on'), 2900);
}

// Convertir base64 almacenado a Uint8Array
function getUint8ArrayFromBase64(base64) {
  const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
  const binaryString = atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Visualizador universal de PDF usando Canvas (compatible con teléfonos Android / Chrome)
window.verPDF = async function(index) {
  const d = DOCS[index];
  if (!d) return;

  const container = $('pdf-viewer-container');
  container.innerHTML = '<div class="pdf-loading"><span>⏳ Cargando documento...</span></div>';
  $('pdf-modal-title').textContent = d.name;

  if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
  const blob = new Blob([getUint8ArrayFromBase64(d.data)], { type: 'application/pdf' });
  currentBlobUrl = URL.createObjectURL(blob);
  $('pdf-open-ext').href = currentBlobUrl;

  $('modal-pdf').classList.remove('hidden');

  try {
    const byteArray = getUint8ArrayFromBase64(d.data);
    const pdfDoc = await pdfjsLib.getDocument({ data: byteArray }).promise;
    container.innerHTML = '';

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-page-canvas';
      const ctx = canvas.getContext('2d');

      const viewport = page.getViewport({ scale: 1.5 });
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
      container.appendChild(canvas);
    }
  } catch (e) {
    container.innerHTML = '<div class="pdf-loading" style="color:#ff6b6b;">Error al renderizar el PDF. Prueba descargándolo.</div>';
  }
};

// Descargar PDF
window.descargarPDF = function(index) {
  const d = DOCS[index];
  if (!d) return;
  try {
    const blob = new Blob([getUint8ArrayFromBase64(d.data)], { type: 'application/pdf' });
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = d.name + '.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 1500);
    toast('⬇ Descargando clase...');
  } catch (e) {
    toast('No se pudo descargar');
  }
};

// Cargar Clases desde Firestore
async function cargar() {
  try {
    const s = await getDocs(collection(db, 'clases'));
    DOCS = s.docs.map(x => ({ id: x.id, ...x.data() }));
    DOCS.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  } catch (e) {
    toast('⚠️ Error al conectar con la nube');
  }
  loaded = true;
  renderGrid();
}

// Renderizar tarjetas de materias
function renderGrid() {
  $('grid').innerHTML = loaded ? M.map((m, i) => {
    const list = DOCS.filter(x => x.mi == i);
    const md = list.length ? 'Modificado ' + fdate(Math.max(...list.map(x => x.ts || 0))) : 'Sin clases aún';
    return `
      <div class="folder" data-i="${i}">
        <div class="ficon">${FOLDER(m.c)}</div>
        <div class="ftxt">
          <div class="fn">${m.n}</div>
          <div class="fm">${md}</div>
        </div>
      </div>
    `;
  }).join('') : '';
}

$('grid').onclick = e => {
  const c = e.target.closest('.folder');
  if (c) openSub(+c.dataset.i);
};

// Abrir vista de materia
function openSub(i) {
  const m = M[i];
  $('home').classList.add('hidden');
  $('res').classList.add('hidden');
  $('admin').classList.add('hidden');
  $('subj').classList.remove('hidden');
  $('sname').textContent = m.n;

  const list = DOCS.map((d, j) => [d, j]).filter(x => x[0].mi == i);
  renderListaDocumentos(list, 'docs', `Aún no hay clases de ${m.n}.`);
}

// Renderizar lista con títulos recortados correctamente
function renderListaDocumentos(items, containerId, mensajeVacio) {
  const container = $(containerId);
  if (!items.length) {
    container.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:30px 0;">${mensajeVacio}</div>`;
    return;
  }

  container.innerHTML = items.map(x => {
    const d = x[0];
    const index = x[1];
    return `
      <div class="doc-card">
        <div class="doc-info">
          <span class="doc-title" title="${d.name}">${d.name}</span>
          <span class="doc-meta">
            <i data-lucide="calendar" style="width:12px; height:12px;"></i>
            Modificado ${fdate(d.ts)}
          </span>
        </div>
        <div class="doc-actions">
          <button class="btn-download-pdf" onclick="descargarPDF(${index})" title="Descargar PDF">
            <i data-lucide="download" style="width:14px; height:14px;"></i>
            <span>PDF</span>
          </button>
          <button class="btn-view-pdf" onclick="verPDF(${index})">
            <span>Ver</span>
            <i data-lucide="external-link" style="width:14px; height:14px;"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

// Navegación
$('back').onclick = () => { $('subj').classList.add('hidden'); $('home').classList.remove('hidden'); };
$('back2').onclick = () => { $('res').classList.add('hidden'); $('home').classList.remove('hidden'); };

// Buscador
$('q').oninput = e => {
  const q = norm(e.target.value.trim());
  if (!q) {
    $('res').classList.add('hidden');
    $('home').classList.remove('hidden');
    return;
  }

  let out = [];
  DOCS.forEach((d, j) => {
    if (norm(d.name).includes(q) || norm(M[d.mi].n).includes(q)) out.push([d, j]);
  });

  $('home').classList.add('hidden');
  $('subj').classList.add('hidden');
  $('res').classList.remove('hidden');
  $('rtitle').textContent = `Resultados (${out.length})`;

  renderListaDocumentos(out, 'rlist', 'No se encontró nada.');
};

// Modal visor PDF - Cerrar
$('cerrar-modal').onclick = () => {
  $('modal-pdf').classList.add('hidden');
  $('pdf-viewer-container').innerHTML = '';
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }
};

// Panel de Administración (5 clics en footer)
$('aMat').innerHTML = M.map((m, i) => `<option value="${i}">${m.n}</option>`).join('');
let taps = 0;
$('foot').onclick = () => {
  taps++;
  if (taps >= 5) {
    taps = 0;
    $('pass').value = '';
    $('lock').classList.add('on');
    if (window.lucide) lucide.createIcons();
  }
};

$('cancelLock').onclick = () => { $('lock').classList.remove('on'); };
$('eye').onclick = () => { const p = $('pass'); p.type = p.type === 'password' ? 'text' : 'password'; };
$('unlock').onclick = tryUnlock;
$('pass').onkeydown = e => { if (e.key === 'Enter') tryUnlock(); };

function tryUnlock() {
  if ($('pass').value === 'juan4a') {
    $('lock').classList.remove('on');
    $('admin').classList.remove('hidden');
    renderAdmin();
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  } else {
    toast('Contraseña incorrecta');
  }
}

$('cerrarAdmin').onclick = () => { $('admin').classList.add('hidden'); };

// Drag and drop archivo
const dz = $('drop');
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('on'); });
dz.addEventListener('dragleave', () => dz.classList.remove('on'));
dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('on'); setFile(e.dataTransfer.files[0]); });
$('aFile').onchange = e => setFile(e.target.files[0]);

function setFile(f) {
  if (!f) return;
  if (f.type !== 'application/pdf') { toast('El archivo debe ser un PDF'); return; }
  dropFile = f;
  $('fname').classList.remove('hidden');
  $('fname').innerHTML = `<span>PDF</span> ${f.name} <span style="color:var(--text-muted); margin-left:auto">${(f.size/1024).toFixed(0)} KB</span>`;
}

// Publicar clase
$('pubBtn').onclick = async () => {
  const mi = +$('aMat').value, t = $('aTit').value.trim(), f = dropFile || $('aFile').files[0], b = $('pubBtn');
  if (!t) { toast('Escribe un título'); return; }
  if (!f) { toast('Selecciona un PDF'); return; }
  if (f.type !== 'application/pdf') { toast('El archivo debe ser un PDF'); return; }
  if (f.size > 900 * 1024) { toast('⚠️ Máx 900 KB. Comprime en ilovepdf.com'); return; }

  b.disabled = true;
  b.textContent = '⏳ Subiendo a la nube...';
  try {
    const data = await new Promise((ok, no) => {
      const r = new FileReader();
      r.onload = () => ok(r.result);
      r.onerror = no;
      r.readAsDataURL(f);
    });

    await addDoc(collection(db, 'clases'), { mi, name: t, ts: Date.now(), data });
    await cargar();
    renderAdmin();
    $('aTit').value = '';
    $('aFile').value = '';
    dropFile = null;
    $('fname').classList.add('hidden');
    toast('✅ Clase publicada para todo el salón');
  } catch (e) {
    toast('⚠️ Error al subir');
  }
  b.disabled = false;
  b.textContent = '☁️ Publicar clase';
};

function renderAdmin() {
  $('aList').innerHTML = DOCS.length ? DOCS.map((d, i) => `
    <div class="doc-card">
      <div class="doc-info">
        <span class="doc-title">${d.name}</span>
        <span class="doc-meta" style="color:${M[d.mi].c}">● ${M[d.mi].n} · ${fdate(d.ts)}</span>
      </div>
      <button class="btn-download-pdf" onclick="eliminarClase('${d.id}')" style="color:#ff6b6b; border-color:rgba(255,107,107,0.3);">
        <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
      </button>
    </div>
  `).join('') : '<div style="color:var(--text-muted); padding:10px;">Aún no has publicado clases.</div>';

  if (window.lucide) lucide.createIcons();
}

window.eliminarClase = async function(id) {
  try {
    await deleteDoc(doc(db, 'clases', id));
    await cargar();
    renderAdmin();
    toast('Clase eliminada');
  } catch (e) {
    toast('Error al eliminar');
  }
};

// EFECTO DE LLUVIA ULTRA LIGERA Y LENTA (SIN LAG EN MÓVILES)
const cv = $('fx'), cx = cv.getContext('2d');
let W, H, D = [];

function rs() {
  W = cv.width = innerWidth;
  H = cv.height = innerHeight;
}
addEventListener('resize', rs);
rs();

// 45 gotas ligeras, movimiento fluido y lento
for (let i = 0; i < 45; i++) {
  D.push({
    x: Math.random() * W,
    y: Math.random() * H,
    len: 18 + Math.random() * 25,
    sp: 3.5 + Math.random() * 4.5, // Caída suave y lenta
    w: 1 + Math.random() * 1.2,
    o: 0.2 + Math.random() * 0.4
  });
}

function loopRain() {
  cx.clearRect(0, 0, W, H);
  for (const d of D) {
    cx.strokeStyle = `rgba(200, 225, 255, ${d.o})`;
    cx.lineWidth = d.w;
    cx.beginPath();
    cx.moveTo(d.x, d.y);
    cx.lineTo(d.x, d.y + d.len);
    cx.stroke();

    d.y += d.sp;
    if (d.y > H + d.len) {
      d.y = -d.len;
      d.x = Math.random() * W;
    }
  }
  requestAnimationFrame(loopRain);
}

// Inicialización
cargar().then(() => {
  if (window.lucide) lucide.createIcons();
});
loopRain();

