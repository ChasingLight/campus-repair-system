#!/usr/bin/env node

/**
 * sync-prototype-theme.js
 *
 * 从原型 HTML 的 @theme 块中提取自定义 token，同步到 Taro 项目的 app.css。
 *
 * 用法：
 *   node theme-migrate.js <原型目录>
 *
 * 示例：
 *   node theme-migrate.js .cozeproj/prototype/web
 *   node theme-migrate.js .cozeproj/prototype/mobile
 *
 * 流程：
 *   1. 扫描 <原型目录>/*.html 中的 @theme { ... } 块
 *   2. 提取所有自定义 CSS 变量（--color-*、--shadow-*、--radius-*、--font-* 等）
 *   3. 将颜色类 token 拆为：:root 变量 + @theme inline 注册
 *   4. 将非颜色类 token（shadow/radius/font 等）直接写入 @theme inline
 *   5. 合并写回 <项目>/src/app.css
 *      - 新变量：插入
 *      - 已有变量但值不同：覆写为原型的值
 *      - 已有变量且值相同：跳过
 */

const fs = require('fs')
const path = require('path')

// ─── 配置 ───────────────────────────────────────────────

// 原型 MD3 变量名 → shadcn/ui 等价变量名的映射
// 脚本遇到左侧名称时：
//   - 不新增独立变量，而是用原型的值覆写右侧等价变量的 :root 值
//   - 不在 @theme inline 中注册新的 --color-xxx（因为已有 --color-yyy 指向等价变量）
//
// 未列出的变量名（包括 --shadow-*、--radius-*、--font-* 等）名称无差异，直接原样迁移
const COLOR_EQUIVALENCES = {
  // 文字色
  'on-primary': 'primary-foreground',
  'on-secondary': 'secondary-foreground',
  'on-destructive': 'destructive-foreground',
  'on-accent': 'accent-foreground',
  'on-muted': 'muted-foreground',
  'on-card': 'card-foreground',
  'on-popover': 'popover-foreground',
  'on-surface': 'foreground',
  'on-surface-variant': 'muted-foreground',
  // 表面/容器色
  'surface': 'card',
  'surface-container': 'muted',
  // 边框
  // outline → border (1:1)
  // outline-variant 不映射，作为独立变量新增（shadcn 没有次级边框的概念）
  'outline': 'border',
  // 功能色
  'error': 'destructive',
}

// ─── 工具函数 ─────────────────────────────────────────────

/**
 * 从 HTML 文件中提取 @theme { ... } 块的内容
 */
function extractThemeBlock(html) {
  const themeRegex = /@theme\s*\{([\s\S]*?)\n\s*\}/
  const match = html.match(themeRegex)
  if (!match) return null
  return match[1]
}

/**
 * 解析 CSS 变量声明块
 * 返回 Map<变量名, 值>
 */
function parseCssVariables(content) {
  const vars = new Map()
  const varRegex = /^\s*(--[\w-]+)\s*:\s*(.+?)\s*;?\s*$/gm
  let match
  while ((match = varRegex.exec(content)) !== null) {
    const name = match[1].trim()
    let value = match[2].trim()
    if (value.endsWith(';')) value = value.slice(0, -1).trim()
    vars.set(name, value)
  }
  return vars
}

/**
 * 将 token 按前缀分类
 */
function classifyTokens(vars) {
  const colors = new Map()
  const shadows = new Map()
  const radii = new Map()
  const fonts = new Map()
  const others = new Map()

  for (const [name, value] of vars) {
    if (name.startsWith('--color-')) {
      colors.set(name, value)
    } else if (name.startsWith('--shadow-')) {
      shadows.set(name, value)
    } else if (name.startsWith('--radius-')) {
      radii.set(name, value)
    } else if (name.startsWith('--font-')) {
      fonts.set(name, value)
    } else {
      others.set(name, value)
    }
  }

  return { colors, shadows, radii, fonts, others }
}

/**
 * 解析 :root 块中已有的变量（排除 --tw-* 内部变量）
 * 返回 Map<变量名, 值>
 */
function parseExistingRootVars(css) {
  const rootRegex = /:root[\s\S]*?\{([\s\S]*?)\}/
  const match = css.match(rootRegex)
  if (!match) return new Map()

  const all = parseCssVariables(match[1])
  const result = new Map()
  for (const [k, v] of all) {
    if (!k.startsWith('--tw-')) {
      result.set(k, v)
    }
  }
  return result
}

/**
 * 解析 @theme inline 块中已有的变量
 * 返回 Map<变量名, 值>
 */
function parseExistingThemeVars(css) {
  const themeRegex = /@theme\s+inline\s*\{([\s\S]*?)\}/
  const match = css.match(themeRegex)
  if (!match) return new Map()
  return parseCssVariables(match[1])
}

/**
 * 替换 CSS 中某个变量的值（在指定的块正则范围内）
 * 返回替换后的 CSS 字符串
 */
function replaceVarValue(css, blockRegex, varName, newValue) {
  const blockMatch = css.match(blockRegex)
  if (!blockMatch) return css

  const blockStart = blockMatch.index
  const blockEnd = blockStart + blockMatch[0].length
  const blockContent = blockMatch[0]

  // 在块内找到变量行并替换值
  const varLineRegex = new RegExp(
    `(^\\s*${escapeRegex(varName)}\\s*:\\s*)(.+?)(\\s*;?\\s*$)`,
    'm'
  )
  const newBlock = blockContent.replace(varLineRegex, `$1${newValue};`)

  return css.slice(0, blockStart) + newBlock + css.slice(blockEnd)
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 在 :root 块的 --tw-shadow 行之前插入新的 CSS 变量
 */
function insertIntoRoot(css, newVars) {
  if (newVars.length === 0) return css

  const lines = newVars.map(([name, value]) => `  ${name}: ${value};`)
  const insertBlock = lines.join('\n') + '\n'

  const twShadowIndex = css.indexOf('  --tw-shadow:')
  if (twShadowIndex !== -1) {
    return css.slice(0, twShadowIndex) + insertBlock + css.slice(twShadowIndex)
  }

  const rootCloseRegex = /((:root[\s\S]*?)\n\})/
  return css.replace(rootCloseRegex, (match) => {
    return match.slice(0, match.length - 1) + insertBlock + '}'
  })
}

/**
 * 在 @theme inline 块的 } 之前插入新的变量
 */
function insertIntoThemeInline(css, newVars) {
  if (newVars.length === 0) return css

  const lines = newVars.map(([name, value]) => `  ${name}: ${value};`)
  const insertBlock = lines.join('\n') + '\n'

  const themeRegex = /(@theme\s+inline\s*\{[\s\S]*?)(\n\})/
  return css.replace(themeRegex, (_, before, close) => {
    return before + '\n' + insertBlock + close
  })
}

/**
 * 归一化 CSS 值用于比较（去除空格差异、末尾分号等）
 */
function normalizeValue(v) {
  return v.replace(/\s+/g, ' ').replace(/;$/, '').trim()
}

// ─── 主逻辑 ───────────────────────────────────────────────

function main() {
  const prototypeDir = process.argv[2]
  if (!prototypeDir) {
    console.error('用法: node theme-migrate.js <原型目录>')
    process.exit(1)
  }

  const projectRoot = path.resolve("/workspace/projects")
  const appCssPath = path.join(projectRoot, 'src/app.css')

  // 1. 检查文件是否存在
  if (!fs.existsSync(prototypeDir)) {
    console.error(`❌ 找不到原型目录: ${prototypeDir}`)
    process.exit(1)
  }
  if (!fs.existsSync(appCssPath)) {
    console.error(`❌ 找不到 app.css: ${appCssPath}`)
    process.exit(1)
  }

  // 2. 扫描所有原型 HTML，提取 @theme 变量（取并集）
  const allFiles = fs.readdirSync(prototypeDir)
  const htmlFiles = allFiles
    .filter(f => f.endsWith('.html') && f !== '_skeleton.html')
    .map(f => path.join(prototypeDir, f))

  if (htmlFiles.length === 0) {
    const skeleton = path.join(prototypeDir, '_skeleton.html')
    if (fs.existsSync(skeleton)) {
      htmlFiles.push(skeleton)
    }
  }

  if (htmlFiles.length === 0) {
    console.error(`❌ 原型目录中没有找到 HTML 文件: ${prototypeDir}`)
    process.exit(1)
  }

  const allPrototypeVars = new Map()
  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, 'utf-8')
    const themeBlock = extractThemeBlock(html)
    if (themeBlock) {
      const vars = parseCssVariables(themeBlock)
      for (const [k, v] of vars) {
        allPrototypeVars.set(k, v)
      }
      console.log(`✅ 从 ${path.basename(file)} 提取了 ${vars.size} 个 token`)
    } else {
      console.log(`⚠️  ${path.basename(file)} 中未找到 @theme 块`)
    }
  }

  if (allPrototypeVars.size === 0) {
    console.log('ℹ️  原型中没有自定义 token，无需同步')
    process.exit(0)
  }

  // 3. 分类
  const { colors, shadows, radii, fonts } = classifyTokens(allPrototypeVars)

  console.log(`\n📊 Token 统计:`)
  console.log(`   颜色: ${colors.size}  阴影: ${shadows.size}  圆角: ${radii.size}  字体: ${fonts.size}`)

  // 4. 读取现有 app.css
  let css = fs.readFileSync(appCssPath, 'utf-8')

  // 4.1 结构补全：检测关键块是否存在，缺失则从基础模版补全
  let structureFixed = false

  // 检测 @custom-variant dark
  if (!css.includes('@custom-variant dark')) {
    const customVariantLine = '\n@custom-variant dark (&:is(.dark *));\n'
    // 优先在 .dark { ... } 块结束后插入
    const darkCloseRegex = /(\.dark\s*\{[\s\S]*?\n\})/
    const darkMatch = css.match(darkCloseRegex)
    if (darkMatch) {
      const insertPos = darkMatch.index + darkMatch[0].length
      css = css.slice(0, insertPos) + customVariantLine + css.slice(insertPos)
    } else {
      // 没有 .dark 块，在 :root 块结束后插入
      const rootCloseRegex = /(:root[\s\S]*?\n\})/
      const rootMatch = css.match(rootCloseRegex)
      if (rootMatch) {
        const insertPos = rootMatch.index + rootMatch[0].length
        css = css.slice(0, insertPos) + customVariantLine + css.slice(insertPos)
      }
    }
    console.log('🔧 补全: @custom-variant dark')
    structureFixed = true
  }

  // 检测 @theme inline { ... }
  if (!css.includes('@theme inline')) {
    const themeInlineBlock = `@theme inline {
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-foreground: var(--foreground);
  --color-background: var(--background);
  --color-selection: var(--selection);
  --color-selection-foreground: var(--selection-foreground);
  --color-code: var(--code);
  --radius-full: 9999px;
}`
    // 在 @custom-variant 行之后插入（如果存在），否则追加到文件末尾
    const customVariantIndex = css.indexOf('@custom-variant dark')
    if (customVariantIndex !== -1) {
      const lineEnd = css.indexOf('\n', customVariantIndex)
      const insertPos = lineEnd !== -1 ? lineEnd + 1 : customVariantIndex + '@custom-variant dark (&:is(.dark *));'.length
      css = css.slice(0, insertPos) + '\n' + themeInlineBlock + '\n' + css.slice(insertPos)
    } else {
      css = css.trimEnd() + '\n\n' + themeInlineBlock + '\n'
    }
    console.log('🔧 补全: @theme inline 块')
    structureFixed = true
  }

  // 检测 border-color 重置块
  if (!css.includes('border-color: var(--border)')) {
    const borderResetBlock = `\npage,
view,
text,
button,
input,
textarea,
label,
scroll-view,
image {
  border-color: var(--border);
}\n`
    css = css.trimEnd() + '\n' + borderResetBlock
    console.log('🔧 补全: border-color 重置块')
    structureFixed = true
  }

  // 检测 ::selection 块
  if (!css.includes('::selection')) {
    const selectionBlock = `\n::selection {
  background-color: var(--selection);
  color: var(--selection-foreground);
}\n`
    css = css.trimEnd() + '\n' + selectionBlock
    console.log('🔧 补全: ::selection 块')
    structureFixed = true
  }

  if (structureFixed) {
    console.log('')
  }

  const existingRootVars = parseExistingRootVars(css)
  const existingThemeVars = parseExistingThemeVars(css)

  const rootBlockRegex = /:root[\s\S]*?\{[\s\S]*?\}/
  const themeBlockRegex = /@theme\s+inline\s*\{[\s\S]*?\}/

  // 统计
  const newRootVars = []
  const newThemeVars = []
  const updatedRootVars = []
  const updatedThemeVars = []
  let skippedCount = 0

  // 5. 处理颜色 token
  for (const [colorVar, protoValue] of colors) {
    const tokenName = colorVar.replace('--color-', '')
    const rootVarName = `--${tokenName}`
    const themeVarName = colorVar

    // 检查等价 token
    const equivalent = COLOR_EQUIVALENCES[tokenName]
    if (equivalent && existingThemeVars.has(`--color-${equivalent}`)) {
      // 等价 token 已存在，用原型值覆写等价变量的 :root 值
      const equivRootVar = `--${equivalent}`
      if (existingRootVars.has(equivRootVar)) {
        const currentValue = existingRootVars.get(equivRootVar)
        if (normalizeValue(currentValue) !== normalizeValue(protoValue)) {
          css = replaceVarValue(css, rootBlockRegex, equivRootVar, protoValue)
          existingRootVars.set(equivRootVar, protoValue)
          updatedRootVars.push([equivRootVar, currentValue, protoValue])
        }
      }

      // 同时注册 MD3 变量名作为别名，指向等价的 shadcn 变量
      // 这样 bg-surface 和 bg-card 都能工作
      if (!existingThemeVars.has(themeVarName)) {
        const aliasValue = `var(${equivRootVar})`
        newThemeVars.push([themeVarName, aliasValue])
        existingThemeVars.set(themeVarName, aliasValue)
        console.log(`   🔗 注册别名 ${themeVarName} → var(${equivRootVar})`)
      } else {
        skippedCount++
      }
      continue
    }

    // :root 变量处理
    if (existingRootVars.has(rootVarName)) {
      // 已存在，检查是否需要覆写
      const currentValue = existingRootVars.get(rootVarName)
      if (normalizeValue(currentValue) !== normalizeValue(protoValue)) {
        css = replaceVarValue(css, rootBlockRegex, rootVarName, protoValue)
        updatedRootVars.push([rootVarName, currentValue, protoValue])
      }
    } else {
      newRootVars.push([rootVarName, protoValue])
    }

    // @theme inline 注册
    const expectedThemeValue = `var(${rootVarName})`
    if (existingThemeVars.has(themeVarName)) {
      // 已注册，检查是否指向正确的 var()
      const currentThemeValue = existingThemeVars.get(themeVarName)
      if (normalizeValue(currentThemeValue) !== normalizeValue(expectedThemeValue)) {
        css = replaceVarValue(css, themeBlockRegex, themeVarName, expectedThemeValue)
        updatedThemeVars.push([themeVarName, currentThemeValue, expectedThemeValue])
      } else {
        skippedCount++
      }
    } else {
      newThemeVars.push([themeVarName, expectedThemeValue])
    }
  }

  // 6. 处理非颜色 token（shadow/radius/font）→ 直接写入 @theme inline
  for (const tokenMap of [shadows, radii, fonts]) {
    for (const [name, protoValue] of tokenMap) {
      if (existingThemeVars.has(name)) {
        const currentValue = existingThemeVars.get(name)
        if (normalizeValue(currentValue) !== normalizeValue(protoValue)) {
          css = replaceVarValue(css, themeBlockRegex, name, protoValue)
          updatedThemeVars.push([name, currentValue, protoValue])
        } else {
          skippedCount++
        }
        continue
      }
      newThemeVars.push([name, protoValue])
    }
  }

  // 7. 插入新变量
  if (newRootVars.length > 0) {
    css = insertIntoRoot(css, newRootVars)
  }
  if (newThemeVars.length > 0) {
    css = insertIntoThemeInline(css, newThemeVars)
  }

  fs.writeFileSync(appCssPath, css, 'utf-8')

  // 8. 输出结果
  console.log(`\n✅ 同步完成:`)
  console.log(`   新增 :root 变量: ${newRootVars.length}`)
  console.log(`   新增 @theme inline 注册: ${newThemeVars.length}`)
  console.log(`   覆写 :root 变量: ${updatedRootVars.length}`)
  console.log(`   覆写 @theme inline 变量: ${updatedThemeVars.length}`)
  console.log(`   跳过（已存在且值相同）: ${skippedCount}`)

  if (newRootVars.length > 0) {
    console.log(`\n   :root 新增:`)
    for (const [name, value] of newRootVars) {
      console.log(`     ${name}: ${value}`)
    }
  }

  if (updatedRootVars.length > 0) {
    console.log(`\n   :root 覆写:`)
    for (const [name, oldVal, newVal] of updatedRootVars) {
      console.log(`     ${name}: ${oldVal} → ${newVal}`)
    }
  }

  if (newThemeVars.length > 0) {
    console.log(`\n   @theme inline 新增:`)
    for (const [name, value] of newThemeVars) {
      console.log(`     ${name}: ${value}`)
    }
  }

  if (updatedThemeVars.length > 0) {
    console.log(`\n   @theme inline 覆写:`)
    for (const [name, oldVal, newVal] of updatedThemeVars) {
      console.log(`     ${name}: ${oldVal} → ${newVal}`)
    }
  }
}

main()
