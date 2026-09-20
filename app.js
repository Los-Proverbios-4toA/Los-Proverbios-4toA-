// Carga diferida de librerías pesadas: solo se descargan cuando realmente se usan,
// para que la primera visita a la página sea liviana y rápida.
function cargarScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('No se pudo cargar ' + src));
    document.head.appendChild(s);
  });
}

let _pdfjsListo = null;
function asegurarPdfJs() {
  if (!_pdfjsListo) {
    _pdfjsListo = cargarScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js')
      .then(() => { pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; });
  }
  return _pdfjsListo;
}

let _pdfLibListo = null;
function asegurarPdfLib() {
  if (!_pdfLibListo) {
    _pdfLibListo = cargarScript('https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js');
  }
  return _pdfLibListo;
}

/* ============================================================
   SUPABASE — única base de datos y almacenamiento de la app.
   Se habla con él por REST directo (sin librería extra) para
   mantener la página liviana.
   ============================================================ */
const SUPA_URL = "https://ctyruduakrjtuxwuaqna.supabase.co";
const SUPA_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0eXJ1ZHVha3JqdHV4d3VhcW5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MTExNzcsImV4cCI6MjEwNTQ4NzE3N30.BXM5IOKmAeMNmo5XoMBzoBoR28Bh3499-VRVumS9A1M";
const SB_HEADERS = { apikey: SUPA_ANON_KEY, Authorization: `Bearer ${SUPA_ANON_KEY}` };
const SB_BUCKET = 'clases-pdfs';

async function sbListarClases() {
  const res = await fetch(`${SUPA_URL}/rest/v1/clases?select=id,mi,name,ts,pdf_path&order=ts.desc`, { headers: SB_HEADERS });
  if (!res.ok) throw new Error('No se pudo cargar la lista de clases');
  return res.json();
}

async function sbInsertarClase(row) {
  const res = await fetch(`${SUPA_URL}/rest/v1/clases`, {
    method: 'POST',
    headers: { ...SB_HEADERS, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(row)
  });
  if (!res.ok) throw new Error('No se pudo guardar la clase en la base de datos');
  const rows = await res.json();
  return rows[0];
}

async function sbEliminarClaseFila(id) {
  const res = await fetch(`${SUPA_URL}/rest/v1/clases?id=eq.${id}`, { method: 'DELETE', headers: SB_HEADERS });
  if (!res.ok) throw new Error('No se pudo eliminar de la base de datos');
}

async function sbSubirArchivo(path, blob) {
  const res = await fetch(`${SUPA_URL}/storage/v1/object/${SB_BUCKET}/${path}`, {
    method: 'POST',
    headers: { ...SB_HEADERS, 'Content-Type': blob.type || 'application/pdf' },
    body: blob
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error('No se pudo subir el archivo: ' + t.slice(0, 200));
  }
}

function sbEliminarArchivo(path) {
  return fetch(`${SUPA_URL}/storage/v1/object/${SB_BUCKET}`, {
    method: 'DELETE',
    headers: { ...SB_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: [path] })
  }).catch(() => {});
}

function sbUrlPublica(path) {
  return `${SUPA_URL}/storage/v1/object/public/${SB_BUCKET}/${path}`;
}

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
function fechaHoyDDMMYYYY() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function toast(m) {
  const t = $('toast');
  t.textContent = m;
  t.classList.add('on');
  clearTimeout(tt);
  tt = setTimeout(() => t.classList.remove('on'), 2900);
}

// Convertir base64 (solo se usa durante la migración desde Firebase) a Uint8Array
function getUint8ArrayFromBase64(base64) {
  const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
  const binaryString = atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

// Obtiene (y cachea en memoria) los bytes del PDF de una clase, solo cuando hace falta
async function obtenerBytesDeClase(index) {
  const d = DOCS[index];
  if (!d) return null;
  if (d._bytes) return d._bytes;
  const res = await fetch(sbUrlPublica(d.pdf_path));
  if (!res.ok) throw new Error('No se encontró el archivo de esta clase');
  d._bytes = new Uint8Array(await res.arrayBuffer());
  return d._bytes;
}

// Visualizador universal de PDF usando Canvas
window.verPDF = async function(index) {
  const d = DOCS[index];
  if (!d) return;

  const container = $('pdf-viewer-container');
  container.innerHTML = '<div class="pdf-loading"><span>⏳ Descargando esta clase...</span></div>';
  $('pdf-modal-title').textContent = d.name;
  $('modal-pdf').classList.remove('hidden');

  try {
    const [_, byteArray] = await Promise.all([asegurarPdfJs(), obtenerBytesDeClase(index)]);
    container.innerHTML = '<div class="pdf-loading"><span>⏳ Cargando documento...</span></div>';

    if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
    const blob = new Blob([byteArray], { type: 'application/pdf' });
    currentBlobUrl = URL.createObjectURL(blob);
    $('pdf-open-ext').href = currentBlobUrl;

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
    container.innerHTML = '<div class="pdf-loading" style="color:#ff6b6b;">Error al cargar el PDF. Prueba descargándolo.</div>';
  }
};

// Descargar PDF
window.descargarPDF = async function(index) {
  const d = DOCS[index];
  if (!d) return;
  try {
    toast('⏳ Descargando...');
    const byteArray = await obtenerBytesDeClase(index);
    const blob = new Blob([byteArray], { type: 'application/pdf' });
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

// Cargar Clases con Respaldo Offline (solo metadatos: rápido sin importar cuántas clases haya)
async function cargar() {
  try {
    const rows = await sbListarClases();
    DOCS = rows;
    DOCS.sort((a, b) => (b.ts || 0) - (a.ts || 0));

    try {
      localStorage.setItem('4toa_docs_backup', JSON.stringify(DOCS.map(({ _bytes, ...rest }) => rest)));
    } catch (err) {
      console.log('Exceso de almacenamiento local', err);
    }
  } catch (e) {
    const backup = localStorage.getItem('4toa_docs_backup');
    if (backup) {
      DOCS = JSON.parse(backup);
      toast('⚡ Modo Offline: Mostrando clases guardadas (ábrelas con internet)');
    } else {
      toast('⚠️ Modo Offline: Conéctate una vez para sincronizar');
    }
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

// Renderizar lista
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

// Panel de Administración
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

function nombreArchivoAleatorio() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`;
}

// Función compartida: sube cualquier PDF (blob) como clase publicada.
// El archivo va como objeto real a Supabase Storage; en la tabla solo queda
// el nombre/materia/fecha y la ruta del archivo — así la lista siempre carga rápido.
async function publicarBlobComoClase(mi, nombre, blob, botonEl, textoOriginalBtn) {
  if (blob.size > 8 * 1024 * 1024) {
    toast('⚠️ Máx 8 MB por PDF.');
    return false;
  }
  botonEl.disabled = true;
  botonEl.querySelector('span').textContent = '⏳ Subiendo a la nube...';
  try {
    const path = nombreArchivoAleatorio();
    await sbSubirArchivo(path, blob);
    await sbInsertarClase({ mi, name: nombre, ts: Date.now(), pdf_path: path });
    await cargar();
    renderAdmin();
    toast('✅ Clase publicada para todo el salón');
    return true;
  } catch (e) {
    toast('⚠️ Error al subir: ' + (e.message || ''));
    return false;
  } finally {
    botonEl.disabled = false;
    botonEl.querySelector('span').textContent = textoOriginalBtn;
  }
}

// Publicar clase (modo: subir PDF manual)
$('pubBtn').onclick = async () => {
  const mi = +$('aMat').value, t = $('aTit').value.trim(), f = dropFile || $('aFile').files[0];
  if (!t) { toast('Escribe un título'); return; }
  if (!f) { toast('Selecciona un PDF'); return; }
  if (f.type !== 'application/pdf') { toast('El archivo debe ser un PDF'); return; }

  const ok = await publicarBlobComoClase(mi, t, f, $('pubBtn'), '☁️ Publicar clase');
  if (ok) {
    $('aTit').value = '';
    $('aFile').value = '';
    dropFile = null;
    $('fname').classList.add('hidden');
  }
};

/* ============================================================
   MODO "CREAR CON IA"
   ============================================================ */

// Cambiar entre "Subir PDF" y "Crear con IA"
$('tabUpload').onclick = () => setModoAdmin('upload');
$('tabAI').onclick = () => setModoAdmin('ai');
function setModoAdmin(modo) {
  $('tabUpload').classList.toggle('on', modo === 'upload');
  $('tabAI').classList.toggle('on', modo === 'ai');
  $('modeUpload').classList.toggle('hidden', modo !== 'upload');
  $('modeAI').classList.toggle('hidden', modo !== 'ai');
}

// Cambiar entre "Pegar texto" y "Foto de apunte"
let fuenteIA = 'text', imgFile = null;
$('srcText').onclick = () => setFuenteIA('text');
$('srcImg').onclick = () => setFuenteIA('image');
function setFuenteIA(src) {
  fuenteIA = src;
  $('srcText').classList.toggle('on', src === 'text');
  $('srcImg').classList.toggle('on', src === 'image');
  $('aiInputText').classList.toggle('hidden', src !== 'text');
  $('aiInputImg').classList.toggle('hidden', src !== 'image');
}

// Selección de imagen
const dzImg = $('dropImg');
dzImg.addEventListener('dragover', e => { e.preventDefault(); dzImg.classList.add('on'); });
dzImg.addEventListener('dragleave', () => dzImg.classList.remove('on'));
dzImg.addEventListener('drop', e => { e.preventDefault(); dzImg.classList.remove('on'); setImgFile(e.dataTransfer.files[0]); });
$('aImg').onchange = e => setImgFile(e.target.files[0]);

function setImgFile(f) {
  if (!f) return;
  if (!f.type.startsWith('image/')) { toast('Selecciona una imagen'); return; }
  imgFile = f;
  $('fnameImg').classList.remove('hidden');
  $('fnameImg').innerHTML = `<span>IMG</span> ${f.name} <span style="color:var(--text-muted); margin-left:auto">${(f.size/1024).toFixed(0)} KB</span>`;
}

function archivoABase64Puro(file) {
  return new Promise((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(r.result.split(',')[1]);
    r.onerror = no;
    r.readAsDataURL(file);
  });
}

// Llama a la Edge Function de Supabase, que a su vez llama a Gemini
async function llamarIA(payload) {
  const res = await fetch(`${SUPA_URL}/functions/v1/ai-format`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPA_ANON_KEY}`,
      apikey: SUPA_ANON_KEY
    },
    body: JSON.stringify(payload)
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || 'Error al contactar la IA');
  return json; // { title, materia, body }
}

$('aiRunBtn').onclick = async () => {
  const btn = $('aiRunBtn');
  let payload;

  if (fuenteIA === 'text') {
    const texto = $('aiText').value.trim();
    if (!texto) { toast('Pega el texto de la clase primero'); return; }
    payload = { mode: 'text', text: texto };
  } else {
    if (!imgFile) { toast('Selecciona una foto primero'); return; }
    const base64 = await archivoABase64Puro(imgFile);
    payload = { mode: 'image', imageBase64: base64, mimeType: imgFile.type };
  }

  btn.disabled = true;
  btn.querySelector('span').textContent = '🧠 Pensando...';
  try {
    const r = await llamarIA(payload);
    $('aiTit').value = r.title;
    $('aiMat').value = String(M.findIndex(m => m.n === r.materia));
    $('aiClase').value = $('aiClase').value || '4to A';
    $('aiFecha').value = $('aiFecha').value || fechaHoyDDMMYYYY();
    $('aiBody').value = r.body;
    $('aiPreview').classList.remove('hidden');
    $('aiPreview').scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast('✅ Contenido organizado, revísalo antes de publicar');
  } catch (e) {
    toast('⚠️ ' + (e.message || 'Error con la IA'));
  }
  btn.disabled = false;
  btn.querySelector('span').textContent = '✨ Organizar con IA';
};

$('aiMat').innerHTML = M.map((m, i) => `<option value="${i}">${m.n}</option>`).join('');

$('aiPublishBtn').onclick = async () => {
  const mi = +$('aiMat').value;
  const titulo = $('aiTit').value.trim();
  const clase = $('aiClase').value.trim() || '4to A';
  const fecha = $('aiFecha').value.trim();
  const cuerpo = $('aiBody').value;
  if (!titulo) { toast('Escribe un título'); return; }
  if (!cuerpo.trim()) { toast('El contenido está vacío'); return; }

  const btn = $('aiPublishBtn');
  btn.disabled = true;
  btn.querySelector('span').textContent = '📄 Generando PDF...';
  try {
    const pdfBytes = await generarPdfConPlantillas({ clase, materia: M[mi].n, fecha, titulo, cuerpo });
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const ok = await publicarBlobComoClase(mi, titulo, blob, btn, '📄 Generar PDF y Publicar');
    if (ok) {
      $('aiText').value = '';
      $('aImg').value = '';
      imgFile = null;
      $('fnameImg').classList.add('hidden');
      $('aiPreview').classList.add('hidden');
    }
  } catch (e) {
    toast('⚠️ Error al generar el PDF: ' + e.message);
    btn.disabled = false;
    btn.querySelector('span').textContent = '📄 Generar PDF y Publicar';
  }
};

// Genera el PDF final usando las 2 plantillas reales (portada + continuación)
let plantilla1Bytes = null, plantilla2Bytes = null;
async function cargarPlantillas() {
  if (!plantilla1Bytes) plantilla1Bytes = await fetch('./plantilla1.pdf').then(r => r.arrayBuffer());
  if (!plantilla2Bytes) plantilla2Bytes = await fetch('./plantilla2.pdf').then(r => r.arrayBuffer());
}

async function generarPdfConPlantillas({ clase, materia, fecha, titulo, cuerpo }) {
  await asegurarPdfLib();
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  await cargarPlantillas();

  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const fontBold = await out.embedFont(StandardFonts.HelveticaBold);

  const SIZE = 11;
  const LINE_H = 15.5;
  const MARGIN_X = 70.87;
  const PAGE_W = 595.276, PAGE_H = 841.89;
  const MAX_WIDTH = PAGE_W - MARGIN_X * 2;

  function envolverTexto(texto) {
    const lineasFinales = [];
    const parrafos = texto.split('\n');
    for (const parrafo of parrafos) {
      if (!parrafo.trim()) { lineasFinales.push(''); continue; }
      const palabras = parrafo.split(' ');
      let actual = '';
      for (const palabra of palabras) {
        const prueba = actual ? actual + ' ' + palabra : palabra;
        if (font.widthOfTextAtSize(prueba, SIZE) > MAX_WIDTH && actual) {
          lineasFinales.push(actual);
          actual = palabra;
        } else {
          actual = prueba;
        }
      }
      if (actual) lineasFinales.push(actual);
    }
    return lineasFinales;
  }

  const lineas = envolverTexto(cuerpo);

  const src1 = await PDFDocument.load(plantilla1Bytes);
  const [p1] = await out.copyPages(src1, [0]);
  out.addPage(p1);

  p1.drawText(clase, { x: 111.97, y: 770.42, size: SIZE, font, color: rgb(0, 0, 0) });
  p1.drawText(materia, { x: 119.06, y: 751.99, size: SIZE, font, color: rgb(0, 0, 0) });
  p1.drawText(fecha, { x: 111.97, y: 733.57, size: SIZE, font, color: rgb(0, 0, 0) });

  const tituloW = fontBold.widthOfTextAtSize(titulo, 13);
  p1.drawText(titulo, { x: 297.64 - tituloW / 2, y: 701.5, size: 13, font: fontBold, color: rgb(0, 0, 0) });

  let y = 673, li = 0;
  const bottomLimit1 = 55;
  while (li < lineas.length && y > bottomLimit1) {
    p1.drawText(lineas[li], { x: MARGIN_X, y, size: SIZE, font, color: rgb(0.1, 0.1, 0.1) });
    y -= LINE_H;
    li++;
  }

  const topStart = 745, bottomLimit = 60;
  while (li < lineas.length) {
    const src2 = await PDFDocument.load(plantilla2Bytes);
    const [p2] = await out.copyPages(src2, [0]);
    out.addPage(p2);
    let yy = topStart;
    while (li < lineas.length && yy > bottomLimit) {
      p2.drawText(lineas[li], { x: MARGIN_X, y: yy, size: SIZE, font, color: rgb(0.1, 0.1, 0.1) });
      yy -= LINE_H;
      li++;
    }
  }

  return out.save();
}

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
    const d = DOCS.find(x => String(x.id) === String(id));
    await sbEliminarClaseFila(id);
    if (d && d.pdf_path) await sbEliminarArchivo(d.pdf_path);
    await cargar();
    renderAdmin();
    toast('Clase eliminada');
  } catch (e) {
    toast('Error al eliminar');
  }
};

/* ============================================================
   MIGRACIÓN ÚNICA DESDE FIREBASE
   Copia cada clase (metadatos + PDF real) de Firestore hacia
   Supabase. Firebase solo se carga (bajo demanda) si presionas
   este botón — el resto de la app nunca lo toca.
   Es seguro ejecutarla varias veces: lo ya migrado se salta.
   ============================================================ */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDNOup0pRqx8ZKTcVrpYvCc8JUB967eLYw",
  authDomain: "los-proverbios-4toa.firebaseapp.com",
  projectId: "los-proverbios-4toa",
  storageBucket: "los-proverbios-4toa.firebasestorage.app",
  messagingSenderId: "629657930138",
  appId: "1:629657930138:web:ea4eb998ea8783c8c05223",
  measurementId: "G-8JE142E4FS"
};

let _firebaseListo = null;
async function obtenerFirestoreLegacy() {
  if (!_firebaseListo) {
    _firebaseListo = (async () => {
      const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
      const { getFirestore, collection, getDocs, getDoc, doc } =
        await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
      const fbApp = initializeApp(FIREBASE_CONFIG);
      return { db: getFirestore(fbApp), collection, getDocs, getDoc, doc };
    })();
  }
  return _firebaseListo;
}

const btnMigrar = $('btnMigrar');
if (btnMigrar) {
  btnMigrar.onclick = async () => {
    btnMigrar.disabled = true;
    btnMigrar.querySelector('span').textContent = '⏳ Migrando a Supabase...';
    try {
      const { db, collection, getDocs, getDoc, doc } = await obtenerFirestoreLegacy();

      // Clases ya migradas antes (para no duplicar si se corre de nuevo)
      const yaRes = await fetch(`${SUPA_URL}/rest/v1/clases?select=firebase_id&firebase_id=not.is.null`, { headers: SB_HEADERS });
      const yaMigrados = new Set((await yaRes.json()).map(r => r.firebase_id));

      const metaSnap = await getDocs(collection(db, 'clases'));
      let migradas = 0, saltadas = 0, sinArchivo = 0;

      for (const docSnap of metaSnap.docs) {
        if (yaMigrados.has(docSnap.id)) { saltadas++; continue; }
        const meta = docSnap.data();

        let base64 = meta.data; // clases viejas: el PDF venía embebido aquí mismo
        if (!base64) {
          const dataSnap = await getDoc(doc(db, 'clases_data', docSnap.id));
          if (dataSnap.exists()) base64 = dataSnap.data().data;
        }
        if (!base64) { sinArchivo++; continue; }

        const blob = new Blob([getUint8ArrayFromBase64(base64)], { type: 'application/pdf' });
        const path = `${meta.ts || Date.now()}-${docSnap.id}.pdf`;
        await sbSubirArchivo(path, blob);
        await sbInsertarClase({
          mi: meta.mi, name: meta.name, ts: meta.ts || Date.now(),
          pdf_path: path, firebase_id: docSnap.id
        });
        migradas++;
      }

      await cargar();
      renderAdmin();

      if (migradas > 0) {
        toast(`✅ ${migradas} clases migradas a Supabase` + (sinArchivo ? ` (${sinArchivo} sin PDF, revisar)` : ''));
      } else if (saltadas > 0) {
        toast('✅ Ya estaba todo migrado a Supabase');
        btnMigrar.closest('.form-group')?.classList.add('hidden');
      } else {
        toast('No se encontraron clases en Firebase para migrar');
      }
    } catch (e) {
      toast('⚠️ Error migrando: ' + (e.message || ''));
    }
    btnMigrar.disabled = false;
    btnMigrar.querySelector('span').textContent = '🚀 Migrar todo a Supabase';
  };
}

// EFECTO DE LLUVIA
const cv = $('fx'), cx = cv.getContext('2d');
let W, H, D = [];

function rs() {
  W = cv.width = innerWidth;
  H = cv.height = innerHeight;
}
addEventListener('resize', rs);
rs();

for (let i = 0; i < 45; i++) {
  D.push({
    x: Math.random() * W,
    y: Math.random() * H,
    len: 18 + Math.random() * 25,
    sp: 3.5 + Math.random() * 4.5,
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

// Inicialización de la App
cargar().then(() => {
  if (window.lucide) lucide.createIcons();
});
loopRain();

// Registrar Service Worker para PWA / Caché Offline
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker listo'))
      .catch(err => console.error('Error en Service Worker', err));
  });
}
