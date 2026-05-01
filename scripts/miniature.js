import * as THREE from 'three';

const ROLE_EMOJI = {
  warrior: '⚔️',
  rogue:   '🏹',
  mage:    '🔮',
  cleric:  '✨',
};

export function emojiForRole(role) {
  return ROLE_EMOJI[String(role || '').toLowerCase()] || '👤';
}

// Returns a THREE.Group with a Sprite of the emoji.
// Group origin sits at the GROUND. Sprite is centered at y = height/2.
export function createEmojiMiniature(role, height = 3) {
  const emoji = emojiForRole(role);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.font = '200px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 128, 140);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(height, height, 1);
  sprite.position.y = height / 2;

  const group = new THREE.Group();
  group.add(sprite);
  return group;
}
