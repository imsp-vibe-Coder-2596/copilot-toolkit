const sharp = require('sharp');
const path = require('path');

// Create a 128x128 dark icon with a stylized "CT" / lightning bolt design
// Background: #1e1e2e (dark), accent: #7c3aed (purple), highlight: #a78bfa

const size = 128;

// Build SVG
const svg = `<svg width="${size}" height="${size}" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1e1e2e"/>
      <stop offset="100%" style="stop-color:#2d1b69"/>
    </linearGradient>
    <linearGradient id="bolt" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#a78bfa"/>
      <stop offset="100%" style="stop-color:#7c3aed"/>
    </linearGradient>
  </defs>
  <!-- Background rounded rect -->
  <rect width="128" height="128" rx="20" ry="20" fill="url(#bg)"/>
  <!-- Lightning bolt -->
  <polygon points="72,10 40,68 62,68 56,118 88,58 66,58" fill="url(#bolt)"/>
  <!-- Small dot accent -->
  <circle cx="96" cy="24" r="7" fill="#a78bfa" opacity="0.7"/>
  <circle cx="32" cy="104" r="5" fill="#7c3aed" opacity="0.5"/>
</svg>`;

sharp(Buffer.from(svg))
  .resize(128, 128)
  .png()
  .toFile(path.join(__dirname, '..', 'assets', 'icon.png'))
  .then(() => console.log('icon.png created successfully'))
  .catch(err => { console.error('Error:', err); process.exit(1); });
