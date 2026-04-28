/**
 * Sutura App Icon Generator
 *
 * Uses pre-rendered icon and generates all required sizes.
 */

const sharp = require('sharp')
const path = require('path')
const fs = require('fs')

const SIZES = [16, 32, 48, 64, 128, 256, 512]
const OUTPUT_DIR = path.resolve(__dirname, '../resources')
const BUILD_DIR = path.resolve(__dirname, '../build')
const SOURCE_ICON = path.join(OUTPUT_DIR, 'icon-source.png')

async function generateIcons() {
  if (!fs.existsSync(SOURCE_ICON)) {
    console.error('❌ Error: icon-source.png not found!')
    console.error(`📁 Please save your icon at: ${SOURCE_ICON}`)
    process.exit(1)
  }

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  if (!fs.existsSync(BUILD_DIR)) fs.mkdirSync(BUILD_DIR, { recursive: true })

  console.log('🎨 Generating Sutura icons...\n')

  for (const size of SIZES) {
    const outputPath = path.join(OUTPUT_DIR, `icon-${size}.png`)
    await sharp(SOURCE_ICON)
      .resize(size, size, {
        fit: 'fill',
        quality: 100
      })
      .png()
      .toFile(outputPath)
    console.log(`✅ icon-${size}.png`)
  }

  // Main 512px icon
  await sharp(SOURCE_ICON)
    .resize(512, 512, { fit: 'fill', quality: 100 })
    .png()
    .toFile(path.join(OUTPUT_DIR, 'icon.png'))
  console.log('✅ icon.png (512px)')

  // Windows ICO
  try {
    console.log('\n🪟 Generating icon.ico...')
    const icoSizes = [16, 32, 48, 64, 128, 256]
    const pngBuffers = icoSizes.map((size) =>
      fs.readFileSync(path.join(OUTPUT_DIR, `icon-${size}.png`))
    )

    const numImages = pngBuffers.length
    const headerSize = 6
    const dirEntrySize = 16
    let dataOffset = headerSize + dirEntrySize * numImages

    const header = Buffer.alloc(headerSize)
    header.writeUInt16LE(0, 0)
    header.writeUInt16LE(1, 2)
    header.writeUInt16LE(numImages, 4)

    const dirEntries = []
    const imageDataParts = []

    for (let i = 0; i < numImages; i++) {
      const size = icoSizes[i]
      const pngData = pngBuffers[i]

      const entry = Buffer.alloc(dirEntrySize)
      entry.writeUInt8(size >= 256 ? 0 : size, 0)
      entry.writeUInt8(size >= 256 ? 0 : size, 1)
      entry.writeUInt8(0, 2)
      entry.writeUInt8(0, 3)
      entry.writeUInt16LE(1, 4)
      entry.writeUInt16LE(32, 6)
      entry.writeUInt32LE(pngData.length, 8)
      entry.writeUInt32LE(dataOffset, 12)

      dirEntries.push(entry)
      imageDataParts.push(pngData)
      dataOffset += pngData.length
    }

    fs.writeFileSync(
      path.join(BUILD_DIR, 'icon.ico'),
      Buffer.concat([header, ...dirEntries, ...imageDataParts])
    )
    console.log('✅ icon.ico')
  } catch (err) {
    console.warn('⚠️  ICO generation failed:', err.message)
  }

  // Copy to build
  fs.copyFileSync(path.join(OUTPUT_DIR, 'icon.png'), path.join(BUILD_DIR, 'icon.png'))
  console.log('✅ Copied to build/icon.png')

  console.log('\n🎉 All icons generated successfully!')
}

generateIcons().catch((err) => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})
