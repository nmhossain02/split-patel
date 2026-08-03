import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const markdownFiles = ['README.md', 'CONTRIBUTING.md'];
const visit = directory => {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) visit(path);
    else if (name.endsWith('.md')) markdownFiles.push(relative(root, path));
  }
};
visit(join(root, 'docs'));

const failures = [];
const criterionOwners = new Map();
const anchor = heading => heading.toLowerCase().trim()
  .replace(/[^\p{L}\p{N}\s-]/gu, '')
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-');

for (const file of markdownFiles) {
  const absolute = join(root, file);
  const source = readFileSync(absolute, 'utf8');
  for (const match of source.matchAll(/\*\*((?:AUTH|TAB|EXP)-\d{3}):\*\*/g)) {
    const id = match[1];
    const previous = criterionOwners.get(id);
    if (previous) failures.push(`${id} is defined more than once in ${previous} and ${file}`);
    else criterionOwners.set(id, file);
  }
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const raw = match[1].trim();
    if (!raw || raw.startsWith('http:') || raw.startsWith('https:') || raw.startsWith('mailto:')) continue;
    const [rawPath, fragment] = raw.split('#', 2);
    const target = rawPath ? resolve(dirname(absolute), decodeURIComponent(rawPath)) : absolute;
    if (!existsSync(target)) {
      failures.push(`${file}: missing local link target ${raw}`);
      continue;
    }
    if (fragment && target.endsWith('.md')) {
      const headings = readFileSync(target, 'utf8').split('\n')
        .filter(line => /^#{1,6} /.test(line))
        .map(line => anchor(line.replace(/^#{1,6} /, '')));
      if (!headings.includes(decodeURIComponent(fragment))) failures.push(`${file}: missing heading for ${raw}`);
    }
  }
}

const traceabilityFile = 'docs/testing/traceability.md';
const traceability = readFileSync(join(root, traceabilityFile), 'utf8');
const tracedCriteria = new Set(
  [...traceability.matchAll(/^\| ((?:AUTH|TAB|EXP)-\d{3}) \|/gm)].map(match => match[1]),
);
for (const [id, owner] of criterionOwners) {
  if (!tracedCriteria.has(id)) failures.push(`${id} from ${owner} is missing from ${traceabilityFile}`);
}
for (const id of tracedCriteria) {
  if (!criterionOwners.has(id)) failures.push(`${traceabilityFile} references unknown criterion ${id}`);
}

if (failures.length) {
  failures.forEach(failure => console.error(failure));
  process.exitCode = 1;
} else {
  console.log(`Documentation check passed for ${markdownFiles.length} files.`);
}
