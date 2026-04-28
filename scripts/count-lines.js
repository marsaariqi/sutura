const fs = require('fs')
const path = require('path')
const c = fs.readFileSync(path.join(__dirname, '..', 'example.txt'), 'utf8')
const lines = c.split('\n')
lines.forEach((l, i) => {
  if (/[\u4e00-\u9fff]/.test(l) || l.includes('"N"')) {
    console.log(`Line ${i + 1}: ${l.trim().substring(0, 80)}`)
  }
})
