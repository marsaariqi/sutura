try {
  const mod = require('tree-sitter-vue')
  console.log('Module keys:', Object.keys(mod))
  console.log('Module type:', typeof mod)
  // If it's a function (the grammar itself), it won't have many keys
  if (typeof mod === 'function') {
    console.log('Module is a function (likely the grammar)')
  }
} catch (e) {
  console.error('Error loading tree-sitter-vue:', e)
}
