'use strict';

// Reine Client-Seite ohne Server/Electron: Bilder und Musik werden wie auf
// einer normalen Website per relativem Pfad eingebunden (siehe
// images-manifest.js). Nur fuer den Video-Ordner im Aphantasie Player
// (Menuepunkt 4) braucht es einmalig einen nativen Ordner-Auswahldialog,
// weil ein Browser aus Sicherheitsgruenden keine beliebigen Ordner der
// Festplatte selbststaendig einlesen darf.

window.addEventListener('error', (e) => {
  console.error('Uncaught:', e.message, e.filename + ':' + e.lineno);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('UnhandledRejection:', e.reason && (e.reason.stack || e.reason));
});

// =========================================================================
// Tastatur-Hilfsfunktionen (Ersatz fuer pyglets pump()/KeyStateHandler)
// =========================================================================
const held = new Set();
let pressedQueue = [];
let textQueue = [];

window.addEventListener('keydown', (e) => {
  // Tastenkombinationen mit Ctrl/Cmd/Alt unangetastet an Safari/macOS
  // durchreichen - z.B. das Vollbild-Kuerzel (Globus/Fn + F bzw. ⌃⌘F) oder
  // Cmd+Q/Cmd+W. Unser Programm selbst nutzt ohnehin nur einzelne Tasten
  // ohne Modifier.
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (!e.repeat) pressedQueue.push(e.code);
  held.add(e.code);
  if (/^[0-9]$/.test(e.key) || e.key === '.') textQueue.push(e.key);
  e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  held.delete(e.code);
});
window.addEventListener('blur', () => held.clear());

// Ein "Frame" lang Events verarbeiten: liefert seit dem letzten Aufruf neu
// gedrueckte Tasten (ohne Auto-Repeat des Browsers) und eingegebenen Text.
function pump() {
  const keys = pressedQueue;
  pressedQueue = [];
  const texts = textQueue;
  textQueue = [];
  return { keys, texts };
}
function isHeld(code) {
  return held.has(code);
}
function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const KEY_REPEAT_DELAY = 400; // ms, wie in Python (0.4s)
const KEY_REPEAT_INTERVAL = 50; // ms, wie in Python (0.05s)

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm', '.mpg', '.mpeg', '.flv', '.wmv'];

const app = document.getElementById('app');
function clearApp() {
  app.innerHTML = '';
}

// Bilder vorab laden (wie im Python-Original, das alle Sprites vor der
// Diashow erzeugt) und cachen - noetig, damit <canvas> sie zeichnen kann.
const imageCache = new Map();
function loadImage(path) {
  if (imageCache.has(path)) return imageCache.get(path);
  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = path;
  });
  imageCache.set(path, promise);
  return promise;
}

// =========================================================================
// Hintergrundmusik
// =========================================================================
const bgAudio = new Audio('Sounds/_interstellar.mp3');
bgAudio.loop = true;
let musicOn = false;

function pauseAudio() {
  bgAudio.pause();
}
function resumeAudio() {
  bgAudio.play().catch(() => {});
}
// Nur aus der Bilderanzeige (Menuepunkt 1/2/3) heraus aufrufen.
function toggleMusic() {
  musicOn = !musicOn;
  if (musicOn) resumeAudio();
  else pauseAudio();
}

// =========================================================================
// Hauptmenue
// =========================================================================
async function menu(initialSelection = 0) {
  let selection = initialSelection;
  const labelsText = [
    'Bilderanzeige Auto',
    'Bilderanzeige Manuell',
    'Bilderanzeige Experimentell',
    'Aphantasie Player',
  ];
  const lastIndex = labelsText.length - 1;
  // Im Hauptmenue ist die Musik IMMER aus.
  pauseAudio();

  clearApp();
  const title = document.createElement('div');
  title.className = 'menu-title';
  title.style.top = '25%';
  title.textContent = 'Aphantasia Cure Trainer';
  app.appendChild(title);

  const items = labelsText.map((text, i) => {
    const el = document.createElement('div');
    el.className = 'menu-item';
    el.style.top = `${48 + i * 9}%`;
    el.textContent = text;
    app.appendChild(el);
    return el;
  });

  function render() {
    items.forEach((el, i) => el.classList.toggle('selected', i === selection));
  }
  render();

  while (true) {
    await nextFrame();
    const { keys } = pump();
    for (const k of keys) {
      if (k === 'ArrowUp' && selection > 0) selection -= 1;
      else if (k === 'ArrowDown' && selection < lastIndex) selection += 1;
      else if (k === 'Enter' || k === 'NumpadEnter') return selection;
    }
    render();
  }
}

// =========================================================================
// Zeitabfrage fuer zwei Werte auf einem Bildschirm
// =========================================================================
async function askTwoTimes(prompt1, default1, prompt2, default2) {
  const inputs = ['', ''];
  const prompts = [prompt1, prompt2];
  const defaults = [default1, default2];
  let field = 0;

  clearApp();
  const rows = [0, 1].map((i) => {
    const row = document.createElement('div');
    row.className = 'input-row';
    row.style.top = `${48 + i * 7}%`;
    const promptSpan = document.createElement('span');
    promptSpan.className = 'input-prompt';
    promptSpan.textContent = prompts[i];
    const valueSpan = document.createElement('span');
    valueSpan.className = 'input-value';
    row.appendChild(promptSpan);
    row.appendChild(valueSpan);
    app.appendChild(row);
    return { row, valueSpan };
  });

  function parsedValues() {
    return inputs.map((text, i) => {
      const v = parseFloat(text);
      return text !== '' && !Number.isNaN(v) ? v : defaults[i];
    });
  }

  function render() {
    rows.forEach(({ row, valueSpan }, i) => {
      const active = i === field;
      row.classList.toggle('active', active);
      valueSpan.textContent = inputs[i] + (active ? '_' : '');
    });
  }
  render();

  while (true) {
    await nextFrame();
    const { keys, texts } = pump();
    for (const t of texts) {
      inputs[field] += t;
    }
    for (const k of keys) {
      if (k === 'Escape') return defaults;
      else if (k === 'Backspace') inputs[field] = inputs[field].slice(0, -1);
      else if (k === 'Enter' || k === 'NumpadEnter') {
        if (field === 0) field = 1;
        else return parsedValues();
      } else if (k === 'ArrowUp' && field > 0) field -= 1;
      else if ((k === 'ArrowDown' || k === 'Tab') && field < 1) field += 1;
    }
    render();
  }
}

// =========================================================================
// Slideshow
// =========================================================================
async function slideshow(imagePaths, mode, displayTime, blackTime) {
  let index = 0;
  const lastIndex = imagePaths.length - 1;

  // Musik ist beim Betreten eines Menuepunkts (1/2/3) IMMER aus.
  musicOn = false;
  pauseAudio();

  // Bilder werden vorab geladen und ueber <canvas> gezeichnet (statt ein
  // <img>-Element per src auszutauschen): dadurch garantiert clearRect() vor
  // jedem Zeichnen, dass kein Rest eines vorherigen (groesseren) Bildes im
  // Fenstermodus stehen bleibt - ein bekannter WebKit-Repaint-Bug bei
  // object-fit-<img>, der nur im echten Vollbild nicht auftritt.
  const images = await Promise.all(imagePaths.map(loadImage));

  clearApp();
  const canvas = document.createElement('canvas');
  canvas.className = 'slide-canvas';
  app.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = app.clientWidth;
    const h = app.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  function showImage(i) {
    const img = images[i];
    const vw = app.clientWidth;
    const vh = app.clientHeight;
    ctx.clearRect(0, 0, vw, vh);
    const scale = Math.min(vw / img.naturalWidth, vh / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    ctx.drawImage(img, (vw - w) / 2, (vh - h) / 2, w, h);
  }
  function showBlack() {
    const vw = app.clientWidth;
    const vh = app.clientHeight;
    ctx.clearRect(0, 0, vw, vh);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, vw, vh);
  }

  try {
    await slideshowLoop();
  } finally {
    window.removeEventListener('resize', resizeCanvas);
  }

  async function slideshowLoop() {
  if (mode === 0) {
    // Auto
    while (true) {
      for (let i = 0; i < imagePaths.length; i++) {
        showImage(i);
        let start = performance.now();
        while (performance.now() - start < displayTime * 1000) {
          await nextFrame();
          const { keys } = pump();
          for (const k of keys) {
            if (k === 'Escape') return;
            else if (k === 'KeyM') toggleMusic();
          }
        }
        showBlack();
        start = performance.now();
        while (performance.now() - start < blackTime * 1000) {
          await nextFrame();
          const { keys } = pump();
          for (const k of keys) {
            if (k === 'Escape') return;
            else if (k === 'KeyM') toggleMusic();
          }
        }
      }
    }
  } else if (mode === 1) {
    // Manuell
    while (true) {
      showImage(index);
      let waiting = true;
      while (waiting) {
        await nextFrame();
        const { keys } = pump();
        for (const k of keys) {
          if (['Enter', 'NumpadEnter', 'Space', 'ArrowRight'].includes(k) && index < lastIndex) {
            index += 1;
            waiting = false;
          } else if (k === 'ArrowLeft' && index > 0) {
            index -= 1;
            waiting = false;
          } else if (k === 'ArrowDown' || k === 'ArrowUp') {
            waiting = false;
          } else if (k === 'Escape') {
            return;
          } else if (k === 'KeyM') {
            toggleMusic();
          }
        }
      }
    }
  } else {
    // Experimentell
    showImage(index);
    let first = true;
    let showBlackFlag = true;
    while (true) {
      if (first) {
        first = false;
      } else if (!showBlackFlag) {
        showImage(index);
        await sleep(100);
        showBlack();
        showBlackFlag = true;
      }
      let waiting = true;
      while (waiting) {
        await nextFrame();
        const { keys } = pump();
        for (const k of keys) {
          if (k === 'ArrowRight' && index < lastIndex) {
            index += 1;
            showBlackFlag = false;
            waiting = false;
          } else if (k === 'ArrowLeft' && index > 0) {
            index -= 1;
            showBlackFlag = false;
            waiting = false;
          } else if (k === 'ArrowUp' || k === 'ArrowDown') {
            showBlackFlag = false;
            waiting = false;
          } else if (k === 'Escape') {
            return;
          } else if (k === 'KeyM') {
            toggleMusic();
          }
        }
      }
    }
  }
  }
}

// =========================================================================
// Aphantasie Player: Ordner-Auswahl (ersetzt den freien Datei-System-Zugriff)
// =========================================================================
// Der Browser darf ohne Nutzeraktion keine Ordner lesen. Ein echter Mausklick
// auf dieses Element oeffnet den nativen macOS-Ordnerdialog; danach liegt der
// komplette Unterbaum (alle Dateien rekursiv) als flache Liste mit
// File.webkitRelativePath vor und wird lokal zu einem Baum zusammengesetzt -
// ab dann laeuft die Navigation rein im Browser, genau wie im Original.
function pickVideoFolder() {
  return new Promise((resolve) => {
    clearApp();
    const wrap = document.createElement('div');
    wrap.className = 'picker-wrap';

    const label = document.createElement('label');
    label.className = 'picker-button';
    label.textContent = 'Video-Ordner wählen';

    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.multiple = true;
    input.className = 'picker-input';
    label.appendChild(input);

    const hint = document.createElement('div');
    hint.className = 'picker-hint';
    hint.textContent = 'ESC = zurück zum Menü';

    wrap.appendChild(label);
    wrap.appendChild(hint);
    app.appendChild(wrap);

    let done = false;

    input.addEventListener('change', () => {
      if (done) return;
      done = true;
      const files = Array.from(input.files).filter((f) => {
        if (f.name.startsWith('.')) return false;
        const lower = f.name.toLowerCase();
        return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
      });
      resolve(files);
    });

    (async function watchEscape() {
      while (!done) {
        await nextFrame();
        const { keys } = pump();
        if (keys.includes('Escape')) {
          done = true;
          resolve(null);
          return;
        }
      }
    })();
  });
}

// Baut aus der flachen File-Liste (webkitRelativePath, z.B. "TC/Filme/a.mp4")
// einen verschachtelten Baum aus { type: 'dir', children: Map } bzw.
// { type: 'file', file }.
function buildVideoTree(files) {
  const root = { type: 'dir', name: '', children: new Map() };
  for (const file of files) {
    const parts = (file.webkitRelativePath || file.name).split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!node.children.has(part)) {
        node.children.set(part, { type: 'dir', name: part, children: new Map() });
      }
      node = node.children.get(part);
    }
    const fileName = parts[parts.length - 1];
    node.children.set(fileName, { type: 'file', name: fileName, file });
  }
  return root;
}

// =========================================================================
// Aphantasie Player: Datei-Manager (navigiert den im Speicher liegenden Baum)
// =========================================================================
async function fileManager(root) {
  // Die Ordnerauswahl liefert immer genau einen Wurzelordner - direkt hinein
  // wechseln, statt ihn als einzigen Eintrag extra anzuzeigen.
  let stack = [root];
  const firstChild = [...root.children.values()][0];
  if (firstChild && firstChild.type === 'dir') stack.push(firstChild);

  let selection = 0;
  let scroll = 0;
  const maxVisible = 12;
  const navRepeatNext = {};

  clearApp();
  const pathEl = document.createElement('div');
  pathEl.className = 'fm-path';
  app.appendChild(pathEl);
  const listEl = document.createElement('div');
  listEl.className = 'fm-list';
  app.appendChild(listEl);

  function currentNode() {
    return stack[stack.length - 1];
  }

  function currentEntries() {
    const node = currentNode();
    const dirs = [];
    const files = [];
    for (const child of node.children.values()) {
      if (child.name.startsWith('.')) continue;
      if (child.type === 'dir') dirs.push(child.name + '/');
      else files.push(child.name);
    }
    const byName = (a, b) => a.toLowerCase().localeCompare(b.toLowerCase());
    dirs.sort(byName);
    files.sort(byName);
    let entries = dirs.concat(files);
    if (stack.length > 1) entries = entries.concat(['..']);
    return entries;
  }

  let entries = currentEntries();

  function currentPathLabel() {
    return stack
      .slice(1)
      .map((n) => n.name)
      .join('/');
  }

  function enterEntry(name) {
    if (name === '..') {
      if (stack.length > 1) stack.pop();
    } else {
      const child = currentNode().children.get(name.slice(0, -1));
      if (child && child.type === 'dir') stack.push(child);
    }
    entries = currentEntries();
    selection = 0;
    scroll = 0;
  }

  function moveSelection(delta) {
    if (entries.length) selection = Math.max(0, Math.min(entries.length - 1, selection + delta));
  }

  function render() {
    pathEl.textContent = currentPathLabel();
    listEl.innerHTML = '';
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'fm-empty';
      empty.textContent = '(leer)';
      listEl.appendChild(empty);
      return;
    }
    if (selection < scroll) scroll = selection;
    else if (selection >= scroll + maxVisible) scroll = selection - maxVisible + 1;
    const visible = entries.slice(scroll, scroll + maxVisible);
    visible.forEach((name, i) => {
      const idx = scroll + i;
      const el = document.createElement('div');
      el.className = 'fm-item' + (idx === selection ? ' selected' : '');
      el.textContent = name.endsWith('/') ? name.slice(0, -1) : name;
      listEl.appendChild(el);
    });
  }
  render();

  while (true) {
    await nextFrame();
    const { keys } = pump();
    const now = performance.now();
    for (const k of keys) {
      if (k === 'ArrowUp') {
        moveSelection(-1);
        navRepeatNext[k] = now + KEY_REPEAT_DELAY;
      } else if (k === 'ArrowDown') {
        moveSelection(1);
        navRepeatNext[k] = now + KEY_REPEAT_DELAY;
      } else if ((k === 'Enter' || k === 'NumpadEnter') && entries.length) {
        const chosen = entries[selection];
        if (chosen === '..' || chosen.endsWith('/')) {
          enterEntry(chosen);
        } else {
          const child = currentNode().children.get(chosen);
          return child.file;
        }
      } else if (k === 'ArrowLeft') {
        if (stack.length > 1) enterEntry('..');
        navRepeatNext[k] = now + KEY_REPEAT_DELAY;
      } else if (k === 'Escape') {
        return null;
      }
    }

    // Wiederholung bei gehaltener Taste (halb so hohe Rate wie das Intervall).
    const navActions = [
      ['ArrowUp', () => moveSelection(-1)],
      ['ArrowDown', () => moveSelection(1)],
      ['ArrowLeft', () => stack.length > 1 && enterEntry('..')],
    ];
    for (const [code, action] of navActions) {
      if (isHeld(code)) {
        const nextT = navRepeatNext[code];
        if (nextT !== undefined && now >= nextT) {
          action();
          navRepeatNext[code] = now + KEY_REPEAT_INTERVAL * 2;
        }
      } else {
        delete navRepeatNext[code];
      }
    }
    render();
  }
}

// =========================================================================
// Aphantasie Player: Videowiedergabe (abwechselnd normal / schwarz)
// =========================================================================
const SEEK_STEP = { ArrowRight: 5, ArrowLeft: -5, ArrowUp: 60, ArrowDown: -60 };
const PROGRESS_VISIBLE_MS = 1500;

function formatTime(seconds) {
  seconds = seconds == null || seconds < 0 ? 0 : Math.floor(seconds);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

async function playMovieAlternating(movieFile, displayS, blackS) {
  clearApp();
  const videoEl = document.createElement('video');
  videoEl.className = 'slide';
  videoEl.loop = true;
  videoEl.autoplay = true;
  const objectUrl = URL.createObjectURL(movieFile);
  videoEl.src = objectUrl;
  app.appendChild(videoEl);

  const blackEl = document.createElement('div');
  blackEl.className = 'black-overlay hidden';
  app.appendChild(blackEl);

  const progressWrap = document.createElement('div');
  progressWrap.className = 'progress-wrap hidden';
  const progressBg = document.createElement('div');
  progressBg.className = 'progress-bg';
  const progressFill = document.createElement('div');
  progressFill.className = 'progress-fill';
  progressBg.appendChild(progressFill);
  const labelStart = document.createElement('span');
  labelStart.className = 'progress-label left';
  labelStart.textContent = '0';
  const labelEnd = document.createElement('span');
  labelEnd.className = 'progress-label right';
  const labelPos = document.createElement('span');
  labelPos.className = 'progress-label center';
  progressWrap.appendChild(progressBg);
  progressWrap.appendChild(labelStart);
  progressWrap.appendChild(labelEnd);
  progressWrap.appendChild(labelPos);
  app.appendChild(progressWrap);

  function cleanup() {
    videoEl.pause();
    videoEl.removeAttribute('src');
    videoEl.load();
    URL.revokeObjectURL(objectUrl);
  }

  try {
    await videoEl.play();
  } catch {
    // Wiedergabe startet ggf. erst nach dem ersten Frame-Tick - kein Abbruch hier.
  }

  // Auf das tatsaechliche Oeffnen warten (Dauer erst nach Laden der Metadaten bekannt).
  const deadline = performance.now() + 8000;
  while ((!videoEl.duration || Number.isNaN(videoEl.duration)) && performance.now() < deadline) {
    await nextFrame();
    const { keys } = pump();
    if (keys.includes('Escape')) {
      cleanup();
      return;
    }
  }
  if (!videoEl.duration || Number.isNaN(videoEl.duration)) {
    cleanup();
    return; // Datei liess sich nicht oeffnen
  }

  let showing = true;
  let phaseEnd = performance.now() + Math.max(displayS, 0.05) * 1000;
  let progressUntil = 0;
  const seekRepeatNext = {};
  let paused = false;
  let pauseStartedAt = null;

  function doSeek(amount) {
    const duration = videoEl.duration || 0;
    videoEl.currentTime = Math.max(0, Math.min(duration, videoEl.currentTime + amount));
    progressUntil = performance.now() + PROGRESS_VISIBLE_MS;
  }

  while (true) {
    await nextFrame();
    const { keys } = pump();
    let stop = false;
    const now = performance.now();
    for (const k of keys) {
      if (k === 'Escape') {
        stop = true;
      } else if (k === 'Space') {
        paused = !paused;
        if (paused) {
          videoEl.pause();
          pauseStartedAt = now;
        } else {
          videoEl.play().catch(() => {});
          if (pauseStartedAt !== null) {
            phaseEnd += now - pauseStartedAt;
            pauseStartedAt = null;
          }
        }
      } else if (k in SEEK_STEP) {
        doSeek(SEEK_STEP[k]);
        seekRepeatNext[k] = now + KEY_REPEAT_DELAY;
      }
    }
    if (stop) {
      cleanup();
      return;
    }

    for (const [code, amount] of Object.entries(SEEK_STEP)) {
      if (isHeld(code)) {
        const nextT = seekRepeatNext[code];
        if (nextT !== undefined && now >= nextT) {
          doSeek(amount);
          seekRepeatNext[code] = now + KEY_REPEAT_INTERVAL;
        }
      } else {
        delete seekRepeatNext[code];
      }
    }

    if (!paused && now >= phaseEnd) {
      showing = !showing;
      phaseEnd = now + Math.max(showing ? displayS : blackS, 0.05) * 1000;
    }
    blackEl.classList.toggle('hidden', showing);

    if (now < progressUntil) {
      const duration = videoEl.duration || 0;
      const pos = videoEl.currentTime || 0;
      const frac = duration <= 0 ? 0 : Math.max(0, Math.min(1, pos / duration));
      progressFill.style.width = `${Math.max(1, frac * 100)}%`;
      labelEnd.textContent = formatTime(duration);
      labelPos.textContent = formatTime(pos);
      progressWrap.classList.remove('hidden');
    } else {
      progressWrap.classList.add('hidden');
    }
  }
}

// =========================================================================
// Aphantasie Player: Ordner waehlen (einmal pro Sitzung) -> Datei-Manager ->
// Zeiteingaben -> Wiedergabe
// =========================================================================
let cachedVideoTree = null;

async function aphantasiePlayer() {
  if (!cachedVideoTree) {
    const files = await pickVideoFolder();
    if (!files || !files.length) return;
    cachedVideoTree = buildVideoTree(files);
  }
  const movieFile = await fileManager(cachedVideoTree);
  if (!movieFile) return;
  const [displayS, blackS] = await askTwoTimes(
    'Länge Filmstück (Sek.): ', 5,
    'Länge Schwarzbild (Sek.): ', 2
  );
  await playMovieAlternating(movieFile, displayS, blackS);
}

// =========================================================================
// Hauptprogramm
// =========================================================================
async function main() {
  let lastSelection = 0;
  while (true) {
    const mode = await menu(lastSelection);
    lastSelection = mode;

    if (mode === 3) {
      await aphantasiePlayer();
      continue;
    }

    let displayTime = 0;
    let blackTime = 0;
    if (mode === 0) {
      [displayTime, blackTime] = await askTwoTimes(
        'Dauer der Bildanzeige (Sek.): ', 1,
        'Dauer des schwarzen Bildschirms (Sek.): ', 3
      );
    }

    const imagePaths = (window.IMAGE_FILES || []).map((name) => 'Pictures/' + name);
    if (!imagePaths.length) {
      clearApp();
      const msg = document.createElement('div');
      msg.className = 'error-message';
      msg.textContent = 'Keine Bilder gefunden!';
      app.appendChild(msg);
      return;
    }
    await slideshow(imagePaths, mode, displayTime, blackTime);
  }
}

main();
