/** Small bounded ZIP codec shared by Node and browsers; no Node-only imports. */
const encoder = new TextEncoder(), decoder = new TextDecoder();
export const bytes = value => typeof value === 'string' ? encoder.encode(value) : new Uint8Array(value);
export const text = value => decoder.decode(value);
const table = Uint32Array.from({length: 256}, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ n >>> 1 : n >>> 1;
  return n >>> 0;
});
export function crc32(data) {
  let crc = 0xffffffff;
  for (const b of data) crc = table[(crc ^ b) & 255] ^ crc >>> 8;
  return (crc ^ 0xffffffff) >>> 0;
}
const concat = chunks => {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {out.set(c, offset); offset += c.length;}
  return out;
};
export function zip(entries) {
  const local = [], central = []; let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const path = bytes(name), data = bytes(value), crc = crc32(data);
    const header = new Uint8Array(30 + path.length), h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
    h.setUint16(26, path.length, true); header.set(path, 30);
    const cd = new Uint8Array(46 + path.length), c = new DataView(cd.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true);
    c.setUint16(8, 0x800, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true);
    c.setUint32(24, data.length, true); c.setUint16(28, path.length, true); c.setUint32(42, offset, true);
    cd.set(path, 46); local.push(header, data); central.push(cd); offset += header.length + data.length;
  }
  const end = new Uint8Array(22), view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true); view.setUint16(8, central.length, true); view.setUint16(10, central.length, true);
  view.setUint32(12, central.reduce((n, c) => n + c.length, 0), true); view.setUint32(16, offset, true);
  return concat([...local, ...central, end]);
}
async function inflate(data, expected) {
  if (typeof DecompressionStream !== 'function') throw new Error('Browser cannot decompress XLSX; use a supported browser.');
  const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks = []; let length = 0;
  try {
    while (true) {
      const {value, done} = await reader.read(); if (done) break;
      length += value.length;
      if (length > expected) throw new Error('ZIP expanded size exceeds its declared bound');
      chunks.push(value);
    }
  } catch (error) {await reader.cancel().catch(() => {}); throw error;}
  return concat(chunks);
}
export async function unzip(input) {
  const data = bytes(input), v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const fail = () => {throw new Error('Invalid or unsupported ZIP archive');};
  if (data.length < 22 || data.length > 20 * 1024 * 1024) fail();
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50 && i + 22 + v.getUint16(i + 20, true) === data.length) {end = i; break;}
  }
  if (end < 0 || v.getUint16(end + 4, true) || v.getUint16(end + 6, true)) fail();
  const count = v.getUint16(end + 10, true), centralSize = v.getUint32(end + 12, true);
  let pos = v.getUint32(end + 16, true), total = 0;
  const centralEnd = pos + centralSize, out = Object.create(null);
  if (count > 2000 || centralEnd > end) fail();
  for (let i = 0; i < count; i++) {
    if (pos + 46 > centralEnd || v.getUint32(pos, true) !== 0x02014b50) fail();
    const flag = v.getUint16(pos + 8, true), method = v.getUint16(pos + 10, true);
    const crc = v.getUint32(pos + 16, true), packed = v.getUint32(pos + 20, true), size = v.getUint32(pos + 24, true);
    const n = v.getUint16(pos + 28, true), extra = v.getUint16(pos + 30, true), comment = v.getUint16(pos + 32, true);
    const offset = v.getUint32(pos + 42, true);
    if (flag & 1 || ![0, 8].includes(method) || pos + 46 + n + extra + comment > centralEnd) fail();
    const name = text(data.subarray(pos + 46, pos + 46 + n));
    if (!name || name.startsWith('/') || name.includes('\\') || name.split('/').includes('..') || name in out) fail();
    total += size;
    if (size > 16 * 1024 * 1024 || total > 64 * 1024 * 1024) throw new Error('XLSX exceeds expanded-size limit');
    if (offset + 30 > pos || v.getUint32(offset, true) !== 0x04034b50) fail();
    const start = offset + 30 + v.getUint16(offset + 26, true) + v.getUint16(offset + 28, true);
    if (start + packed > v.getUint32(end + 16, true)) fail();
    const raw = data.subarray(start, start + packed), decoded = method === 0 ? raw : await inflate(raw, size);
    if (decoded.length !== size || crc32(decoded) !== crc) throw new Error('ZIP integrity check failed');
    out[name] = decoded; pos += 46 + n + extra + comment;
  }
  return out;
}
