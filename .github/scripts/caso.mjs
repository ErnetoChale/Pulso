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

function publish(c) {
  const slug = String(c.id).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'caso';
  fs.mkdirSync('cases', { recursive: true });
  const idxPath = 'cases/index.json';
  let idx = [];
  try { idx = JSON.parse(fs.readFileSync(idxPath, 'utf8')); } catch {}
  let file = `${slug}.json`;
  if (fs.existsSync(`cases/${file}`)) file = `${slug}-${NUM}.json`;
  c.id = file.replace(/\.json$/, '');
  c.submittedBy = AUTHOR;
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
} catch (e) {
  if (ACTION !== 'labeled') comment(`**El caso no se pudo leer.** ${e.message}`);
  process.exit(0);
}

const ownerSent = AUTHOR.toLowerCase() === OWNER.toLowerCase();
const approved = (ACTION === 'labeled' && LABEL === APPROVE) || (ACTION === 'opened' && ownerSent);

if (approved) {
  const file = publish(c);
  comment(`**Publicado.** «${c.title}» ya está en la biblioteca (\`cases/${file}\`). Aparece en la app en 1–2 minutos.`);
  gh('issue', 'close', NUM, '--repo', REPO);
} else if (ACTION !== 'labeled') {
  comment(`**Caso válido:** «${c.title}» (${Object.keys(c.states).length} estados, ${(c.tests || []).length} estudios, ${(c.treatments || []).length} tratamientos).\n\nQueda en espera de revisión. Para publicarlo, quien administra el repositorio agrega la etiqueta \`${APPROVE}\`.`);
}
