#!/usr/bin/env node
/**
 * gen_canvas.js — 管理 .canvas.json 配置文件
 *
 * 支持三种操作：新建、增加页面、删除页面。
 * prototype_dir 自动从 canvas_path 的目录推导（它们同级）。
 *
 * 用法：
 *   # 新建（覆盖已有文件）
 *   node gen_canvas.js create <canvas_path> <pages>
 *
 *   # 增加页面（追加到已有文件，自动去重）
 *   node gen_canvas.js add <canvas_path> <pages>
 *
 *   # 删除页面（从已有文件中移除）
 *   node gen_canvas.js remove <canvas_path> <pages>
 *
 * 参数：
 *   canvas_path — .canvas.json 文件路径，如 .cozeproj/prototype/web/.canvas.json
 *   pages       — 页面列表
 *                 create/add: name:标题,name:标题,...
 *                 remove:     name,name,...（只需页面名，无需标题）
 *
 * 示例：
 *   node gen_canvas.js create .cozeproj/prototype/web/.canvas.json "home:首页,audit-detail:审核详情"
 *   node gen_canvas.js add .cozeproj/prototype/web/.canvas.json "statistics:统计报表,settings:系统设置"
 *   node gen_canvas.js remove .cozeproj/prototype/web/.canvas.json "statistics,settings"
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const action = args[0];

if (!action || !['create', 'add', 'remove'].includes(action)) {
  printUsage();
  process.exit(1);
}

function printUsage() {
  console.error('用法:');
  console.error('  node gen_canvas.js create <canvas_path> <pages>');
  console.error('  node gen_canvas.js add    <canvas_path> <pages>');
  console.error('  node gen_canvas.js remove <canvas_path> <pages>');
  console.error('');
  console.error('pages 格式:');
  console.error('  create/add: home:首页,audit-detail:审核详情');
  console.error('  remove:     home,audit-detail');
}

// 标准化 name：去掉 .html 后缀
function normalizeName(name) {
  return name.trim().replace(/\.html$/, '');
}

// 标准化 canvas_path：去掉 /workspace/projects/ 前缀，确保使用相对路径
function normalizeCanvasPath(canvasPath) {
  if (canvasPath.startsWith('/workspace/projects/')) {
    return canvasPath.slice('/workspace/projects/'.length);
  }
  return canvasPath;
}

// 解析 name:title 格式的页面列表
function parsePages(pagesStr) {
  const seen = new Set();
  return pagesStr.split(',').reduce((acc, item) => {
    const sep = item.indexOf(':');
    if (sep === -1) {
      console.error(`❌ 页面条目格式错误（缺少 ":"）: "${item}"，正确格式: name:标题`);
      process.exit(1);
    }
    const name = normalizeName(item.slice(0, sep));
    const title = item.slice(sep + 1).trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      acc.push({ name, title });
    }
    return acc;
  }, []);
}

// 从 canvas_path 推断 prototype_dir 和平台
function inferFromCanvasPath(canvasPath) {
  const prototypeDir = path.dirname(canvasPath);
  const platform = path.basename(prototypeDir);
  if (platform !== 'web' && platform !== 'mobile') {
    console.error(`❌ 无法从 canvas_path "${canvasPath}" 推断平台，倒数第二级目录应为 web 或 mobile`);
    process.exit(1);
  }
  return { prototypeDir, platform, size: platform === 'mobile' ? 'mobile' : 'web' };
}

// 构建单个 element
function buildElement(page, prototypeDir, size) {
  return {
    type: 'html',
    options: {
      path: path.join(prototypeDir, `${page.name}.html`).replace(/\\/g, '/')
    },
    title: page.title,
    size: size
  };
}

// 读取已有的 canvas.json
function readCanvas(canvasPath) {
  if (!fs.existsSync(canvasPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(canvasPath, 'utf-8'));
  } catch (e) {
    console.error(`❌ 读取 ${canvasPath} 失败:`, e.message);
    process.exit(1);
  }
}

// 写入 canvas.json
function writeCanvas(canvasPath, canvas) {
  const outDir = path.dirname(canvasPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  fs.writeFileSync(canvasPath, JSON.stringify(canvas, null, 2), 'utf-8');
}

// 从 element 的 path 中提取 name（不含 .html）
function getNameFromElement(el) {
  const p = (el.options && el.options.path) || '';
  return path.basename(p, '.html');
}

// === create ===
if (action === 'create') {
  if (args.length < 3) {
    console.error('❌ create 需要参数: <canvas_path> <pages>');
    printUsage();
    process.exit(1);
  }
  const [, rawCanvasPath, pagesStr] = args;
  const canvasPath = normalizeCanvasPath(rawCanvasPath);
  const pages = parsePages(pagesStr);
  if (pages.length === 0) {
    console.error('❌ 页面列表不能为空');
    process.exit(1);
  }
  const { prototypeDir, size } = inferFromCanvasPath(canvasPath);
  const elements = pages.map(p => buildElement(p, prototypeDir, size));
  writeCanvas(canvasPath, { elements });
  console.log(`✅ 已创建 ${canvasPath}，包含 ${elements.length} 个页面`);
}

// === add ===
if (action === 'add') {
  if (args.length < 3) {
    console.error('❌ add 需要参数: <canvas_path> <pages>');
    printUsage();
    process.exit(1);
  }
  const [, rawCanvasPath, pagesStr] = args;
  const canvasPath = normalizeCanvasPath(rawCanvasPath);
  const newPages = parsePages(pagesStr);
  if (newPages.length === 0) {
    console.error('❌ 页面列表不能为空');
    process.exit(1);
  }
  const { prototypeDir, size } = inferFromCanvasPath(canvasPath);
  const canvas = readCanvas(canvasPath) || { elements: [] };

  const existingNames = new Set(canvas.elements.map(getNameFromElement));

  let addedCount = 0;
  for (const page of newPages) {
    if (!existingNames.has(page.name)) {
      canvas.elements.push(buildElement(page, prototypeDir, size));
      existingNames.add(page.name);
      addedCount++;
    }
  }

  writeCanvas(canvasPath, canvas);
  console.log(`✅ 已更新 ${canvasPath}，新增 ${addedCount} 个页面，当前共 ${canvas.elements.length} 个页面`);
}

// === remove ===
if (action === 'remove') {
  if (args.length < 3) {
    console.error('❌ remove 需要参数: <canvas_path> <pages>');
    printUsage();
    process.exit(1);
  }
  const [, rawCanvasPath, pagesStr] = args;
  const canvasPath = normalizeCanvasPath(rawCanvasPath);
  const removeNames = new Set(pagesStr.split(',').map(normalizeName).filter(Boolean));
  if (removeNames.size === 0) {
    console.error('❌ 页面列表不能为空');
    process.exit(1);
  }

  const canvas = readCanvas(canvasPath);
  if (!canvas) {
    console.error(`❌ 文件不存在: ${canvasPath}`);
    process.exit(1);
  }

  const before = canvas.elements.length;
  canvas.elements = canvas.elements.filter(el => !removeNames.has(getNameFromElement(el)));
  const removed = before - canvas.elements.length;

  writeCanvas(canvasPath, canvas);
  console.log(`✅ 已更新 ${canvasPath}，删除 ${removed} 个页面，当前共 ${canvas.elements.length} 个页面`);
}
