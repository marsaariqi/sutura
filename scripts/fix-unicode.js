const fs = require('fs')
const path = require('path')

const filePath = path.join(__dirname, '..', 'src', 'renderer', 'src', 'components', 'AboutPage.tsx')
let content = fs.readFileSync(filePath, 'utf8')

// Replace literal \uXXXX sequences with actual Unicode characters
// Match a backslash followed by 'u' and exactly 4 hex digits
content = content.replace(/\\u([0-9a-fA-F]{4})/g, (match, hex) => {
  return String.fromCharCode(parseInt(hex, 16))
})

fs.writeFileSync(filePath, content, 'utf8')
console.log('Done - converted all \\uXXXX to actual Unicode characters')
