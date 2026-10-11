/* ==========================================================
   Viento de líneas: remolinos que giran en distintas direcciones.
   Se dibuja en el canvas #fx, detrás del contenido.
   Ajusta su calidad sola si el teléfono va lento.
   ========================================================== */
(() => {
  const cv = document.getElementById('fx');
  if (!cv) return;

  const ctx = cv.getContext('2d');

  // Si el sistema pide reducir movimiento, las líneas se mueven más lento (pero se ven).
  const VELOCIDAD = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.35 : 1;

  // Rojo del escudo, coral y un blanco azulado para el brillo
  const COLORES = [
    [255, 51, 82],
    [255, 106, 77],
    [235, 245, 255],
  ];

  let W = 0, H = 0, DPR = 1;
  let particulas = [];
  let remolinos = [];
  let t = 0;            // tiempo en segundos
  let ultimo = 0;
  let raf = 0;
  const tmp = [0, 0];

  // Calidad automática
  let halo = true;      // resplandor suave detrás de cada línea
  let nivel = 0;        // 0 = completa, 1 = menos líneas sin halo, 2 = menos resolución
  let muestras = [];
  let ultimoCuadroReal = 0;

  const aleatorio = (a, b) => a + Math.random() * (b - a);

  // Tamaño del canvas (no borra las líneas que ya existen)
  function ajustarCanvas() {
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
  }

  function tamano() {
    DPR = Math.min(window.devicePixelRatio || 1, nivel >= 2 ? 1 : 1.5);
    W = window.innerWidth;
    H = window.innerHeight;
    ajustarCanvas();
    crearRemolinos();
    const base = W < 720 ? 260 : 420;
    const n = nivel >= 1 ? Math.round(base * 0.6) : base;
    particulas = Array.from({ length: n }, () => {
      const p = {};
      reiniciar(p);
      p.y = aleatorio(0, H);
      p.px = p.x; p.py = p.y;
      p.vida = aleatorio(0, p.max);   // para que no todas nazcan a la vez
      return p;
    });
  }

  function crearRemolinos() {
    remolinos = Array.from({ length: 4 }, () => ({
      s: Math.random() < 0.5 ? -1 : 1,              // sentido del giro
      k: aleatorio(1.0, 1.8),                        // fuerza del giro
      r: Math.min(W, H) * aleatorio(0.14, 0.26),     // radio del anillo
      fx: aleatorio(0.10, 0.20), fy: aleatorio(0.08, 0.17),
      px: aleatorio(0, Math.PI * 2), py: aleatorio(0, Math.PI * 2),
      x: 0, y: 0,
    }));
  }

  // Cada remolino se mueve lentamente por la pantalla
  function moverRemolinos() {
    for (const r of remolinos) {
      r.x = W * (0.5 + 0.38 * Math.sin(t * r.fx + r.px));
      r.y = H * (0.5 + 0.36 * Math.cos(t * r.fy + r.py));
    }
  }

  // Campo de viento: giro de cada remolino + empuje hacia su anillo + ondas suaves
  function campo(x, y) {
    let fx = 0, fy = 0;
    for (const r of remolinos) {
      const dx = x - r.x, dy = y - r.y;
      const d2 = dx * dx + dy * dy;
      const R2 = r.r * r.r;
      const f = Math.exp(-d2 / (2 * R2));            // se desvanece con la distancia
      const d = Math.sqrt(d2) + 0.001;
      const ux = dx / d, uy = dy / d;
      const giroX = -uy * r.s * r.k, giroY = ux * r.s * r.k;
      const empuje = (r.r - d) / r.r;                // dentro del anillo empuja hacia afuera, fuera hacia dentro
      fx += (giroX + ux * empuje * 0.7) * f;
      fy += (giroY + uy * empuje * 0.7) * f;
    }
    const onda = Math.sin(x * 0.0019 + t * 0.6) + Math.cos(y * 0.0023 - t * 0.5);
    fx += Math.cos(onda * 1.9) * 0.22;
    fy += Math.sin(onda * 1.9) * 0.22;
    tmp[0] = fx; tmp[1] = fy;
    return tmp;
  }

  function reiniciar(p) {
    // a veces nace alrededor de un remolino, así se forman anillos
    if (remolinos.length && Math.random() < 0.5) {
      const r = remolinos[(Math.random() * remolinos.length) | 0];
      const a = Math.random() * Math.PI * 2;
      const rad = r.r * aleatorio(0.85, 1.15);
      p.x = r.x + Math.cos(a) * rad;
      p.y = r.y + Math.sin(a) * rad;
    } else {
      p.x = aleatorio(0, W);
      p.y = aleatorio(-30, 0);
    }
    p.px = p.x; p.py = p.y;
    p.vx = 0; p.vy = 0;
    p.vida = 0;
    p.max = aleatorio(220, 520);                     // duración en cuadros
    p.c = COLORES[(Math.random() * COLORES.length) | 0];
    p.g = aleatorio(0.9, 2.2);                       // grosor
    p.v = aleatorio(1.2, 2.6);                       // velocidad
    return p;
  }

  // Si el teléfono va lento, se reduce la carga en pasos
  function vigilarRendimiento(ahora) {
    if (!ultimoCuadroReal) { ultimoCuadroReal = ahora; return; }
    const dt = ahora - ultimoCuadroReal;
    ultimoCuadroReal = ahora;
    if (dt > 200) { muestras = []; return; }        // pestaña oculta o pausa: no cuenta
    muestras.push(dt);
    if (muestras.length < 120) return;

    const promedio = muestras.reduce((a, b) => a + b, 0) / muestras.length;
    muestras = [];
    if (promedio <= 26 || nivel >= 2) return;

    nivel++;
    if (nivel === 1) {
      halo = false;
      particulas = particulas.slice(0, Math.round(particulas.length * 0.6));
    } else {
      DPR = 1;
      ajustarCanvas();
    }
  }

  function cuadro(ahora) {
    vigilarRendimiento(ahora);

    const dt = ahora - ultimo;
    ultimo = ahora;
    const paso = Math.min(Math.max(dt / 16.67, 0.5), 2.5) * VELOCIDAD;
    t += paso / 60;

    moverRemolinos();

    for (const p of particulas) {
      const c = campo(p.x, p.y);
      const mag = Math.hypot(c[0], c[1]) || 1;
      const tvx = (c[0] / mag) * p.v, tvy = (c[1] / mag) * p.v;
      const suave = Math.min(1, 0.07 * paso);
      p.vx += (tvx - p.vx) * suave;
      p.vy += (tvy - p.vy) * suave;
      p.px = p.x; p.py = p.y;
      p.x += p.vx * paso;
      p.y += p.vy * paso;
      p.vida += paso;
      if (p.vida > p.max || p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) reiniciar(p);
    }

    // Las líneas se desvanecen poco a poco y dejan estelas largas
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.015)';
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const p of particulas) {
      const vida = Math.min(1, p.vida / p.max);
      const a = Math.sin(Math.PI * vida) * 0.85;     // aparece, se ve y se apaga
      if (a < 0.03) continue;
      const [r, g, b] = p.c;
      if (halo) {
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${(a * 0.22).toFixed(3)})`;
        ctx.lineWidth = p.g * 4;
        ctx.beginPath();
        ctx.moveTo(p.px, p.py);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
      ctx.lineWidth = p.g;
      ctx.beginPath();
      ctx.moveTo(p.px, p.py);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    raf = requestAnimationFrame(cuadro);
  }

  // Pausar cuando la pestaña no se ve, para no gastar batería
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(raf);
    if (!document.hidden) {
      ultimo = performance.now();
      ultimoCuadroReal = 0;
      raf = requestAnimationFrame(cuadro);
    }
  });

  let redimension;
  window.addEventListener('resize', () => {
    clearTimeout(redimension);
    redimension = setTimeout(() => { ajustarCanvas(); crearRemolinos(); }, 150);
  });

  tamano();
  ultimo = performance.now();
  raf = requestAnimationFrame(cuadro);
})();
