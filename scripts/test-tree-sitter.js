const Parser = require('tree-sitter')
const SQL = require('@derekstride/tree-sitter-sql')

const parser = new Parser()
parser.setLanguage(SQL)

// Your exact example
const code = `-- 删除无效角色
SELECT '处理人' FROM users;`

const tree = parser.parse(code)
console.log(tree.rootNode.toString())
