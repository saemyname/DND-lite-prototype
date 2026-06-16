// Shared player color palette — pure ES module (NO Three.js import) so both the
// 3D miniature builder and the character-select lobby (which has no importmap)
// can map color keys → hex identically. The server keeps its own COLOR_KEYS
// literal (it only needs the key list, not hex).
export const COLOR_PALETTE = {
  red:    0xd65555,
  green:  0x5dbf6a,
  blue:   0x5b8dd6,
  purple: 0x9a6cd1,
  gold:   0xf5d878,
};

export const COLOR_KEYS = Object.keys(COLOR_PALETTE);

export function colorForKey(key) {
  return COLOR_PALETTE[String(key || '').toLowerCase()] ?? null;
}

export function cssColorForKey(key) {
  const hex = colorForKey(key);
  return hex == null ? null : '#' + hex.toString(16).padStart(6, '0');
}
