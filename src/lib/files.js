export const maxUploadBytes = 100 * 1024 * 1024;

const extensions = {
  stl: 'STL',
  obj: 'OBJ',
  step: 'STEP',
  stp: 'STEP',
  '3mf': 'THREE_MF',
  ply: 'PLY',
  gltf: 'GLTF',
  glb: 'GLB'
};

export const uploadableFormats = ['STL', 'OBJ', 'THREE_MF', 'PLY', 'GLTF', 'GLB'];

export const acceptAttribute = Object.entries(extensions)
  .filter(([, format]) => uploadableFormats.includes(format))
  .map(([ext]) => `.${ext}`)
  .join(',');

export const formatsLine = 'STL, OBJ, 3MF, PLY, glTF, GLB · up to 100 MB each';

export function extensionOf(name) {
  const match = /\.([^.]+)$/.exec(name ?? '');
  return match ? match[1].toLowerCase() : '';
}

export const formatOfName = (name) => extensions[extensionOf(name)] ?? null;

export function uploadProblem(file) {
  const format = formatOfName(file.name);
  if (format === 'STEP') return 'STEP isn’t supported — export the model as STL or 3MF';
  if (!format) return 'Unsupported format — use STL, OBJ, 3MF, PLY, glTF or GLB';
  if (file.size === 0) return 'The file is empty';
  if (file.size > maxUploadBytes) return 'Larger than 100 MB';
  if (file.name.length > 255) return 'The filename is longer than 255 characters';
  return '';
}

export function packingOf(file, accepted) {
  const target = file.packingFormat === undefined ? file.format : file.packingFormat;
  if (target && accepted.includes(target)) return 'packable';
  if (!uploadableFormats.includes(file.format)) return 'unsupported';
  if (!target) return 'reupload';
  return 'unaccepted';
}

export const isPackable = (file, accepted) => packingOf(file, accepted) === 'packable';

export function renameProblem(name, format) {
  const trimmed = name.trim();
  if (!trimmed) return 'Enter a filename';
  if (trimmed.length > 255) return 'Up to 255 characters';
  if (/[\u0000-\u001f\u007f/\\]/.test(trimmed)) return 'Slashes and control characters are not allowed';
  const next = formatOfName(trimmed);
  if (next !== format) {
    const keep = Object.entries(extensions)
      .filter(([, value]) => value === format)
      .map(([ext]) => `.${ext}`)
      .join(' or ');
    return `Keep the ${keep} extension — the format can't change`;
  }
  return '';
}

export const previewable = new Set(['OBJ', 'STL', 'PLY', 'GLB', 'GLTF', 'THREE_MF']);

export function viewerKind(format) {
  return { OBJ: 'obj', STL: 'stl', PLY: 'ply', GLB: 'glb', GLTF: 'gltf', THREE_MF: '3mf' }[format] ?? null;
}

export function save(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function stem(name) {
  return (name ?? 'result').replace(/\.[^.]+$/, '');
}
