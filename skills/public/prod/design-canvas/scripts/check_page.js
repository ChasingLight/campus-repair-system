#!/usr/bin/env node
/**
 * check_page.js — 原型页面质量检查脚本
 *
 * 检查子 Agent 生成的原型 HTML 页面，确保结构、交互、Mock 数据、
 * 图片规范、平台特定规则等符合规范。
 *
 * 用法：
 *   # 检查单个文件（子 agent 调用，推荐）：
 *   node check_page.js .cozeproj/prototype/web/home.html web
 *
 *   # 检查整个目录（主 agent 汇总校验）：
 *   node check_page.js .cozeproj/prototype/web web
 *   node check_page.js .cozeproj/prototype/mobile mobile
 *
 * 退出码：
 *   0 = 通过（无错误）
 *   1 = 有错误（必须修复）
 */

import { readFileSync, existsSync, readdirSync, writeFileSync } from "fs";
import { resolve, join, basename } from "path";
import {
  extractInlineScripts,
  checkJSSyntax,
  extractThemeBlock,
  hasToken,
  checkTagBalance,
} from "./html_utils.js";

// ─── 参数解析 ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("用法: node check_page.js <原型目录或单个.html文件> <platform: web|mobile>");
  process.exit(1);
}

const targetPath = resolve(args[0]);
const platform = args[1]; // "web" | "mobile"

if (!["web", "mobile"].includes(platform)) {
  console.error(`platform 必须是 web 或 mobile，当前值：${platform}`);
  process.exit(1);
}

const isSingleFile = targetPath.endsWith(".html");
const protoDir = isSingleFile ? resolve(targetPath, "..") : targetPath;

// ─── 错误收集 ──────────────────────────────────────────────────────────────

const allErrors = [];
const allWarnings = [];

function error(code, file, message, hint = "") {
  allErrors.push({ code, file, message, hint });
}
function warn(code, file, message, hint = "") {
  allWarnings.push({ code, file, message, hint });
}

// ─── 必需 token ────────────────────────────────────────────────────────────

const REQUIRED_TOKENS = [
  "primary",
  "background",
  "surface",
  "surface-container-lowest",
  "surface-container",
  "surface-container-high",
  "surface-container-highest",
  "on-surface",
  "on-surface-variant",
  "outline",
  "outline-variant",
];

// ─── 单文件检查 ────────────────────────────────────────────────────────────

function checkHtmlFile(filePath) {
  const label = basename(filePath);

  if (!existsSync(filePath)) {
    error("P001", label, `文件不存在：${filePath}`);
    return;
  }

  const html = readFileSync(filePath, "utf-8");

  // ── 兜底：自动替换 Google Fonts URL 为内部 CDN ──────────────────────────
  {
    const googleFontsRe = /https:\/\/fonts\.googleapis\.com\/css2?\?[^"'\s)>]*/g;
    if (googleFontsRe.test(html)) {
      const fixed = html.replace(/https:\/\/fonts\.googleapis\.com\/css2?\?[^"'\s)>]*/g,
        'https://lf-code-agent.coze.cn/obj/x-ai-cn/fonts/google/google-all-fonts.css');
      writeFileSync(filePath, fixed, "utf-8");
      warn("P035", label, "已自动将 Google Fonts URL 替换为内部 CDN 地址",
        "字体只能使用 https://lf-code-agent.coze.cn/obj/x-ai-cn/fonts/google/google-all-fonts.css");
      return checkHtmlFile(filePath); // 用修正后的内容重新检查
    }
  }

  // ── P1. 基础 HTML 结构 ────────────────────────────────────────────────

  if (!html.includes("<!DOCTYPE") && !html.includes("<!doctype"))
    error("P010", label, "缺少 <!DOCTYPE html> 声明");
  if (!/<html[^>]*>/.test(html))
    error("P011", label, "缺少 <html> 标签");
  if (!/<head[^>]*>/.test(html))
    error("P012", label, "缺少 <head> 标签");
  if (!/<body[^>]*>/.test(html))
    error("P013", label, "缺少 <body> 标签");

  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const bodyText = bodyMatch
    ? bodyMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
    : "";
  if (bodyText.length < 50)
    error("P014", label, "body 内容过少，页面疑似空壳",
      "应包含完整的 UI 内容和 mock 数据");

  // ── P15. 转义闭合标签检查（<\/tag>）────────────────────────────────────

  {
    let escCount = 0;
    const samples = [];
    let idx = 0;
    while ((idx = html.indexOf("<\\/", idx)) !== -1) {
      escCount++;
      if (samples.length < 3) samples.push(html.slice(idx, idx + 12).replace(/\n/g, ""));
      idx++;
    }
    if (escCount > 0)
      error("P015", label, `HTML 中存在 ${escCount} 处转义闭合标签（如 ${samples.join("、")}）`,
        "将 <\\/tag> 全部替换为 </tag>");
  }

  // ── P16. 关键标签开/闭平衡检查 ──────────────────────────────────────────

  checkTagBalance(html, label, (code, message, hint) => error(code, label, message, hint));

  // ── P2. Tailwind CDN + @theme ────────────────────────────────

  if (!html.includes("@tailwindcss/browser") && !html.includes("tailwindcss-browser"))
    error("P020", label, "未引入 Tailwind CSS v4 CDN",
      '在 <head> 添加 <script src="https://lf-code-agent.coze.cn/obj/x-ai-cn/cdn/tailwindcss/tailwindcss-browser-4.2.4.min.js"></script>');

  if (!html.includes("@theme")) {
    error("P021", label, "未包含 @theme",
      "骨架中的 @theme 块不应被删除");
  } else {
    const cdnPos = Math.max(html.indexOf("@tailwindcss/browser"), html.indexOf("tailwindcss-browser"));
    const themePos = html.indexOf("@theme");
    if (cdnPos !== -1 && themePos < cdnPos)
      error("P022", label, "@theme 定义在 Tailwind CDN 之前",
        "先加载 CDN，再定义 @theme");

    const themeStr = extractThemeBlock(html);
    for (const token of REQUIRED_TOKENS) {
      if (!themeStr || !hasToken(themeStr, token))
        error("P023", label, `@theme 缺少必需 token "--color-${token}"`,
          "骨架中的 @theme token 不应被修改或删除");
    }
  }

  // ── P3. 样式规范 ────────────────────────────────────────────────────────

  if (html.includes('href="global.css"') || html.includes("href='global.css'"))
    error("P030", label, "引用了已废弃的 global.css",
      '移除 <link href="global.css">');

  const inlineStyleColorRe = /style="[^"]*(?:background(?:-color)?|color)\s*:\s*#[0-9a-fA-F]{3,8}/g;
  if (inlineStyleColorRe.test(html))
    warn("P031", label, "style 属性中存在硬编码色值（#xxxxxx）",
      "颜色应通过 Tailwind token class 使用");

  if (html.includes("@apply"))
    error("P032", label, "使用了 @apply（CDN 模式下不生效）",
      "改用 utility class 直接组合");

  // ── P4. jQuery ─────────────────────────────────────────────────────────

  if (!html.includes("jquery"))
    error("P040", label, "未引入 jQuery",
      '在 <head> 中添加 <script src="https://lf-code-agent.coze.cn/obj/x-ai-cn/cdn/jquery/jquery-3.7.1.min.js"></script>');

  const nativeDomRe = /\bdocument\.(?:getElementById|querySelector(?:All)?)\s*\(/g;
  if (nativeDomRe.test(html))
    warn("P041", label, "使用了原生 DOM 选择器（getElementById / querySelector）",
      "统一改为 jQuery 选择器 $()");

  // ── P5. 导航函数（仅 mobile）──────────────────────────────────────────

  if (platform === "mobile") {
    const requiredNavFns = ["navPush", "navReplace", "navReset", "navBack"];
    for (const fn of requiredNavFns) {
      if (!html.includes(`function ${fn}`))
        error("P050", label, `缺少导航函数定义 \`function ${fn}(...)\``,
          "Mobile 每个页面必须定义 navPush / navReplace / navReset / navBack 四个函数");
    }
  }

  // ── P6. SVG 属性引号检查 ──────────────────────────────────────────────

  const svgAttrs = [
    { re: /\bviewBox=(?!["'])(\S+\s+\S)/g, name: "viewBox" },
    { re: /\bd=(?!["'])[A-Za-z][\d\s.,\-A-Za-z]/g, name: "d (path data)" },
    { re: /\bstroke-width=(?!["'])\S+\s/g, name: "stroke-width" },
  ];
  for (const { re, name } of svgAttrs) {
    if (re.test(html))
      error("P060", label, `SVG 属性 ${name} 的值未加引号`,
        `属性值必须加双引号`);
  }

  // ── P7. JS 语法检查 ──────────────────────────────────────────────────

  const scripts = extractInlineScripts(html);
  for (const { content, closed } of scripts) {
    if (!closed) {
      error("P070", label, "<script> 标签未闭合（缺少 </script>）");
      continue;
    }
    const jsErr = checkJSSyntax(content);
    if (jsErr)
      error("P072", label, `JS 语法错误：${jsErr}`,
        "检查脚本的括号、引号、逗号是否正确");
  }

  // ── P8. 图片规范 ────────────────────────────────────────────────────────

  const imgTags = [...html.matchAll(/<img\b[^>]*>/gi)].map(m => m[0]);
  for (const tag of imgTags) {
    if (!tag.includes("data-category"))
      warn("P080", label, `图片缺少 data-category 属性：${tag.slice(0, 80)}...`,
        "所有 <img> 必须有 data-category 属性");
    if (!tag.includes("alt=") || /alt=["']\s*["']/.test(tag))
      warn("P081", label, `图片缺少或为空的 alt 属性：${tag.slice(0, 80)}...`,
        "alt 必须是中文描述");
    if (/src=["']data:/i.test(tag))
      error("P082", label, "图片使用了 Base64 内嵌",
        "图片必须使用 http/https URL，禁止 Base64");
  }

  // ── P9. 平台特定检查 ────────────────────────────────────────────────────

  if (platform === "mobile") {
    if (/status.?bar|statusbar|iphone.*frame|phone.*shell/i.test(html))
      warn("P090", label, "疑似包含手机状态条或外壳模拟",
        "Mobile 原型应直接生成全屏内容，不模拟手机外壳");

    const hasTabbar = /id=["']bottom-nav|id=["']tab-bar|id=["']tabbar/.test(html);
    const hasBackBtn = /id=["']btn-back/.test(html);
    if (hasTabbar && hasBackBtn)
      warn("P091", label, "页面同时有 TabBar 和返回按钮",
        "一级页不应有返回按钮；二级页不应有 TabBar");

    if (!html.includes("user-scalable=no") && !html.includes("minimum-scale"))
      warn("P092", label, "viewport 未禁用缩放",
        '建议添加 user-scalable=no 或 minimum-scale=1');
  }

  if (platform === "web") {
    const hasStructure = ["header", "nav", "main", "aside", "section", "article", "footer"]
      .some(t => new RegExp(`<${t}[\\s>]`).test(html));
    if (!hasStructure)
      warn("P093", label, "缺少语义化结构标签",
        "Web 页面需要有完整的布局骨架");

    // <main> max-w 过小检测（max-w-sm ~ max-w-3xl 桌面端会过窄留白）
    // 剥离 HTML 注释，避免注释里提到的 <main> 被误命中
    const htmlNoComments = html.replace(/<!--[\s\S]*?-->/g, "");
    const mainTagRe = /<main\b[^>]*class=["']([^"']*)["'][^>]*>/gi;
    const tooNarrowMaxW = /\bmax-w-(sm|md|lg|xl|2xl|3xl)\b/;
    let mainTagMatch;
    while ((mainTagMatch = mainTagRe.exec(htmlNoComments)) !== null) {
      const mainCls = mainTagMatch[1];
      const narrowMatch = mainCls.match(tooNarrowMaxW);
      if (narrowMatch)
        warn("P094", label, `<main> 使用了过小的 max-w-${narrowMatch[1]}`,
          "无侧边栏布局建议用 max-w-4xl ~ max-w-7xl + mx-auto；有侧边栏时用 flex-1。如为登录页/全屏页等特殊场景可忽略");
    }
  }

  // ── P10. 硬编码登录判断检查 ──────────────────────────────────────────────

  if (/username\s*===\s*["'][^"']+["']|password\s*===\s*["'][^"']+["']/.test(html))
    error("P100", label, "登录页包含硬编码账号或密码判断",
      "登录页禁止预设账密，用户可使用任意账密登录");

  // ── P11. 占位交互检查 ──────────────────────────────────────────────────

  const placeholderRe = /暂不支持|\bTODO\b|\bFIXME\b|\bplaceholder\b.*interaction/ig;
  const placeholderHits = html.match(placeholderRe);
  if (placeholderHits)
    warn("P110", label, `代码中存在占位标记，命中内容：${[...new Set(placeholderHits)].join(" / ")}`,
      "所有交互元素必须有真实实现，不能是占位符；若功能未完成则移除对应元素。如果是误命中（如正常注释或属性名包含关键词）可忽略");

  // ── P12. Lucide createIcons 调用检查 ──────────────────────────────────

  if (!html.includes("lucide.createIcons"))
    error("P120", label, "未调用 lucide.createIcons()",
      "在 </body> 前添加 <script>lucide.createIcons();</script>");
}

// ─── 目录扫描 ──────────────────────────────────────────────────────────────

function run() {
  if (isSingleFile) {
    if (!existsSync(targetPath)) {
      error("P000", basename(targetPath), `文件不存在：${targetPath}`);
      printReport(1);
      return;
    }
    checkHtmlFile(targetPath);
    printReport(1);
  } else {
    if (!existsSync(protoDir)) {
      error("P000", "-", `原型目录不存在：${protoDir}`);
      printReport(0);
      return;
    }

    const htmlFiles = readdirSync(protoDir)
      .filter(f => f.endsWith(".html") && !f.startsWith("_"))
      .sort();

    if (htmlFiles.length === 0) {
      error("P000", "-", `${protoDir} 目录下没有 HTML 页面文件`);
      printReport(0);
      return;
    }

    for (const file of htmlFiles) {
      checkHtmlFile(join(protoDir, file));
    }
    printReport(htmlFiles.length);
  }
}

// ─── 输出报告 ──────────────────────────────────────────────────────────────

function printReport(fileCount) {
  const scopeLabel = isSingleFile ? `文件: ${basename(targetPath)}` : `目录: ${protoDir}`;
  console.log(`\n${"─".repeat(64)}`);
  console.log(`  页面检查报告  [${platform}]`);
  console.log(`  ${scopeLabel}`);
  console.log(`${"─".repeat(64)}\n`);

  if (allErrors.length === 0 && allWarnings.length === 0) {
    console.log("  ✓ 通过，无问题\n");
  } else {
    if (allErrors.length > 0) {
      console.log(`  错误 ${allErrors.length} 个（必须修复）\n`);
      for (const e of allErrors) {
        console.log(`  ❌ [${e.code}] ${e.file}: ${e.message}`);
        if (e.hint) console.log(`        -> ${e.hint}`);
        console.log();
      }
    }
    if (allWarnings.length > 0) {
      console.log(`  警告 ${allWarnings.length} 个（建议修复）\n`);
      for (const w of allWarnings) {
        console.log(`  ⚠️  [${w.code}] ${w.file}: ${w.message}`);
        if (w.hint) console.log(`        -> ${w.hint}`);
        console.log();
      }
    }
  }

  console.log(`${"─".repeat(64)}`);
  console.log(`  错误: ${allErrors.length}  警告: ${allWarnings.length}  文件数: ${fileCount}`);
  console.log(`${"─".repeat(64)}\n`);

  process.exit(allErrors.length > 0 ? 1 : 0);
}

run();
