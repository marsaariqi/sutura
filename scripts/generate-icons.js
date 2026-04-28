/**
 * Sutura App Icon Generator
 *
 * Minimalist Swiss S design with indigo needle & thread motif.
 * Outputs all required Electron sizes as PNG, plus .ico for Windows.
 */

const sharp = require('sharp')
const path = require('path')
const fs = require('fs')

const SIZES = [16, 32, 48, 64, 128, 256, 512]
const OUTPUT_DIR = path.resolve(__dirname, '../resources')
const BUILD_DIR = path.resolve(__dirname, '../build')

function generateSvg(size) {
  const s = size
  const cx = s / 2
  const cy = s / 2
  const r = s * 0.44

  // Swiss-style minimalist S-curve that doubles as a needle path
  // The S is formed by two opposing arcs
  const sTop = cy - r * 0.65
  const sBot = cy + r * 0.65
  const sMid = cy

  const sLeft = cx - r * 0.45
  const sRight = cx + r * 0.45

  const strokeW = Math.max(s * 0.06, 2)
  const needleTip = strokeW * 0.4

  // Indigo color palette
  const indigo = '#6366f1'
  const indigoLight = '#818cf8'
  const indigoDark = '#4f46e5'

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f0f23"/>
      <stop offset="100%" stop-color="#1a1a2e"/>
    </linearGradient>
    <linearGradient id="needleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#e2e8f0"/>
      <stop offset="60%" stop-color="#f8fafc"/>
      <stop offset="100%" stop-color="#cbd5e1"/>
    </linearGradient>
    <linearGradient id="threadGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${indigo}"/>
      <stop offset="100%" stop-color="${indigoLight}"/>
    </linearGradient>
  </defs>

  <!-- Background rounded square -->
  <rect x="${s * 0.04}" y="${s * 0.04}" width="${s * 0.92}" height="${s * 0.92}" rx="${s * 0.18}" fill="url(#bgGrad)"/>
  <rect x="${s * 0.04}" y="${s * 0.04}" width="${s * 0.92}" height="${s * 0.92}" rx="${s * 0.18}" fill="none" stroke="${indigo}" stroke-width="${strokeW * 0.25}" opacity="0.3"/>

  <!-- Thread trail (behind the S-needle) — loose flowing end -->
  <path d="M ${sRight - r * 0.1},${sBot + r * 0.15} C ${cx + r * 0.1},${sBot + r * 0.3} ${cx - r * 0.3},${sBot + r * 0.05} ${cx - r * 0.15},${sBot + r * 0.2}"
        fill="none" stroke="url(#threadGrad)" stroke-width="${strokeW * 0.55}" stroke-linecap="round" opacity="0.7"/>

  <!-- The S-shaped needle body -->
  <path d="M ${sLeft + r * 0.1},${sTop} C ${sRight + r * 0.15},${sTop} ${sRight + r * 0.15},${sMid} ${cx},${sMid} C ${sLeft - r * 0.15},${sMid} ${sLeft - r * 0.15},${sBot} ${sRight - r * 0.1},${sBot}"
        fill="none" stroke="url(#needleGrad)" stroke-width="${strokeW}" stroke-linecap="round"/>

  <!-- Needle point (sharp tip at top-left of S) -->
  <circle cx="${sLeft + r * 0.1}" cy="${sTop}" r="${needleTip}" fill="#f8fafc"/>

  <!-- Needle eye (small opening at bottom-right of S) -->
  <ellipse cx="${sRight - r * 0.1}" cy="${sBot}" rx="${strokeW * 0.35}" ry="${strokeW * 0.7}"
           fill="none" stroke="#e2e8f0" stroke-width="${strokeW * 0.3}"
           transform="rotate(25, ${sRight - r * 0.1}, ${sBot})"/>

  <!-- Thread through the eye -->
  <path d="M ${sRight - r * 0.1},${sBot - strokeW * 0.5} L ${sRight - r * 0.1},${sBot + r * 0.15}"
        fill="none" stroke="url(#threadGrad)" stroke-width="${strokeW * 0.5}" stroke-linecap="round"/>
</svg>`
}

async function generateIcons() {
  // Ensure output directories exist
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  if (!fs.existsSync(BUILD_DIR)) fs.mkdirSync(BUILD_DIR, { recursive: true })

  // Generate PNGs at all required sizes
  const pngPaths = []
  for (const size of SIZES) {
    const svg = generateSvg(512) // Always render from 512 for quality
    const outputPath = path.join(OUTPUT_DIR, `icon-${size}.png`)
    await sharp(Buffer.from(svg)).resize(size, size).png().toFile(outputPath)
    pngPaths.push({ size, path: outputPath })
    console.log(`Generated ${outputPath}`)
  }

  // Generate main icon.png (512px) for Electron
  const mainIconPath = path.join(OUTPUT_DIR, 'icon.png')
  const svg512 = generateSvg(512)
  await sharp(Buffer.from(svg512)).resize(512, 512).png().toFile(mainIconPath)
  console.log(`Generated ${mainIconPath}`)

  // Generate 256px PNG for ICO conversion
  const png256Path = path.join(OUTPUT_DIR, 'icon-256.png')

  // Generate .ico for Windows (manual ICO format from PNGs)
  try {
    const icoSizes = [16, 32, 48, 64, 128, 256]
    const pngBuffers = []
    for (const size of icoSizes) {
      const pngPath = path.join(OUTPUT_DIR, `icon-${size}.png`)
      pngBuffers.push(fs.readFileSync(pngPath))
    }

    // ICO file format: header + directory entries + image data
    const numImages = pngBuffers.length
    const headerSize = 6
    const dirEntrySize = 16
    const dirSize = dirEntrySize * numImages
    let dataOffset = headerSize + dirSize

    // Header: reserved(2) + type(2, 1=ICO) + count(2)
    const header = Buffer.alloc(headerSize)
    header.writeUInt16LE(0, 0) // reserved
    header.writeUInt16LE(1, 2) // type = ICO
    header.writeUInt16LE(numImages, 4)

    const dirEntries = []
    const imageDataParts = []

    for (let i = 0; i < numImages; i++) {
      const size = icoSizes[i]
      const pngData = pngBuffers[i]

      const entry = Buffer.alloc(dirEntrySize)
      entry.writeUInt8(size >= 256 ? 0 : size, 0) // width (0 = 256)
      entry.writeUInt8(size >= 256 ? 0 : size, 1) // height (0 = 256)
      entry.writeUInt8(0, 2) // color palette
      entry.writeUInt8(0, 3) // reserved
      entry.writeUInt16LE(1, 4) // color planes
      entry.writeUInt16LE(32, 6) // bits per pixel
      entry.writeUInt32LE(pngData.length, 8) // image data size
      entry.writeUInt32LE(dataOffset, 12) // offset to image data

      dirEntries.push(entry)
      imageDataParts.push(pngData)
      dataOffset += pngData.length
    }

    const icoBuffer = Buffer.concat([header, ...dirEntries, ...imageDataParts])
    const icoPath = path.join(BUILD_DIR, 'icon.ico')
    fs.writeFileSync(icoPath, icoBuffer)
    console.log(`Generated ${icoPath}`)
  } catch (err) {
    console.warn('Could not generate .ico:', err.message)
  }

  // Copy 512px to build/ for electron-builder
  fs.copyFileSync(mainIconPath, path.join(BUILD_DIR, 'icon.png'))
  console.log(`Copied icon.png to build/`)

  console.log('\nIcon generation complete!')
}

generateIcons().catch(console.error)
