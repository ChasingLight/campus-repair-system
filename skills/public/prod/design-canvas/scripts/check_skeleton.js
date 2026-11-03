#!/usr/bin/env node
/**
 * check_skeleton.js — 骨架文件质量检查脚本
 *
 * 检查主 Agent 生成的 _skeleton.html 骨架文件，确保 HTML 结构、
 * @theme token 完整性、图标规范、表单样式等符合规范。
 *
 * 用法：
 *   node check_skeleton.js .cozeproj/prototype/web/_skeleton.html
 *   node check_skeleton.js .cozeproj/prototype/mobile/_skeleton.html
 *
 * 退出码:
 *   0 = 通过（无错误）
 *   1 = 有错误（必须修复）
 */

import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve, basename, dirname, join } from "path";
import {
  extractInlineScripts,
  checkJSSyntax,
  extractThemeBlock,
  hasToken,
  checkTagBalance,
} from "./html_utils.js";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LUCIDE_ICONS = (() => {
  try {
    return new Set(JSON.parse(readFileSync(join(__dirname, "lucide-icons.json"), "utf-8")));
  } catch { return new Set(); }
})();

// ─── 参数解析 ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error("用法: node check_skeleton.js <_skeleton.html路径>");
  process.exit(1);
}

const filePath = resolve(args[0]);
const platform = filePath.includes("mobile") ? "mobile" : "web";

// ─── 错误收集 ──────────────────────────────────────────────────────────────

const allErrors = [];
const allWarnings = [];

function error(code, message, hint = "") {
  allErrors.push({ code, message, hint });
}
function warn(code, message, hint = "") {
  allWarnings.push({ code, message, hint });
}

// ─── 工具函数 ──────────────────────────────────────────────────────────────

/** 检测 emoji 图标用法 */
const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
const ICON_CONTAINER_RE = /<(button|a|span|i|em|label|li|td|th|div|header|nav|footer)[^>]*>([\s\S]{0,200}?)<\/\1>/gi;

function detectEmojiIcons(html) {
  const found = [];
  let m;
  const re = new RegExp(ICON_CONTAINER_RE.source, "gi");
  while ((m = re.exec(html)) !== null) {
    const inner = m[2].replace(/<[^>]+>/g, "").trim();
    if (inner.length <= 6 && EMOJI_REGEX.test(inner)) {
      found.push({ tag: m[1], content: inner.slice(0, 20) });
    }
  }
  return found;
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

// ─── 检查逻辑 ──────────────────────────────────────────────────────────────

function checkSkeleton() {
  const label = basename(filePath);

  if (!existsSync(filePath)) {
    error("S001", `骨架文件不存在：${filePath}`, "主 Agent 需先生成骨架文件");
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
      warn("S035", `${label}: 已自动将 Google Fonts URL 替换为内部 CDN 地址`,
        "字体只能使用 https://lf-code-agent.coze.cn/obj/x-ai-cn/fonts/google/google-all-fonts.css");
      return checkSkeleton(); // 用修正后的内容重新检查
    }
  }

  if (html.trim().length < 200) {
    error("S010", `${label}: 骨架内容过少（${html.trim().length} 字节）`,
      "骨架应包含完整的 <head> + 导航组件");
  }

  // ── 基础 HTML 结构 ────────────────────────────────────────────────────

  if (!html.includes("<!DOCTYPE") && !html.includes("<!doctype"))
    error("S020", `${label}: 缺少 <!DOCTYPE html> 声明`);
  if (!/<html[^>]*>/.test(html))
    error("S021", `${label}: 缺少 <html> 标签`);
  if (!/<head[^>]*>/.test(html))
    error("S022", `${label}: 缺少 <head> 标签`);
  if (!/<body[^>]*>/.test(html))
    error("S023", `${label}: 缺少 <body> 标签`);

  // ── 语义化结构 ────────────────────────────────────────────────────────

  const hasStructure = ["header", "nav", "main", "section", "article", "aside", "footer"]
    .some(t => new RegExp(`<${t}[\\s>]`).test(html));
  if (!hasStructure)
    error("S025", `${label}: 缺少语义化结构标签（header/nav/main/section 等）`,
      "骨架需要有完整的布局骨架（导航 + main 区域）");

  // ── <main> 唯一性 + 注释标记检查 ──────────────────────────────────────

  {
    // 剥离 HTML 注释再检查，避免注释里提到的 <main> 被误命中
    const htmlNoComments = html.replace(/<!--[\s\S]*?-->/g, "");
    const mainOpenCount = (htmlNoComments.match(/<main[\s>]/gi) || []).length;
    const mainCloseCount = (htmlNoComments.match(/<\/main\s*>/gi) || []).length;
    if (mainOpenCount === 0)
      error("S027", `${label}: 缺少 <main> 标签`,
        "骨架必须包含 <main> 标签，业务内容将由子 Agent 填充到 <main> 中");
    else if (mainOpenCount > 1)
      error("S027", `${label}: 包含 ${mainOpenCount} 个 <main> 标签（只允许 1 个）`);
    if (mainOpenCount === 1 && mainCloseCount === 0)
      error("S027", `${label}: <main> 标签未闭合（缺少 </main>）`);

    const hasStartMarker = /<!--\s*@main-content:start\s*-->/.test(html);
    const hasEndMarker = /<!--\s*@main-content:end\s*-->/.test(html);
    if (mainOpenCount >= 1 && !hasStartMarker)
      error("S028", `${label}: 缺少 <!-- @main-content:start --> 注释标记`,
        "子 Agent 依赖此标记定位填充区域");
    if (mainCloseCount >= 1 && !hasEndMarker)
      error("S028", `${label}: 缺少 <!-- @main-content:end --> 注释标记`,
        "子 Agent 依赖此标记定位填充区域");
  }

  // ── 转义闭合标签检查（<\/tag>）────────────────────────────────────────

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
      error("S026", `${label}: HTML 中存在 ${escCount} 处转义闭合标签（如 ${samples.join("、")}）`,
        "将 <\\/tag> 全部替换为 </tag>");
  }

  // ── 关键标签开/闭平衡检查 ──────────────────────────────────────────────

  checkTagBalance(html, label, (code, message, hint) => error(code, message, hint));

  // ── Tailwind CSS v4 CDN ──────────────────────────────────────────────

  if (!html.includes("@tailwindcss/browser") && !html.includes("tailwindcss-browser"))
    error("S030", `${label}: 未引入 Tailwind CSS v4 CDN`,
      '在 <head> 中添加: <script src="https://lf-code-agent.coze.cn/obj/x-ai-cn/cdn/tailwindcss/tailwindcss-browser-4.2.4.min.js"></script>');

  // ── @theme token 检查 ────────────────────────────────────────────────

  if (!html.includes("@theme")) {
    error("S040", `${label}: 未包含 @theme`,
      '必须在 <style type="text/tailwindcss"> 中内嵌 @theme { --color-primary: ...; ... }');
    return;
  }

  const themePos = html.indexOf("@theme");
  const cdnPos = Math.max(html.indexOf("@tailwindcss/browser"), html.indexOf("tailwindcss-browser"));
  if (cdnPos !== -1 && themePos !== -1 && themePos < cdnPos)
    error("S041", `${label}: @theme 定义放在了 Tailwind CDN <script> 之前`,
      "必须先加载 CDN，再定义 @theme");

  const themeStr = extractThemeBlock(html);
  for (const token of REQUIRED_TOKENS) {
    if (!themeStr || !hasToken(themeStr, token))
      error("S042", `${label}: @theme 缺少必需 token "--color-${token}"`,
        `在 @theme 中添加 --color-${token}: #XXXXXX;`);
  }
  if (themeStr && themeStr.includes("var(--"))
    warn("S043", `${label}: @theme 中使用了 var() 引用`,
      "@theme 中的值应直接写具体值（如 hex 色值），不要嵌套 var() 引用");

  // ── Surface 色阶重复检测 ──────────────────────────────────────────────

  if (themeStr) {
    const surfacePairs = [
      ["surface", "surface-container"],
      ["surface-container", "surface-container-high"],
      ["background", "surface-container"],
    ];
    const extractVal = (key) => {
      const re = new RegExp(`--color-${key}\\s*:\\s*([^;]+);`);
      const m = themeStr.match(re);
      return m ? m[1].trim().toLowerCase() : null;
    };
    const hexToLightness = (hex) => {
      const h = hex.replace("#", "");
      if (h.length !== 3 && h.length !== 6) return null;
      const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
      const r = parseInt(full.slice(0, 2), 16) / 255;
      const g = parseInt(full.slice(2, 4), 16) / 255;
      const b = parseInt(full.slice(4, 6), 16) / 255;
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    for (const [a, b] of surfacePairs) {
      const va = extractVal(a);
      const vb = extractVal(b);
      if (!va || !vb) continue;
      if (va === vb) {
        error("S043b", `${label}: --color-${a} 与 --color-${b} 色值完全相同（${va}）`,
          "相邻 surface 层级色值不能相同，必须拉开可感知的差异");
      } else if (va.startsWith("#") && vb.startsWith("#")) {
        const la = hexToLightness(va);
        const lb = hexToLightness(vb);
        if (la !== null && lb !== null) {
          const diff = Math.abs(la - lb) * 100;
          if (diff < 1) {
            warn("S043b", `${label}: --color-${a}（${va}）与 --color-${b}（${vb}）色差极小（约 ${diff.toFixed(1)}%）`,
              "相邻 surface 层级之间应有肉眼可感知的差异");
          }
        }
      }
    }
  }

  // ── background ≈ surface 时 shadow-card 必须足够强 ─────────────────────

  if (themeStr) {
    const extractVal = (key) => {
      const re = new RegExp(`--color-${key}\\s*:\\s*([^;]+);`);
      const m = themeStr.match(re);
      return m ? m[1].trim().toLowerCase() : null;
    };
    const hexToL = (hex) => {
      const h = hex.replace("#", "");
      if (h.length !== 3 && h.length !== 6) return null;
      const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
      const r = parseInt(full.slice(0, 2), 16) / 255;
      const g = parseInt(full.slice(2, 4), 16) / 255;
      const b = parseInt(full.slice(4, 6), 16) / 255;
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const bgVal = extractVal("background");
    const sfVal = extractVal("surface");
    if (bgVal && sfVal && bgVal.startsWith("#") && sfVal.startsWith("#")) {
      const bgL = hexToL(bgVal);
      const sfL = hexToL(sfVal);
      if (bgL !== null && sfL !== null && Math.abs(bgL - sfL) * 100 < 2) {
        const shadowRe = /--shadow-card\s*:\s*([^;]+);/;
        const sm = themeStr.match(shadowRe);
        if (sm) {
          const opacityRe = /rgba?\([^)]*,\s*([\d.]+)\s*\)/;
          const om = sm[1].match(opacityRe);
          if (om) {
            const opacity = parseFloat(om[1]);
            if (opacity < 0.08) {
              warn("S043c", `${label}: background（${bgVal}）≈ surface（${sfVal}），但 shadow-card opacity 仅 ${opacity}（建议 0.08 ~ 0.15）`,
                "当 background 和 surface 色差极小时，shadow-card 是区分卡片的唯一手段");
            } else if (opacity > 0.15) {
              warn("S043c", `${label}: background（${bgVal}）≈ surface（${sfVal}），但 shadow-card opacity 过大（${opacity}，建议 0.08 ~ 0.15）`,
                "shadow-card opacity 过大会破坏极简风格");
            }
          }
        }
      }
    }
  }

  if (html.includes('href="global.css"') || html.includes("href='global.css'"))
    error("S044", `${label}: 引用了 global.css（已废弃）`,
      '移除 <link href="global.css">，样式全部通过 @theme + utility class 实现');

  // ── JS 语法检查 ──────────────────────────────────────────────────────

  const inlineScripts = extractInlineScripts(html);
  for (const { content, closed } of inlineScripts) {
    if (!closed) {
      error("S045", `${label}: <script> 标签未闭合（缺少 </script>）`);
      continue;
    }
    const jsErr = checkJSSyntax(content);
    if (jsErr)
      error("S047", `${label}: <script> JS 语法错误：${jsErr}`,
        "检查脚本的括号、引号、逗号是否匹配");
  }

  // ── SVG 属性未加引号检查 ──────────────────────────────────────────────

  const svgUnquotedAttrs = [
    { re: /\bviewBox=(?!["'])(\S+\s+\S)/g, name: "viewBox" },
    { re: /\bd=(?!["'])[A-Za-z][\d\s.,\-A-Za-z]/g, name: "d (path data)" },
    { re: /\bstroke-width=(?!["'])\S+\s/g, name: "stroke-width" },
  ];
  for (const { re, name } of svgUnquotedAttrs) {
    if (re.test(html)) {
      error("S048", `${label}: SVG 属性 ${name} 的值未加引号`,
        `含空格或特殊字符的 SVG 属性值必须用双引号包裹`);
    }
  }

  // ── 图标检查 ──────────────────────────────────────────────────────────

  const emojiIcons = detectEmojiIcons(html);
  if (emojiIcons.length > 0)
    error("S050", `${label}: 使用了 emoji 作为图标（${emojiIcons.map(e => `<${e.tag}>${e.content}`).join(", ")}）`,
      "系统图标必须使用 Lucide Icons：<i data-lucide=\"xxx\"></i>");

  const NON_LUCIDE_LIBS = [
    { pattern: /font-awesome/i, name: "FontAwesome" },
    { pattern: /material.*symbol/i, name: "Material Symbols" },
    { pattern: /material.*icon/i, name: "Material Icons" },
    { pattern: /bootstrap-icon/i, name: "Bootstrap Icons" },
    { pattern: /remixicon/i, name: "Remix Icon" },
    { pattern: /code\.iconify\.design/i, name: "Iconify" },
  ];
  for (const { pattern, name } of NON_LUCIDE_LIBS) {
    if (pattern.test(html))
      error("S052", `${label}: 引入了非 Lucide 图标库：${name}`,
        "统一使用 Lucide Icons");
  }

  const NON_LUCIDE_USAGE = [
    { pattern: /class=["'][^"']*\b(?:fa-solid|fa-regular|fa-brands|fas|far|fab)\s+fa-/g, name: "FontAwesome" },
    { pattern: /class=["'][^"']*\bmaterial-icons\b/g, name: "Material Icons" },
    { pattern: /class=["'][^"']*\bmaterial-symbols/g, name: "Material Symbols" },
    { pattern: /class=["'][^"']*\bbi\s+bi-/g, name: "Bootstrap Icons" },
    { pattern: /class=["'][^"']*\bri-[a-z]/g, name: "Remix Icon" },
    { pattern: /<iconify-icon[\s>]/g, name: "Iconify web component" },
  ];
  for (const { pattern, name } of NON_LUCIDE_USAGE) {
    const matches = html.match(pattern);
    if (matches)
      error("S053", `${label}: 检测到非 Lucide 图标用法：${name}（${matches.length} 处）`,
        "统一使用 <i data-lucide=\"xxx\"></i>");
  }

  const lucideRe = /data-lucide=["']([^"']+)["']/gi;
  let iconMatch;
  while ((iconMatch = lucideRe.exec(html)) !== null) {
    const iconName = iconMatch[1];
    if (LUCIDE_ICONS.size > 0 && !LUCIDE_ICONS.has(iconName))
      error("S055", `${label}: Lucide 图标 "${iconName}" 不存在`,
        "请确保使用存在的图标名，搜索 https://lucide.dev/icons");
  }

  // ── 表单元素缺少 border 声明检查 ──────────────────────────────────────

  const formElRe = /<(input|textarea|select)\b([^>]*)>/gi;
  let formMatch;
  while ((formMatch = formElRe.exec(html)) !== null) {
    const tag = formMatch[1];
    const attrs = formMatch[2];
    const typeMatch = attrs.match(/type=["'](\w+)["']/);
    const inputType = typeMatch ? typeMatch[1] : "text";
    if (tag === "input" && /^(hidden|checkbox|radio|file|submit|reset|button|image)$/.test(inputType)) continue;
    const classMatch = attrs.match(/class=["']([^"']+)["']/);
    if (!classMatch) {
      warn("S056", `${label}: <${tag}> 缺少 class 属性，未声明 border`,
        "表单元素必须显式声明 border-none 并使用 Tonal Fill");
      continue;
    }
    const cls = classMatch[1];
    if (!/\bborder[-\s]/.test(cls) && !/\bborder\b/.test(cls)) {
      warn("S056", `${label}: <${tag}> 的 class 中缺少 border 声明`,
        "表单元素必须显式声明 border-none bg-surface-container");
    }
  }

  // ── 未弱化的实线 border 检测 ──────────────────────────────────────────

  const solidBorderRe = /class=["']([^"']*\bborder-[btrl]\b[^"']*)["']/gi;
  let borderMatch;
  while ((borderMatch = solidBorderRe.exec(html)) !== null) {
    const cls = borderMatch[1];
    if (/\bborder-none\b/.test(cls)) continue;
    const opacityMatch = cls.match(/border-[a-z-]+\/(\d+)/);
    if (opacityMatch && parseInt(opacityMatch[1]) <= 30) continue;
    warn("S057", `${label}: 检测到未弱化的实线 border`,
      "边框必须通过透明度弱化为 Ghost Borders（如 border-outline-variant/20）");
  }

  // ── <main> max-w 过小检测 ────────────────────────────────────────────

  if (platform === "web") {
    const mainTagRe = /<main\b[^>]*class=["']([^"']*)["'][^>]*>/gi;
    const tooNarrowMaxW = /\bmax-w-(sm|md|lg|xl|2xl|3xl)\b/;
    let mainTagMatch;
    while ((mainTagMatch = mainTagRe.exec(html)) !== null) {
      const mainCls = mainTagMatch[1];
      const narrowMatch = mainCls.match(tooNarrowMaxW);
      if (narrowMatch) {
        error("S058", `${label}: <main> 使用了过小的 max-w-${narrowMatch[1]}`,
          "主内容区 max-w 下限为 max-w-4xl；有侧边栏时用 flex-1");
      }
    }
  }

  // ── Lucide createIcons 调用检查 ──────────────────────────────────────

  if (!html.includes("lucide.createIcons"))
    warn("S060", `${label}: 未调用 lucide.createIcons()`,
      "在 </body> 前添加 <script>lucide.createIcons();</script>");
}

// ─── 执行检查 ──────────────────────────────────────────────────────────────

checkSkeleton();

// ─── 输出报告 ──────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(60)}`);
console.log(`  骨架检查报告  [${platform}]`);
console.log(`  文件: ${filePath}`);
console.log(`${"─".repeat(60)}\n`);

if (allErrors.length === 0 && allWarnings.length === 0) {
  console.log("  ✓ 通过，无问题\n");
} else {
  if (allErrors.length > 0) {
    console.log(`  错误 ${allErrors.length} 个（必须修复）\n`);
    for (const e of allErrors) {
      console.log(`  ❌ [${e.code}] ${e.message}`);
      if (e.hint) console.log(`        -> ${e.hint}`);
      console.log();
    }
  }
  if (allWarnings.length > 0) {
    console.log(`  警告 ${allWarnings.length} 个（建议修复）\n`);
    for (const w of allWarnings) {
      console.log(`  ⚠️  [${w.code}] ${w.message}`);
      if (w.hint) console.log(`        -> ${w.hint}`);
      console.log();
    }
  }
}

console.log(`${"─".repeat(60)}`);
console.log(`  错误: ${allErrors.length}  警告: ${allWarnings.length}`);
console.log(`${"─".repeat(60)}\n`);

process.exit(allErrors.length > 0 ? 1 : 0);
