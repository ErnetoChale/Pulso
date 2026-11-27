// Valida y publica casos de Pulso enviados como issues.
// El cuerpo del issue es contenido externo: se trata solo como datos.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

const { ACTION, LABEL, NUM, AUTHOR, OWNER, REPO } = process.env;
const BODY = process.env.BODY || '';
const APPROVE = 'aprobado';
const gh = (...a) => execFileSync('gh', a, { stdio: ['ignore', 'pipe', 'inherit'] }).toString();
const git = (...a) => execFileSync('git', a, { stdio: 'inherit' });
const comment = (text) => gh('issue', 'comment', NUM, '--repo', REPO, '--body', text);

function decode(body) {
  const m = body.match(/```pulso\s+([A-Za-z0-9_-]+)\s*```/);
  if (!m) throw new Error('No encontré el bloque del caso. Vuelve a enviarlo desde Pulso sin modificar el texto.');
  const code = m[1];
  const raw = Buffer.from(code.slice(1).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const txt = code[0] === 'z' ? zlib.inflateRawSync(raw, { maxOutputLength: 2_000_000 }).toString('utf8') : raw.toString('utf8');
  return JSON.parse(txt);
}

function validate(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) throw new Error('El caso no es un objeto JSON.');
  for (const k of ['id', 'title', 'start', 'states']) if (!c[k]) throw new Error(`Falta el campo "${k}".`);
  if (typeof c.title !== 'string' || c.title.length > 200) throw new Error('El título no es válido.');
  if (typeof c.states !== 'object' || !c.states[c.start]) throw new Error(`El estado inicial "${c.start}" no existe.`);
  for (const [id, s] of Object.entries(c.states)) {
    if (s.worse && !c.states[s.worse.to]) throw new Error(`El estado "${id}" empeora hacia "${s.worse.to}", que no existe.`);
  }
  for (const k of ['history', 'exam', 'tests', 'treatments']) if (c[k] && !Array.isArray(c[k])) throw new Error(`"${k}" debe ser una lista.`);
  if (JSON.stringify(c).length > 500_000) throw new Error('El caso es demasiado grande.');
  const acts = (c.history?.length || 0) + (c.exam?.length || 0) + (c.tests?.length || 0) + (c.treatments?.length || 0);
  if (acts < 3) throw new Error('El caso necesita al menos 3 acciones (interrogatorio, exploración, estudios o tratamiento).');
  return c;
}

// Imágenes: el caso trae marcadores "@1", "@2"… y el usuario arrastra las imágenes al issue en ese orden.
const ATT = /https:\/\/(?:github\.com\/user-attachments\/assets\/[\w-]+|(?:private-)?user-images\.githubusercontent\.com\/[^\s)"'<>]+)/g;
const attachments = () => [...new Set(BODY.match(ATT) || [])];
function imgFields(c) {
  const out = [];
  for (const o of [c.patient || {}, ...(c.exam || []), ...(c.tests || [])]) {
    if (typeof o.img === 'string') out.push([o, null]);
    else if (o.img && typeof o.img === 'object') for (const k of Object.keys(o.img)) out.push([o, k]);
  }
  return out;
}
const getImg = ([o, k]) => (k === null ? o.img : o.img[k]);
const setImg = ([o, k], v) => { if (k === null) { if (v === undefined) delete o.img; else o.img = v; } else { if (v === undefined) delete o.img[k]; else o.img[k] = v; } };
function markers(c) { return [...new Set(imgFields(c).map(getImg).filter((v) => /^@\d+$/.test(v)))].map((v) => +v.slice(1)); }
function sanitizeImgs(c) {
  for (const f of imgFields(c)) {
    const v = getImg(f);
    if (!(/^@\d+$/.test(v) || /^https:\/\//.test(v) || /^cases\/img\/[\w.-]+$/.test(v))) setImg(f, undefined);
  }
}
async function download(url) {
  for (const headers of [{}, { Authorization: `Bearer ${process.env.GH_TOKEN}` }]) {
    const r = await fetch(url, { headers, redirect: 'follow' });
    if (!r.ok) continue;
    const type = (r.headers.get('content-type') || '').toLowerCase();
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' }[type.split(';')[0]];
    if (!ext) throw new Error(`Un adjunto no es una imagen (${type || 'tipo desconocido'}).`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 5_000_000) throw new Error('Una imagen pesa más de 5 MB.');
    return { buf, ext };
  }
  throw new Error('No pude descargar una de las imágenes adjuntas.');
}

async function publish(c) {
  const slug = String(c.id).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'caso';
  fs.mkdirSync('cases', { recursive: true });
  const idxPath = 'cases/index.json';
  let idx = [];
  try { idx = JSON.parse(fs.readFileSync(idxPath, 'utf8')); } catch {}
  let file = `${slug}.json`;
  if (fs.existsSync(`cases/${file}`)) file = `${slug}-${NUM}.json`;
  c.id = file.replace(/\.json$/, '');
  c.submittedBy = AUTHOR;
  const need = markers(c), urls = attachments();
  if (need.length) {
    fs.mkdirSync('cases/img', { recursive: true });
    const map = {};
    for (const n of need) {
      if (!urls[n - 1]) continue;
      const { buf, ext } = await download(urls[n - 1]);
      const path = `cases/img/${c.id}-${n}.${ext}`;
      fs.writeFileSync(path, buf);
      map['@' + n] = path;
    }
    for (const f of imgFields(c)) { const v = getImg(f); if (/^@\d+$/.test(v)) setImg(f, map[v]); }
  }
  fs.writeFileSync(`cases/${file}`, JSON.stringify(c, null, 2) + '\n');
  if (!idx.includes(file)) idx.push(file);
  fs.writeFileSync(idxPath, JSON.stringify(idx, null, 2) + '\n');
  git('config', 'user.name', 'pulso-bot');
  git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com');
  git('add', 'cases');
  git('commit', '-m', `Publica caso: ${c.title} (#${NUM})`);
  git('pull', '--rebase', 'origin', 'HEAD');
  git('push', 'origin', 'HEAD');
  try { gh('api', '-X', 'POST', `repos/${REPO}/pages/builds`); } catch {}
  return file;
}

try { gh('label', 'create', APPROVE, '--repo', REPO, '--color', '2e9d4f', '--description', 'Publicar este caso en Pulso', '--force'); } catch {}

let c;
try {
  c = validate(decode(BODY));
  sanitizeImgs(c);
} catch (e) {
  if (ACTION !== 'labeled') comment(`**El caso no se pudo leer.** ${e.message}`);
  process.exit(0);
}

const ownerSent = AUTHOR.toLowerCase() === OWNER.toLowerCase();
const approved = (ACTION === 'labeled' && LABEL === APPROVE) || (ACTION === 'opened' && ownerSent);

if (approved) {
  const file = await publish(c);
  comment(`**Publicado.** «${c.title}» ya está en la biblioteca (\`cases/${file}\`). Aparece en la app en 1–2 minutos.`);
  gh('issue', 'close', NUM, '--repo', REPO);
} else if (ACTION !== 'labeled') {
  const need = markers(c).length, got = attachments().length;
  const imgNote = need ? (got >= need ? `\n\nImágenes: ${need} esperadas, ${got} adjuntas.` : `\n\n**Faltan imágenes:** el caso espera ${need} y el issue tiene ${got}. Edita el issue y arrástralas en el orden indicado; se volverá a revisar solo.`) : '';
  comment(`**Caso válido:** «${c.title}» (${Object.keys(c.states).length} estados, ${(c.tests || []).length} estudios, ${(c.treatments || []).length} tratamientos).${imgNote}\n\nQueda en espera de revisión. Para publicarlo, quien administra el repositorio agrega la etiqueta \`${APPROVE}\`.`);
}
