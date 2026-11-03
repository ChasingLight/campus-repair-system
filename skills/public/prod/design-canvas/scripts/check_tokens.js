#!/usr/bin/env node
/**
 * check_tokens.js — 设计变量迁移完整性检查
 *
 * 从原型 HTML 的 @theme 中提取所有自定义 CSS 变量，然后扫描项目 CSS 文件，
 * 检查哪些变量在项目中未定义（遗漏）。
 *
 * 支持多种 CSS 写法（@theme / :root / @layer 等），只要文件中存在 --变量名: 值;
 * 就视为已定义。同时支持 shadcn/ui 的变量名映射。
 *
 * 用法：
 *   node check_tokens.js <原型HTML> <CSS文件1> [CSS文件2] [CSS文件3] ...
 *
 * 示例：
 *   node check_tokens.js .cozeproj/prototype/mobile/home.html src/globals.css
 *   node check_tokens.js .cozeproj/prototype/web/home.html app/globals.css src/styles/theme.css
 *
 * 退出码：
 *   0 = 通过（无遗漏）
 *   1 = 有遗漏（必须修复）
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { extractThemeBlock } from "./html_utils.js";

// ─── 参数解析 ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("用法: node check_tokens.js <原型HTML> <CSS文件1> [CSS文件2] ...");
  console.error("示例: node check_tokens.js .cozeproj/prototype/mobile/home.html src/globals.css");
  process.exit(1);
}

const protoPath = resolve(args[0]);
const cssFiles = args.slice(1).map(f => resolve(f));

// 校验所有 CSS 文件存在
for (const f of cssFiles) {
  if (!existsSync(f)) {
    console.error(`CSS 文件不存在: ${f}`);
    process.exit(1);
  }
}

// ─── shadcn 变量名映射 ─────────────────────────────────────────────────────

const SHADCN_MAP = {
  "--color-on-primary": ["--primary-foreground", "--color-primary-foreground"],
  "--color-on-surface": ["--foreground", "--color-foreground"],
  "--color-on-surface-variant": ["--muted-foreground", "--color-muted-foreground"],
  "--color-surface": ["--card", "--color-card"],
  "--color-surface-container": ["--muted", "--color-muted"],
  "--color-outline": ["--border", "--color-border"],
  "--color-outline-variant": ["--border", "--color-border"],
  "--color-error": ["--destructive", "--color-destructive"],
};

// ─── 从原型提取所有自定义变量 ───────────────────────────────────────────────

function extractProtoTokens(html) {
  const themeStr = extractThemeBlock(html);
  if (!themeStr) return [];

  const tokens = [];
  const re = /--([\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(themeStr)) !== null) {
    tokens.push({ name: `--${m[1]}`, value: m[2].trim() });
  }
  return tokens;
}

// ─── 值归一化（消除写法差异） ────────────────────────────────────────────────

/** 无法静态比对的 CSS 函数 */
const SKIP_FUNCTIONS = /^(var|calc|color-mix|light-dark|env)\(/i;

function normalizeValue(v) {
  let s = v;
  // 去除多余空白，统一为单空格
  s = s.replace(/\s+/g, " ").trim();
  // 去除引号 "Inter" → Inter
  s = s.replace(/["']/g, "");
  // 补前导零 .5 → 0.5（独立数字前）
  s = s.replace(/(^|[\s,(])\.(\d)/g, "$10.$2");
  // 小写化（CSS 值大小写不敏感的部分：颜色关键字、函数名等）
  s = s.toLowerCase();
  // #fff → #ffffff
  s = s.replace(/#([0-9a-f])([0-9a-f])([0-9a-f])(?![0-9a-f])/g, "#$1$1$2$2$3$3");
  return s;
}

// ─── 从 CSS 文件中提取所有已定义的变量 ──────────────────────────────────────

function extractDefinedVars(files) {
  const defined = new Map(); // name → Set<value>（同一变量可能在 light/dark 中各定义一次）
  const varDefRe = /--([\w-]+)\s*:\s*([^;]+);/g;

  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    let m;
    while ((m = varDefRe.exec(content)) !== null) {
      const name = `--${m[1]}`;
      const value = m[2].trim();
      if (!defined.has(name)) defined.set(name, new Set());
      defined.get(name).add(value);
    }
  }
  return defined;
}

// ─── 检查逻辑 ──────────────────────────────────────────────────────────────

function run() {
  // 1. 读取原型
  if (!existsSync(protoPath)) {
    console.error(`原型文件不存在: ${protoPath}`);
    process.exit(1);
  }
  const protoHtml = readFileSync(protoPath, "utf-8");
  const protoTokens = extractProtoTokens(protoHtml);

  if (protoTokens.length === 0) {
    console.error("未能从原型 @theme 中提取到任何变量，请检查原型文件是否包含 @theme 块");
    process.exit(1);
  }

  // 2. 提取项目 CSS 中的变量
  const definedVars = extractDefinedVars(cssFiles);

  // 3. 对比检查
  const missing = [];
  const found = []; // { token, matchedName }

  for (const token of protoTokens) {
    // 直接名称匹配
    if (definedVars.has(token.name)) {
      found.push({ token, matchedName: token.name });
      continue;
    }

    // shadcn 映射匹配
    const mappedNames = SHADCN_MAP[token.name];
    if (mappedNames) {
      const hit = mappedNames.find(n => definedVars.has(n));
      if (hit) {
        found.push({ token, matchedName: hit });
        continue;
      }
    }

    // --color-xxx → --xxx 短名兜底
    if (token.name.startsWith("--color-")) {
      const short = token.name.replace("--color-", "--");
      if (definedVars.has(short)) {
        found.push({ token, matchedName: short });
        continue;
      }
    }

    missing.push(token);
  }

  // 4. 值比对（仅对直接名称匹配的变量）
  const valueMismatch = [];
  for (const { token, matchedName } of found) {
    // 映射/短名匹配的变量语义不同，跳过值比对
    if (matchedName !== token.name) continue;
    const cssValues = definedVars.get(matchedName); // Set<value>
    // 原型值含无法静态解析的函数，跳过
    if (SKIP_FUNCTIONS.test(token.value)) continue;
    // CSS 侧任一值含无法静态解析的函数，跳过
    if ([...cssValues].some(v => SKIP_FUNCTIONS.test(v))) continue;
    // 归一化后比对：只要 CSS 中任一定义的值匹配即可（兼容 light/dark 多次定义）
    const protoNorm = normalizeValue(token.value);
    const matched = [...cssValues].some(v => normalizeValue(v) === protoNorm);
    if (!matched) {
      valueMismatch.push({ name: token.name, protoValue: token.value, cssValues: [...cssValues] });
    }
  }

  // 5. 输出报告
  console.log(`\n${"─".repeat(64)}`);
  console.log("  设计变量迁移检查报告");
  console.log(`  原型: ${protoPath}`);
  console.log(`  CSS:  ${cssFiles.join(", ")}`);
  console.log(`${"─".repeat(64)}\n`);

  console.log(`  原型变量总数: ${protoTokens.length}`);
  console.log(`  已迁移: ${found.length}`);
  console.log(`  遗漏: ${missing.length}`);
  console.log(`  值不一致: ${valueMismatch.length}\n`);

  if (missing.length === 0 && valueMismatch.length === 0) {
    console.log("  ✓ 所有原型变量均已在项目 CSS 中正确定义\n");
  } else {
    if (missing.length > 0) {
      console.log("  ❌ 以下原型变量在项目 CSS 中未找到定义:\n");
      for (const token of missing) {
        const mapped = SHADCN_MAP[token.name];
        const hint = mapped
          ? `  (shadcn 等价名: ${mapped.join(" / ")})`
          : "";
        console.log(`     ${token.name}: ${token.value}${hint}`);
      }
      console.log();
      console.log("  修复方法: 将上述变量添加到项目的 CSS 文件中。");
      console.log("  注意: 目前仅支持 shadcn/ui 的变量名映射，其他框架可能使用不同命名，");
      console.log("  若确认已用框架等价变量名定义则可忽略误报。\n");
    }

    if (valueMismatch.length > 0) {
      console.log("  ⚠️  以下变量已定义但值与原型不一致（可能是脚手架默认值未覆盖）:\n");
      for (const { name, protoValue, cssValues } of valueMismatch) {
        console.log(`     ${name}`);
        console.log(`       原型值: ${protoValue}`);
        console.log(`       当前值: ${cssValues.join(" | ")}`);
      }
      console.log();
      console.log("  修复方法: 用原型中的值覆盖项目 CSS 中对应的变量值。\n");
    }
  }

  console.log(`${"─".repeat(64)}`);
  const status = missing.length > 0
    ? "❌ 有遗漏"
    : valueMismatch.length > 0
      ? "⚠️  值不一致（需修复）"
      : "✓ 通过";
  console.log(`  结果: ${status}`);
  console.log(`${"─".repeat(64)}\n`);

  process.exit(missing.length > 0 || valueMismatch.length > 0 ? 1 : 0);
}

run();
