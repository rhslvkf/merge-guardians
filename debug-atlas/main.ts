/**
 * Dev-only page that renders every frame of each sheet with its index.
 *
 * Exists because nobody — including whoever wrote the manifest — can tell which
 * tile in a 130-sprite pack is a knight. Pick tiles here, paste the result into
 * `src/config/assets.ts`.
 *
 * Not part of the production build: Vite only bundles `index.html`, so this
 * page ships nowhere.
 */

import { SHEETS } from '../src/config/assets';

interface Pick {
  sheet: string;
  frame: number;
}

/**
 * Manifest paths are relative, because a portal serves the build from an
 * arbitrary sub-path. This page lives one directory down, so resolving them
 * as-is would look for `/debug-atlas/assets/...`.
 */
const sheetUrl = (path: string): string => `/${path}`;

const picks: Pick[] = [];

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const tileInput = el<HTMLInputElement>('tile');
const marginInput = el<HTMLInputElement>('margin');
const spacingInput = el<HTMLInputElement>('spacing');
const zoomInput = el<HTMLInputElement>('zoom');
const sheetsRoot = el<HTMLElement>('sheets');
const pickList = el<HTMLPreElement>('picklist');

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function renderPicks(): void {
  if (picks.length === 0) {
    pickList.textContent = '(none yet)';
    return;
  }
  pickList.textContent = picks
    .map((p) => `{ sheet: '${p.sheet}', frame: ${p.frame} },`)
    .join('\n');
}

async function renderSheet(name: string, spec: (typeof SHEETS)[string]): Promise<void> {
  const section = document.createElement('section');
  const title = document.createElement('h2');
  title.textContent = `${name}  —  ${spec.path}`;
  section.appendChild(title);

  const meta = document.createElement('p');
  meta.className = 'meta';
  section.appendChild(meta);
  sheetsRoot.appendChild(section);

  const img = await loadImage(sheetUrl(spec.path));
  if (!img) {
    meta.className = 'meta missing';
    meta.textContent = `NOT FOUND — expected at public/${spec.path}`;
    return;
  }

  const tile = Number(tileInput.value);
  const margin = Number(marginInput.value);
  const spacing = Number(spacingInput.value);
  const zoom = Number(zoomInput.value);

  // Phaser's own frame maths: how many whole tiles fit once margin and the
  // inter-tile spacing are accounted for.
  const cols = Math.floor((img.width - margin + spacing) / (tile + spacing));
  const rows = Math.floor((img.height - margin + spacing) / (tile + spacing));
  const total = cols * rows;

  meta.textContent =
    `${img.width}x${img.height}px  ->  ${cols} cols x ${rows} rows = ${total} frames ` +
    `(tile ${tile}, margin ${margin}, spacing ${spacing})`;

  const grid = document.createElement('div');
  grid.className = 'grid';
  section.appendChild(grid);

  for (let i = 0; i < total; i++) {
    const cx = margin + (i % cols) * (tile + spacing);
    const cy = margin + Math.floor(i / cols) * (tile + spacing);

    const cell = document.createElement('div');
    cell.className = 'cell';

    const canvas = document.createElement('canvas');
    canvas.width = tile * zoom;
    canvas.height = tile * zoom;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, cx, cy, tile, tile, 0, 0, tile * zoom, tile * zoom);

    const label = document.createElement('div');
    label.className = 'idx';
    label.textContent = String(i);

    cell.append(canvas, label);
    cell.addEventListener('click', () => {
      const at = picks.findIndex((p) => p.sheet === name && p.frame === i);
      if (at >= 0) {
        picks.splice(at, 1);
        cell.classList.remove('picked');
      } else {
        picks.push({ sheet: name, frame: i });
        cell.classList.add('picked');
      }
      renderPicks();
    });
    grid.appendChild(cell);
  }
}

async function renderAll(): Promise<void> {
  sheetsRoot.textContent = '';
  for (const [name, spec] of Object.entries(SHEETS)) {
    await renderSheet(name, spec);
  }
}

el<HTMLButtonElement>('reload').addEventListener('click', () => void renderAll());
el<HTMLButtonElement>('clear').addEventListener('click', () => {
  picks.length = 0;
  document.querySelectorAll('.cell.picked').forEach((c) => c.classList.remove('picked'));
  renderPicks();
});
for (const input of [tileInput, marginInput, spacingInput, zoomInput]) {
  input.addEventListener('change', () => void renderAll());
}

void renderAll();
renderPicks();
