/** OOXML subset parser. DTDs and external entities are deliberately rejected. */
export const escapeXml = value => String(value ?? '').replace(/[&<>"']/g,
  ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;'}[ch]));
const unescape = value => value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, code) => {
  if (code[0] === '#') return String.fromCodePoint(code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1)));
  return {amp:'&', lt:'<', gt:'>', quot:'"', apos:"'"}[code];
});
export function parseXml(source) {
  if (source.length > 16 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('Unsupported XML declaration');
  const root = {name:'root', attrs:{}, children:[], parts:[]}, stack = [root];
  const tokens = source.match(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]+>|[^<]+/g) || [];
  for (const token of tokens) {
    const parent = stack.at(-1);
    if (token.startsWith('<!--') || token.startsWith('<?')) continue;
    if (token.startsWith('<![CDATA[')) {parent.parts.push(token.slice(9, -3)); continue;}
    if (!token.startsWith('<')) {parent.parts.push(unescape(token)); continue;}
    if (token.startsWith('</')) {
      if (stack.length === 1 || token.slice(2, -1).trim() !== parent.tag) throw new Error('Malformed XML');
      stack.pop(); continue;
    }
    const match = token.match(/^<([\w:.-]+)([\s\S]*?)\/?\s*>$/);
    if (!match) throw new Error('Malformed XML tag');
    const node = {tag:match[1], name:match[1].split(':').at(-1), attrs:Object.create(null), children:[], parts:[]};
    for (const a of match[2].matchAll(/([\w:.-]+)\s*=\s*(["'])([\s\S]*?)\2/g)) node.attrs[a[1]] = unescape(a[3]);
    parent.children.push(node); parent.parts.push(node);
    if (!/\/\s*>$/.test(token)) stack.push(node);
    if (stack.length > 64) throw new Error('XML nesting exceeds limit');
  }
  if (stack.length !== 1) throw new Error('Unclosed XML element');
  return root;
}
export const descendants = (node, name) => node.children.flatMap(child => [
  ...(child.name === name ? [child] : []), ...descendants(child, name)]);
export const first = (node, name) => descendants(node, name)[0];
export const value = node => node ? node.parts.map(p => typeof p === 'string' ? p : value(p)).join('') : '';
export const attribute = (node, name) => Object.entries(node?.attrs || {}).find(([k]) => k.split(':').at(-1) === name)?.[1];
export function resolvePath(base, target) {
  const parts = target.startsWith('/') ? [] : base.split('/').slice(0, -1);
  for (const part of target.replace(/^\//, '').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {if (!parts.length) throw new Error('Invalid relationship path'); parts.pop();}
    else parts.push(part);
  }
  return parts.join('/');
}
export const relationshipsPath = file => file ? file.replace(/([^/]+)$/, '_rels/$1.rels') : '_rels/.rels';
export function relationships(files, file) {
  const path = relationshipsPath(file), data = files[path];
  if (!data) return [];
  const xml = parseXml(new TextDecoder().decode(data));
  return descendants(xml, 'Relationship').filter(r => r.attrs.TargetMode !== 'External').map(r => ({
    id:r.attrs.Id, type:r.attrs.Type, target:resolvePath(file, r.attrs.Target)}));
}
