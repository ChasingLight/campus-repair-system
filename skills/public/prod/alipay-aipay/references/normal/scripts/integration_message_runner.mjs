#!/usr/bin/env node

import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { renderMessage } from './render_customer_message.mjs';
import { emitTerminalMetric, terminalMetricContextFromArgs } from './telemetry.mjs';
import {
  inspectBuildGuard,
  inspectDevelopmentSandboxSafety,
  managedGuardBasename
} from '../../integration/modules/scripts/sandbox_check.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const inspectorPath = path.join(scriptDir, 'project_route_inspector.sh');

const productVariants = {
  webpay: { variant: 'WEBPAY', productName: 'AI 网页应用收款' }
};
const currentProjectAliases = new Set(['.', './', '当前项目', '当前目录', '这个项目', '这个仓库', '这里']);
const projectMarkerNames = [
  'package.json'
];
const projectMarkerNameSet = new Set(projectMarkerNames);
const skippedProjectDirs = new Set([
  '.git',
  '.hg',
  '.svn',
  '.cache',
  '.idea',
  '.next',
  '.nuxt',
  '.Trash',
  'Library',
  'build',
  'coverage',
  'dist',
  'logs',
  'node_modules',
  'reports',
  'test-results'
]);
const sourceFileExtensions = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.html', '.htm', '.vue', '.svelte']);
const snapshotConfigExtensions = new Set([
  '.config', '.conf', '.ini', '.json', '.yaml', '.yml'
]);
const snapshotConfigNames = new Set([
  ...projectMarkerNames,
  '.alipay-sandbox.json',
  '.gitignore',
  'dockerfile',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock'
].map((name) => name.toLowerCase()));
const webpayMethodMarker = 'alipay\\.trade\\.page\\.pay';
const webpayPageExecMarker = '\\bpageExec\\s*\\(';
const webpayProductCodeMarker = 'FAST_INSTANT_TRADE_PAY';
const jsStringQuote = '[\'"`]';
const jsIdentifier = '[A-Za-z_$][\\w$]*';
const webpayTemplateMarker = `createElement\\s*\\(\\s*${jsStringQuote}template${jsStringQuote}\\s*\\)`;
const webpayActionUrlMarker = Object.freeze([
  'new\\s+URL\\s*\\(\\s*[A-Za-z_$][\\w$]*\\s*\\.\\s*action\\s*,',
  `new\\s+URL\\s*\\(\\s*[A-Za-z_$][\\w$]*\\s*\\.\\s*getAttribute\\s*\\(\\s*${jsStringQuote}action${jsStringQuote}\\s*\\)\\s*,`,
  `\\b(?:const|let|var)\\s+[A-Za-z_$][\\w$]*(?:Action|action|Url|URL)?\\s*=\\s*[A-Za-z_$][\\w$]*\\s*\\.\\s*(?:action|getAttribute\\s*\\(\\s*${jsStringQuote}action${jsStringQuote}\\s*\\))[\\s\\S]{0,320}\\bnew\\s+URL\\s*\\(`,
  '\\bnew\\s+URL\\s*\\(\\s*[A-Za-z_$][\\w$]*(?:Action|action|Url|URL)\\s*,'
]);
const webpayActionEndpointMarker = '\\.origin[\\s\\S]{0,320}\\.pathname|\\.pathname[\\s\\S]{0,320}\\.origin';
const webpayFormMethodPostMarker = Object.freeze([
  `\\.method\\s*\\.\\s*(?:toLowerCase|toUpperCase)\\s*\\(\\s*\\)[\\s\\S]{0,160}${jsStringQuote}post${jsStringQuote}|${jsStringQuote}post${jsStringQuote}[\\s\\S]{0,160}\\.method\\s*\\.\\s*(?:toLowerCase|toUpperCase)`,
  `\\.method\\s*(?:===|!==|==|!=)\\s*${jsStringQuote}post${jsStringQuote}|${jsStringQuote}post${jsStringQuote}\\s*(?:===|!==|==|!=)\\s*[A-Za-z_$][\\w$]*\\s*\\.\\s*method`,
  `getAttribute\\s*\\(\\s*${jsStringQuote}method${jsStringQuote}\\s*\\)[\\s\\S]{0,160}${jsStringQuote}post${jsStringQuote}|${jsStringQuote}post${jsStringQuote}[\\s\\S]{0,160}getAttribute\\s*\\(\\s*${jsStringQuote}method${jsStringQuote}\\s*\\)`
]);
const webpayRemoveTargetMarker = `removeAttribute\\s*\\(\\s*${jsStringQuote}target${jsStringQuote}\\s*\\)`;
const webpayAttachFormMarker = 'document\\s*\\.\\s*body\\s*\\??\\s*\\.\\s*(?:appendChild|append)\\s*\\(';
const webpayNativeSubmitMarker = Object.freeze([
  'HTMLFormElement\\s*\\.\\s*prototype\\s*\\.\\s*submit\\s*\\.\\s*(?:call|apply)\\s*\\(',
  '\\b(?:const|let|var)\\s+[A-Za-z_$][\\w$]*\\s*=\\s*HTMLFormElement\\s*\\.\\s*prototype\\s*\\.\\s*submit[\\s\\S]{0,320}[A-Za-z_$][\\w$]*\\s*\\.\\s*(?:call|apply)\\s*\\('
]);
const webpayPageExecPostMarker = `pageExec\\s*\\([\\s\\S]{0,640}${jsStringQuote}POST${jsStringQuote}`;
const webpayLocationNavigationMarker = '(?:(?:window\\s*\\.\\s*)?location(?:\\s*\\.\\s*href)?\\s*=|(?:window\\s*\\.\\s*)?location\\s*\\.\\s*assign\\s*\\()';
const webpayFormActionSource = `(?:\\.\\s*action|\\.\\s*getAttribute\\s*\\(\\s*${jsStringQuote}action${jsStringQuote}\\s*\\))`;
const webpayHiddenFormDataSource = `(?:new\\s+URLSearchParams\\s*\\(\\s*new\\s+FormData\\s*\\(|new\\s+FormData\\s*\\(|querySelectorAll\\s*\\([\\s\\S]{0,120}${jsStringQuote}input)`;
const webpayFormToGetNavigationMarker = Object.freeze([
  `${webpayLocationNavigationMarker}\\s*${jsIdentifier}\\s*${webpayFormActionSource}`,
  `\\b(?:const|let|var)\\s+(${jsIdentifier})\\s*=\\s*new\\s+URL\\s*\\([\\s\\S]{0,240}${webpayFormActionSource}[\\s\\S]{0,1200}${webpayLocationNavigationMarker}\\s*\\1\\s*(?:\\.\\s*(?:toString\\s*\\(\\s*\\)|href))?`,
  `${webpayHiddenFormDataSource}[\\s\\S]{0,640}${webpayLocationNavigationMarker}[\\s\\S]{0,320}${webpayFormActionSource}`,
  `${webpayLocationNavigationMarker}[\\s\\S]{0,320}${webpayFormActionSource}[\\s\\S]{0,640}${webpayHiddenFormDataSource}`
]);
const webpayMarker = [webpayMethodMarker, webpayPageExecMarker, webpayProductCodeMarker].join('|');
const tradeQueryMarker = 'alipay\\.trade\\.query|alipay_trade_query_response';
const tradeRefundMarker = 'alipay\\.trade\\.refund|alipay_trade_refund_response';
const tradeRefundQueryMarker = 'alipay\\.trade\\.fastpay\\.refund\\.query|alipay_trade_fastpay_refund_query_response';
const tradeCloseMarker = 'alipay\\.trade\\.close|alipay_trade_close_response';
const tradeNotifyIdMarker = 'notify_id|notifyId';
const tradeNotifyStatusMarker = 'trade_status|tradeStatus';
const tradeNotifyMarker = [tradeNotifyIdMarker, tradeNotifyStatusMarker].join('|');
const internalPrefix = 'ALIPAY_AIPAY_INTERNAL:';
const receiptKinds = Object.freeze({
  checklist: 'integration-checklist-scope'
});

function parseArgs(argv) {
  const command = argv[2];
  const args = {};
  for (let index = 3; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) throw new Error(`未知参数 ${key}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`参数 ${key} 缺少取值`);
    const name = key.slice(2);
    if (Object.prototype.hasOwnProperty.call(args, name)) throw new Error(`参数 ${key} 重复`);
    args[name] = value;
    index += 1;
  }
  return { command, args };
}

function required(args, name) {
  const value = args[name];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`缺少参数 --${name}`);
  return value;
}

function optional(args, name) {
  return typeof args[name] === 'string' && args[name].length > 0 ? args[name] : undefined;
}

function assertOnlyArgs(args, allowedNames) {
  const allowed = new Set(allowedNames);
  const unknown = Object.keys(args).filter((name) => !allowed.has(name));
  if (unknown.length > 0) throw new Error(`不支持参数 --${unknown[0]}`);
}

function stripWrappingQuotes(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('`') && trimmed.endsWith('`'))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function sanitizeProjectInput(raw) {
  const value = stripWrappingQuotes(raw);
  if (!value || value.length > 4096 || /[\u0000-\u001f\u007f`|]/.test(value)) {
    throw new Error('project-input 必须是不含控制字符或 Markdown 边界的安全路径描述');
  }
  return value;
}

function normalizeBusinessDescription(raw) {
  if (raw === undefined) return '';
  const value = stripWrappingQuotes(raw)
    .normalize('NFKC')
    .replace(/\s+/gu, ' ')
    .trim();
  if (!value) return '';
  const length = [...value].length;
  if (length < 2 || length > 500 || /[\u0000-\u001f\u007f`|]/u.test(value)) {
    throw new Error('business-description 必须是 2 到 500 字且不含控制字符或 Markdown 边界的经营描述');
  }
  return value;
}

function normalizeBasePath(raw) {
  const basePath = path.resolve(stripWrappingQuotes(raw));
  if (!path.isAbsolute(basePath) || !fs.existsSync(basePath) || !fs.statSync(basePath).isDirectory()) {
    throw new Error('base-path 必须是实际存在的绝对目录');
  }
  return fs.realpathSync(basePath);
}

function safeReaddir(directory) {
  try {
    return fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}

function listProjectMarkers(directory) {
  const markers = [];
  for (const entry of safeReaddir(directory)) {
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;
    if (projectMarkerNameSet.has(entry.name)) markers.push(entry.name);
  }
  return markers;
}

function isRecognizableProjectRoot(directory) {
  return listProjectMarkers(directory).length > 0;
}

function shouldSkipProjectDir(entry) {
  return !entry.isDirectory() || entry.isSymbolicLink() || skippedProjectDirs.has(entry.name) || entry.name.startsWith('.');
}

function parseDepth(value) {
  if (value === undefined) return 3;
  if (!/^[0-4]$/.test(value)) throw new Error('max-depth 仅支持 0 到 4');
  return Number(value);
}

function locateProjectCandidates(searchBasePath, maxDepth = 3, maxCandidates = 20, displayBasePath = searchBasePath, classificationBasePath = displayBasePath) {
  const queue = [{ directory: searchBasePath, depth: 0 }];
  const seen = new Set([searchBasePath]);
  const candidates = [];

  for (let index = 0; index < queue.length && candidates.length < maxCandidates; index += 1) {
    const { directory, depth } = queue[index];
    const markers = listProjectMarkers(directory);
    if (markers.length > 0) {
      const projectPath = fs.realpathSync(directory);
      candidates.push({
        projectPath,
        relativePath: path.relative(displayBasePath, projectPath) || '.',
        projectSelection: classifyExistingProject(
          projectPath,
          classificationBasePath,
          projectPath === classificationBasePath ? '当前目录' : projectPath
        ),
        projectOrigin: 'EXISTING_PROJECT',
        projectOriginLabel: '现有项目',
        markers
      });
    }
    if (depth >= maxDepth) continue;
    const childDirs = safeReaddir(directory)
      .filter((entry) => !shouldSkipProjectDir(entry))
      .map((entry) => path.join(directory, entry.name))
      .sort((left, right) => left.localeCompare(right));
    for (const child of childDirs) {
      let realChild;
      try {
        realChild = fs.realpathSync(child);
      } catch {
        continue;
      }
      if (seen.has(realChild)) continue;
      seen.add(realChild);
      queue.push({ directory: realChild, depth: depth + 1 });
    }
  }

  return candidates;
}

function formatProjectCandidateHint(basePath, candidates) {
  const visible = candidates.slice(0, 5);
  if (visible.length === 0) return '';
  return visible
    .map((candidate) => {
      const relative = candidate.relativePath || path.relative(basePath, candidate.projectPath) || '.';
      return `${relative}（${candidate.markers.slice(0, 3).join('、')}）`;
    })
    .join('；');
}

function safeInline(value) {
  return value.replace(/[`|\r\n]/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatLocatedCandidateRows(candidates) {
  if (candidates.length === 0) {
    return '未找到可识别项目候选。可以提供更精确的项目文件夹，或说明要新建的目录。';
  }
  return candidates
    .slice(0, 10)
    .map((candidate, index) => {
      const markers = candidate.markers.slice(0, 3).join('、');
      return `${index + 1}. \`${safeInline(candidate.relativePath)}\`（识别依据：${markers}）`;
    })
    .join('\n');
}

function projectRootError(searchBasePath, prefix, displayBasePath = searchBasePath) {
  const candidates = locateProjectCandidates(searchBasePath, 3, 5, displayBasePath, displayBasePath);
  const markerHint = 'package.json';
  const candidateHint = formatProjectCandidateHint(displayBasePath, candidates);
  if (candidateHint) {
    return new Error(`${prefix}；请从候选项目中选择一个具体目录，或提供更精确路径。候选：${candidateHint}。如果要新建项目，请说明“在当前目录新建 pay-demo”或“新建项目”。项目根通常包含 ${markerHint}`);
  }
  return new Error(`${prefix}；未在指定目录下找到可识别项目候选。请提供现有服务端项目的具体目录，或说明“在当前目录新建 pay-demo”或“新建项目”。项目根通常包含 ${markerHint}`);
}

function isDefaultNewProjectRequest(input) {
  return /^(?:新建项目|帮我新建默认项目)$/u.test(input);
}

function explicitNewArtifactRequest(input) {
  return /^(?:请|麻烦)?(?:给我|帮我)?(?:新建|创建)(?:一个|个|一套)?[^,，。；;!?！？\r\n]{0,80}(?:项目|工程|网站|站点|商城|商店|店铺|应用程序|应用)(?:[,，。；;!?！？].*)?$/iu.test(input);
}

function looksLikeExplicitPath(value) {
  return /^(?:[A-Za-z]:[\\/]|\\\\|[./~])/u.test(value) ||
    /[\\/]/u.test(value) ||
    /^[A-Za-z0-9._-]+$/u.test(value);
}

function extractNewProjectPath(input) {
  const prefixed = '(?:请|麻烦)?(?:给我|帮我)?';
  const currentRoot = '(?:当前目录|当前项目|这个项目|这个仓库|这里)';
  const patterns = [
    new RegExp(`^${prefixed}(?:在)?${currentRoot}(?:下|里)?(?:新建|创建)(?:一个)?(?:项目|目录)?\\s+(.+)$`, 'u'),
    new RegExp(`^${prefixed}(?:新建|创建)(?:一个)?(?:项目|目录)(?:到|在)\\s*(.+)$`, 'u')
  ];
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match?.[1]) {
      const candidate = stripWrappingQuotes(match[1]);
      if (looksLikeExplicitPath(candidate)) return candidate;
    }
  }

  const simple = input.match(/^(?:请|麻烦)?(?:给我|帮我)?(?:新建|创建)(?:一个)?\s+(.+)$/u);
  if (simple?.[1]) {
    const candidate = stripWrappingQuotes(simple[1]);
    if (looksLikeExplicitPath(candidate)) return candidate;
  }
  return '';
}

function isExplicitNewProjectRequest(input) {
  return /^(?:帮我)?(?:新建|创建)(?:一个)?(?:默认)?(?:项目|目录)?$/u.test(input) ||
    explicitNewArtifactRequest(input) ||
    extractNewProjectPath(input) !== '';
}

function parseExistingProjectPath(input) {
  if (/^(?:请|麻烦)?(?:给我|帮我)?(?:在)?(?:当前目录|当前项目|这个项目|这个仓库|这里)(?:中|内|下|里)?新增.+$/u.test(input)) {
    return '当前项目';
  }
  return input;
}

function hasDirectoryEntries(directory) {
  try {
    return safeReaddir(directory).length > 0;
  } catch {
    return true;
  }
}

function parseSingleJson(stdout, context) {
  const trimmed = stdout.trim();
  if (!trimmed) throw new Error(`${context} 未输出 JSON`);
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new Error(`${context} 未输出唯一合法 JSON 对象`);
  }
}

function runUnixInspector(args, failureContext, jsonContext) {
  const inspected = spawnSync('bash', [inspectorPath, ...args], {
    encoding: 'utf8',
    shell: false
  });
  if (inspected.status !== 0) {
    const detail = (inspected.stderr || inspected.stdout || '').trim() || `退出码 ${inspected.status}`;
    throw new Error(`${failureContext}失败：${detail}`);
  }
  return parseSingleJson(inspected.stdout, jsonContext);
}

function defaultNewProjectPath() {
  const homeInput = process.env.HOME || os.homedir() || '';
  if (!homeInput) throw new Error('无法确定用户目录；请提供明确的新项目路径');
  const homePath = normalizeBasePath(homeInput);
  const container = path.join(homePath, 'alipay-aipay-projects');
  if (fs.existsSync(container)) {
    const stat = fs.lstatSync(container);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error('默认项目父目录不可用；请提供明确的新项目路径');
    }
  }
  for (let index = 1; index <= 50; index += 1) {
    const suffix = index === 1 ? '' : `-${index}`;
    const candidate = path.join(container, `pay-demo${suffix}`);
    if (!fs.existsSync(candidate)) return candidate;
    const stat = fs.lstatSync(candidate);
    if (stat.isDirectory() && !stat.isSymbolicLink() && !hasDirectoryEntries(candidate)) return candidate;
  }
  throw new Error('默认项目目录已被占用；请提供明确的新项目路径');
}

function parseNewProjectPath(input, targetPath) {
  if (targetPath !== undefined) return sanitizeProjectInput(targetPath);
  if (looksLikeExplicitPath(input)) return input;
  if (isDefaultNewProjectRequest(input)) return defaultNewProjectPath();
  throw new Error('自然语言新建请求必须由 Agent 解析后通过 --target-path 提供明确目标；禁止把用户原话当作目录名');
}

function normalizePotentialPath(candidate) {
  let existing = candidate;
  const suffix = [];
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    suffix.unshift(path.basename(existing));
    existing = parent;
  }
  const normalizedBase = fs.existsSync(existing) ? fs.realpathSync(existing) : existing;
  return path.join(normalizedBase, ...suffix);
}

function resolveAgainstBase(input, basePath) {
  const candidate = normalizePotentialPath(path.isAbsolute(input) ? path.resolve(input) : path.resolve(basePath, input));
  if (!path.isAbsolute(input)) {
    const relative = path.relative(basePath, candidate);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error('相对项目路径必须位于 base-path 内；如需目录外项目，请提供绝对路径');
    }
  }
  return candidate;
}

function resolveSearchBasePath(args, basePath) {
  const rawInput = args['search-input'];
  if (rawInput === undefined) return basePath;
  const input = parseProjectSearchInput(sanitizeProjectInput(rawInput));
  const candidate = currentProjectAliases.has(input) ? basePath : resolveAgainstBase(input, basePath);
  const searchBasePath = fs.existsSync(candidate) ? fs.realpathSync(candidate) : candidate;
  if (!fs.existsSync(searchBasePath) || !fs.statSync(searchBasePath).isDirectory()) {
    throw new Error('search-input 必须指向实际存在的目录；可以使用当前目录、当前目录下子目录或绝对路径');
  }
  return searchBasePath;
}

function parseProjectSearchInput(input) {
  const trimmed = stripWrappingQuotes(input);
  if (/^(?:帮我)?(?:找|查找|定位)(?:一下)?(?:项目|项目目录|工程|工程目录)$/u.test(trimmed)) {
    return '当前目录';
  }
  const patterns = [
    /^(?:帮我)?(?:在|到)\s*(.+?)\s*(?:下|里|目录下|目录里)?(?:找|查找|定位)(?:一下)?(?:项目|项目目录|工程|工程目录)$/u,
    /^(?:帮我)?(?:找|查找|定位)(?:一下)?\s*(.+?)\s*(?:下|里|目录下|目录里)?(?:的)?(?:项目|项目目录|工程|工程目录)$/u
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return stripWrappingQuotes(match[1]);
  }
  return trimmed;
}

function classifyExistingProject(projectPath, basePath, rawInput) {
  if (currentProjectAliases.has(rawInput)) return 'CURRENT_PROJECT';
  const relative = path.relative(basePath, projectPath);
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
    return 'CURRENT_PROJECT';
  }
  return 'OTHER_PROJECT';
}

function isReadableDirectory(directory) {
  try {
    const stat = fs.statSync(directory);
    if (!stat.isDirectory()) return false;
    fs.accessSync(directory, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function projectFiles(projectPath) {
  const files = [];
  const stack = [projectPath];
  while (stack.length > 0) {
    const directory = stack.pop();
    for (const entry of safeReaddir(directory)) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!entry.isSymbolicLink() && !skippedProjectDirs.has(entry.name)) stack.push(entryPath);
        continue;
      }
      if (entry.isSymbolicLink() || !entry.isFile()) continue;
      files.push(entryPath);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function sourceFiles(projectPath, files = projectFiles(projectPath)) {
  return files.filter((file) => sourceFileExtensions.has(path.extname(file).toLowerCase()));
}

function isSnapshotConfigFile(file) {
  const basename = path.basename(file).toLowerCase();
  return snapshotConfigNames.has(basename)
    || /^\.env(?:\.|$)/u.test(basename)
    || /^(?:appsettings(?:\.[^.]+)*|config|jsconfig|launchsettings|settings|tsconfig(?:\.[^.]+)*)\.json$/u.test(basename)
    || snapshotConfigExtensions.has(path.extname(basename));
}

function projectSnapshot(projectPath) {
  if (!path.isAbsolute(projectPath) || !isReadableDirectory(projectPath)) {
    throw new Error('项目快照路径必须是可访问的绝对目录');
  }
  const canonicalPath = fs.realpathSync(projectPath);
  const files = projectFiles(canonicalPath);
  const sources = sourceFiles(canonicalPath, files);
  const tracked = new Set([...sources, ...files.filter(isSnapshotConfigFile)]);
  const hash = crypto.createHash('sha256');
  const contents = new Map();
  hash.update(`project=${canonicalPath}\n`);
  for (const file of [...tracked].sort((left, right) => left.localeCompare(right))) {
    const stat = fs.statSync(file);
    const relative = path.relative(canonicalPath, file);
    const content = fs.readFileSync(file);
    contents.set(file, content);
    hash.update(`${relative}\0${stat.size}\0`);
    hash.update(content);
    hash.update('\n');
  }
  return { canonicalPath, sources, contents, fingerprint: hash.digest('hex') };
}

function projectUsesPackage(projectPath, snapshot, packageName) {
  const packagePath = path.join(projectPath, 'package.json');
  try {
    const raw = snapshot.contents.get(packagePath)?.toString('utf8') ?? fs.readFileSync(packagePath, 'utf8');
    const manifest = JSON.parse(raw);
    return [manifest.dependencies, manifest.devDependencies, manifest.peerDependencies]
      .some((dependencies) => dependencies && typeof dependencies === 'object'
        && Object.prototype.hasOwnProperty.call(dependencies, packageName));
  } catch {
    return false;
  }
}

function encodeReceipt(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeReceipt(value, expectedKind) {
  if (typeof value !== 'string' || !value) throw new Error('缺少 receipt');
  let payload;
  try {
    payload = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw new Error('receipt 不是合法编码');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.schema_ver !== 1 || payload.kind !== expectedKind) {
    throw new Error('receipt 类型或版本非法');
  }
  return payload;
}

function stripSourceComments(content) {
  const tokens = /"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|\/\/[^\r\n]*/gu;
  return content.replace(tokens, (token) => {
    const comment = token.startsWith('//') || token.startsWith('/*') || token.startsWith('<!--');
    return comment ? token.replace(/[^\r\n]/gu, ' ') : token;
  });
}

function implementationSourceFiles(projectPath, files = sourceFiles(projectPath), contents = null) {
  const testDirectories = new Set([
    '__fixtures__', '__tests__', 'fixtures', 'spec', 'specs', 'test', 'testfixtures', 'tests'
  ]);
  const generatedDirectories = new Set([
    '.generated', 'bin', 'gen', 'generated', 'generated-sources', 'generated-src', 'obj', 'out'
  ]);
  return files.filter((file) => {
    const relative = path.relative(projectPath, file);
    if (relative === managedGuardBasename) return false;
    const parts = relative.split(path.sep);
    const lowerParts = parts.map((part) => part.toLowerCase());
    const basename = path.basename(file);
    const lowerBasename = basename.toLowerCase();
    const testDirectory = lowerParts.some((part) => testDirectories.has(part)
      || /^(?:.*[._-])?(?:integration|unit|functional|acceptance|e2e)?tests?$/u.test(part));
    const generatedDirectory = lowerParts.some((part) => generatedDirectories.has(part));
    const testFile = /(?:^|[._-])(?:test|tests|spec|specs)(?:[._-]|$)/u.test(lowerBasename)
      || /(?:Test|Tests|Spec|Specs)\.[^.]+$/u.test(basename);
    const generatedFile = /^generated/u.test(lowerBasename)
      || /(?:^|[._-])generated(?:[._-]|$)/u.test(lowerBasename)
      || /\.g\.[^.]+$/u.test(lowerBasename);
    let generatedHeader = false;
    try {
      const content = contents?.get(file)?.toString('utf8') ?? fs.readFileSync(file, 'utf8');
      generatedHeader = /^\s*(?:(?:\/\/|\/\*+|\*)\s*)?(?:<auto-generated|@generated\b|code generated by|generated by .{0,120}do not edit|this file was generated)/imu
        .test(content.slice(0, 4096));
    } catch {
      generatedHeader = true;
    }
    return !testDirectory && !generatedDirectory && !testFile && !generatedFile && !generatedHeader;
  });
}

function firstCodePatternMatch(files, pattern, contents = null) {
  const regex = new RegExp(pattern, 'iu');
  for (const file of files) {
    let content;
    try {
      content = contents?.get(file)?.toString('utf8') ?? fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const lines = stripSourceComments(content).split(/\r?\n/u);
    for (let index = 0; index < lines.length; index += 1) {
      if (regex.test(lines[index])) {
        return { file, line: index + 1 };
      }
    }
  }
  return null;
}

function firstContentPatternMatch(file, content, pattern) {
  const match = new RegExp(pattern, 'iu').exec(content);
  if (!match) return null;
  return { file, line: content.slice(0, match.index).split(/\r?\n/u).length };
}

function firstContentPatternMatchAny(file, content, pattern) {
  const patterns = Array.isArray(pattern) ? pattern : [pattern];
  for (const item of patterns) {
    const match = firstContentPatternMatch(file, content, item);
    if (match) return match;
  }
  return null;
}

function firstProjectContentPatternMatch(files, pattern, contents = null) {
  for (const file of files) {
    let content;
    try {
      content = contents?.get(file)?.toString('utf8') ?? fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const strippedContent = stripSourceComments(content);
    const match = firstContentPatternMatchAny(file, strippedContent, pattern);
    if (match) return match;
  }
  return null;
}

function auditFinding(projectPath, code, message, match = null) {
  const finding = { code, message };
  if (match) {
    finding.path = path.relative(projectPath, match.file).replace(/[\u0000-\u001f\u007f]/gu, '?');
    finding.line = match.line;
  }
  return finding;
}

function formatAuditFindingForChecklist(finding) {
  const message = String(finding.message || '')
    .replace(/固定沙箱网关\s+https?:\/\/[^\s，。；)）]+/giu, '固定沙箱网关')
    .replace(/https?:\/\/[^\s，。；)）]+/giu, '相关地址')
    .replace(/[`|]/gu, '');
  const location = finding.path ? `（${finding.path}${finding.line ? `:${finding.line}` : ''}）` : '';
  return `${message}${location}`;
}

const implementationRequiredPatterns = Object.freeze({
  WEBPAY: [
    ['WEBPAY_METHOD_MISSING', webpayMethodMarker, '缺少 alipay.trade.page.pay 下单接口'],
    ['WEBPAY_PAGE_EXEC_MISSING', webpayPageExecMarker, 'alipay.trade.page.pay 下单缺少 pageExec() 调用'],
    ['WEBPAY_PRODUCT_CODE_MISSING', webpayProductCodeMarker, 'alipay.trade.page.pay 下单缺少固定 FAST_INSTANT_TRADE_PAY product_code'],
    ['WEBPAY_TEMPLATE_FORM_MISSING', webpayTemplateMarker, '支付前端缺少 inert template 表单解析'],
    ['WEBPAY_ACTION_URL_VALIDATION_MISSING', webpayActionUrlMarker, '支付前端缺少 form action URL 解析'],
    ['WEBPAY_GATEWAY_ENDPOINT_VALIDATION_MISSING', webpayActionEndpointMarker, '支付前端缺少固定网关 origin + pathname 校验'],
    ['WEBPAY_FORM_METHOD_VALIDATION_MISSING', webpayFormMethodPostMarker, '支付前端缺少 form POST 方法校验'],
    ['WEBPAY_TARGET_SELF_MISSING', webpayRemoveTargetMarker, '支付前端未按固定契约移除 form target'],
    ['WEBPAY_FORM_ATTACH_MISSING', webpayAttachFormMarker, '支付前端提交前未把 form 挂载到当前 document.body'],
    ['WEBPAY_NATIVE_SUBMIT_MISSING', webpayNativeSubmitMarker, '支付前端缺少 HTMLFormElement.prototype.submit.call(form) 原生提交'],
    ['TRADE_QUERY_MISSING', tradeQueryMarker, '缺少 alipay.trade.query 交易查询'],
    ['TRADE_REFUND_MISSING', tradeRefundMarker, '缺少 alipay.trade.refund 退款'],
    ['REFUND_QUERY_MISSING', tradeRefundQueryMarker, '缺少 alipay.trade.fastpay.refund.query 退款查询'],
    ['TRADE_CLOSE_MISSING', tradeCloseMarker, '缺少 alipay.trade.close 关闭交易'],
    ['TRADE_NOTIFY_ID_MISSING', tradeNotifyIdMarker, '异步通知处理缺少 notify_id 幂等事实'],
    ['TRADE_NOTIFY_STATUS_MISSING', tradeNotifyStatusMarker, '异步通知处理缺少 trade_status 状态判断']
  ]
});

export function inspectImplementation(variant, projectPath, snapshot = null, configurationState = 'SANDBOX_ACTIVE') {
  if (!Object.prototype.hasOwnProperty.call(implementationRequiredPatterns, variant)) {
    throw new Error('implementation audit variant 非法，仅支持 WEBPAY');
  }
  if (!path.isAbsolute(projectPath) || !isReadableDirectory(projectPath)) {
    throw new Error('implementation audit 项目路径必须是可访问的绝对目录');
  }
  const currentSnapshot = snapshot || projectSnapshot(projectPath);
  const canonicalPath = currentSnapshot.canonicalPath;
  if (canonicalPath !== fs.realpathSync(projectPath)) throw new Error('implementation audit 项目快照路径不匹配');
  const files = implementationSourceFiles(canonicalPath, currentSnapshot.sources, currentSnapshot.contents);
  const nextProject = projectUsesPackage(canonicalPath, currentSnapshot, 'next');
  const findings = [];

  for (const [code, pattern, message] of implementationRequiredPatterns[variant]) {
    if (!firstProjectContentPatternMatch(files, pattern, currentSnapshot.contents)) {
      findings.push(auditFinding(canonicalPath, code, message));
    }
  }
  if (!firstProjectContentPatternMatch(files, webpayPageExecPostMarker, currentSnapshot.contents)) {
    findings.push(auditFinding(canonicalPath, 'WEBPAY_PAGE_EXEC_POST_MISSING',
      'alipay.trade.page.pay 下单必须通过 pageExec() 的 POST 模式生成 HTML form'));
  }

  const commonTradeRelevance = [tradeQueryMarker, tradeRefundMarker, tradeRefundQueryMarker, tradeCloseMarker, tradeNotifyMarker].join('|');
  const targetRelevancePattern = `${webpayMarker}|${commonTradeRelevance}`;
  const criticalTodoPattern = '(?:TODO|FIXME)[\\s\\S]{0,240}(?:支付|订单|验付|验签|退款|履约|持久|幂等|payment|order|verify|signature|refund|fulfill|persist|idempot)';
  const mockBypassPattern = '(?:if|when)[\\s\\S]{0,240}(?:mock|test|sandbox)[\\s\\S]{0,320}(?:return\\s+true|bypass|skip|跳过)';

  for (const file of files) {
    let content;
    try {
      content = currentSnapshot.contents.get(file)?.toString('utf8') ?? fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const codeContent = stripSourceComments(content);
    const targetRelevant = new RegExp(targetRelevancePattern, 'iu').test(codeContent);
    const browserSubmitRelevant = /paymentHtml|paymentForm|punchout_form|HTMLFormElement\s*\.\s*prototype\s*\.\s*submit|createElement\s*\(\s*['"]template['"]\s*\)/iu.test(codeContent);
    const checks = [];
    if (targetRelevant || /alipay|支付宝|Payment-Proof/iu.test(codeContent)) {
      checks.push(['PAYMENT_VERIFICATION_BYPASS', mockBypassPattern, '存在测试/沙箱条件下直接绕过支付验签的生产代码']);
    }
    if (targetRelevant) {
      checks.push(['PAYMENT_CRITICAL_TODO', criticalTodoPattern, '支付关键控制仍保留 TODO/FIXME']);
      checks.push(['PAYMENT_MEMORY_ORDER_STORE', 'globalThis[\\s\\S]{0,200}new\\s+Map\\s*\\(',
        '支付生产路径使用 globalThis Map 作为订单存储，不能保证跨路由、构建或实例持久化']);
    }
    if (browserSubmitRelevant) {
      checks.push(['WEBPAY_NEW_TAB_FORBIDDEN', "window\\s*\\.\\s*open\\s*\\(|\\.target\\s*=\\s*['\"]_blank['\"]|setAttribute\\s*\\(\\s*['\"]target['\"]\\s*,\\s*['\"]_blank['\"]",
        '支付前端会打开新标签页，Coze 预览必须在当前 browsing context 提交']);
      checks.push(['WEBPAY_NATIVE_DIALOG_FORBIDDEN', '(?:window|globalThis)\\s*\\.\\s*(?:confirm|alert|prompt)\\s*\\(',
        '支付前端禁止浏览器原生 confirm/alert/prompt；应使用应用内 loading 和内联错误']);
      checks.push(['WEBPAY_DOCUMENT_REPLACEMENT_FORBIDDEN', 'document\\s*\\.\\s*(?:open|write|close)\\s*\\(',
        '支付前端禁止用 document.open/write/close 替换当前文档']);
      checks.push(['WEBPAY_HTML_AS_URL_FORBIDDEN', "(?:window\\s*\\.\\s*)?location(?:\\s*\\.\\s*href)?\\s*=\\s*(?:data\\s*\\.\\s*)?(?:paymentHtml|paymentForm)",
        '支付 HTML form 不能作为 URL 赋给 location']);
      checks.push(['WEBPAY_FORM_TO_GET_FORBIDDEN', webpayFormToGetNavigationMarker,
        '禁止把 pageExec POST form 的 action 和 hidden input 拼成 GET URL 跳转；必须提交原始隐藏表单']);
    }
    for (const [code, pattern, message] of checks) {
      const match = firstContentPatternMatchAny(
        file,
        code === 'PAYMENT_CRITICAL_TODO' ? content : codeContent,
        pattern
      );
      if (match) findings.push(auditFinding(canonicalPath, code, message, match));
    }

    if (nextProject) {
      const dirnameConfig = /__dirname[\s\S]{0,240}\.alipay-sandbox\.json|\.alipay-sandbox\.json[\s\S]{0,240}__dirname/iu;
      const dirnameMatch = dirnameConfig.exec(codeContent);
      if (dirnameMatch) {
        const line = codeContent.slice(0, dirnameMatch.index).split(/\r?\n/u).length;
        findings.push(auditFinding(canonicalPath, 'SANDBOX_CONFIG_NEXT_COMPILED_DIR_DEPENDENCY',
          'Next.js 不能从编译后可能位于 .next/server 的 __dirname 反推 .alipay-sandbox.json 路径', { file, line }));
      }
    }

    const cozeDomainDoubleScheme = /`https:\/\/\$\{\s*process\s*\.\s*env\s*\.\s*COZE_PROJECT_DOMAIN_DEFAULT\s*\}`|['"]https:\/\/['"]\s*\+\s*process\s*\.\s*env\s*\.\s*COZE_PROJECT_DOMAIN_DEFAULT/iu;
    const cozeDomainMatch = cozeDomainDoubleScheme.exec(codeContent);
    if (cozeDomainMatch) {
      const line = codeContent.slice(0, cozeDomainMatch.index).split(/\r?\n/u).length;
      findings.push(auditFinding(canonicalPath, 'COZE_PROJECT_DOMAIN_DOUBLE_SCHEME_RISK',
        'COZE_PROJECT_DOMAIN_DEFAULT 可能已含 https://，禁止无条件再次拼接协议', { file, line }));
    }

    const certificateExecution = /certificateExecute|certExecute/iu.test(codeContent);
    const webpayTargetRelevant = new RegExp(webpayMarker, 'iu').test(codeContent);
    if (certificateExecution && webpayTargetRelevant) {
      const match = firstCodePatternMatch(
        [file], 'certificateExecute|certExecute', currentSnapshot.contents);
      findings.push(auditFinding(canonicalPath, 'WEBPAY_CERTIFICATE_MODE_UNSUPPORTED',
        'Coze AI 网页应用收款目标路径固定使用公钥模式，禁止调用证书执行 API', match));
    }
  }

  if (configurationState === 'SANDBOX_ACTIVE') {
    findings.push(...inspectDevelopmentSandboxSafety(canonicalPath).findings);
  } else {
    findings.push(auditFinding(
      canonicalPath,
      'PAYMENT_CONFIGURATION_STATE_UNRESOLVED',
      '支付宝当前生效配置无法确认为当前 Skill 支持的沙箱开发配置'
    ));
  }
  findings.push(...inspectBuildGuard(canonicalPath).findings);

  findings.sort((left, right) => `${left.code}:${left.path || ''}:${left.line || 0}`
    .localeCompare(`${right.code}:${right.path || ''}:${right.line || 0}`));
  return { projectPath: canonicalPath, variant, findings };
}

function runResolveProject(args) {
  const intent = required(args, 'intent');
  if (!['existing', 'new'].includes(intent)) throw new Error('intent 非法，仅支持 existing、new');
  const basePath = normalizeBasePath(required(args, 'base-path'));
  const input = sanitizeProjectInput(required(args, 'project-input'));

  if (intent === 'existing') {
    if (args['target-path'] !== undefined) throw new Error('--target-path 仅支持 --intent new');
    if (isExplicitNewProjectRequest(input)) {
      throw new Error('明确新建项目请求必须使用 --intent new，不能改用当前项目');
    }
    const existingInput = parseExistingProjectPath(input);
    const candidate = currentProjectAliases.has(existingInput) ? basePath : resolveAgainstBase(existingInput, basePath);
    const projectPath = fs.existsSync(candidate) ? fs.realpathSync(candidate) : candidate;
    if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
      throw new Error('现有项目路径不可访问；请提供当前目录内相对路径或实际存在的绝对路径');
    }
    if (!isRecognizableProjectRoot(projectPath)) {
      const prefix = currentProjectAliases.has(existingInput)
        ? '当前目录不是可识别的项目根，不能直接作为现有项目扫描'
        : '该路径未识别到项目根标记，不能确认是服务端项目根';
      const searchBasePath = currentProjectAliases.has(input) ? basePath : projectPath;
      throw projectRootError(searchBasePath, prefix, basePath);
    }
    return JSON.stringify({
      projectPath,
      projectSelection: classifyExistingProject(projectPath, basePath, existingInput),
      projectOrigin: 'EXISTING_PROJECT',
      projectOriginLabel: '现有项目'
    });
  }

  const newPathInput = parseNewProjectPath(input, args['target-path']);
  if (currentProjectAliases.has(newPathInput)) {
    throw new Error('新项目必须明确尚不存在或为空的子目录名');
  }
  const projectPath = resolveAgainstBase(newPathInput, basePath);
  const route = runUnixInspector(['prepare-new', projectPath], '新项目路径检查', '新项目路径检查器');
  return JSON.stringify({ projectPath, ...route });
}

function runLocateProjects(args) {
  const basePath = normalizeBasePath(required(args, 'base-path'));
  const searchBasePath = resolveSearchBasePath(args, basePath);
  const maxDepth = parseDepth(args['max-depth']);
  const format = args.format || 'json';
  if (!['json', 'message'].includes(format)) throw new Error('format 仅支持 json 或 message');
  const candidates = locateProjectCandidates(searchBasePath, maxDepth, 20, basePath, basePath);
  if (format === 'message') {
    return renderMessage('integration.project_candidates.select', 'DEFAULT', {
      searchBasePath,
      candidateRows: formatLocatedCandidateRows(candidates)
    });
  }
  return JSON.stringify({
    basePath,
    searchBasePath,
    maxDepth,
    candidates,
    nextAction: '请选择一个候选项目目录作为现有项目，或说明要新建的目录，例如“在当前目录新建 pay-demo”或“新建项目”。'
  });
}

function normalizeLanguage(input) {
  const value = input.trim();
  const compact = value.toLowerCase().replace(/[\s_.-]+/g, '');
  if (compact === 'nodejs' || compact === 'node' || compact === 'javascript' || compact === 'js') return 'Node.js';
  throw new Error('服务端语言非法，Coze 当前仅支持 Node.js');
}

const existingProjectFrameworkFallback = '沿用现有项目结构';
const defaultFrameworks = Object.freeze({
  'Node.js': 'Express'
});
const frameworkSources = new Set([
  'EXPLICIT',
  'DEFAULT_NEW_PROJECT',
  'PROJECT_INFERRED',
  'PROJECT_STRUCTURE_FALLBACK'
]);

function readProjectMarker(projectPath, relativePath) {
  const file = path.join(projectPath, relativePath);
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2 * 1024 * 1024) return '';
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function readProjectJson(projectPath, relativePath) {
  const content = readProjectMarker(projectPath, relativePath);
  if (!content) return null;
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function dependencyNames(manifest) {
  const names = new Set();
  for (const key of ['dependencies', 'devDependencies', 'peerDependencies', 'require', 'require-dev']) {
    const dependencies = manifest?.[key];
    if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) continue;
    for (const name of Object.keys(dependencies)) names.add(name.toLowerCase());
  }
  return names;
}

function firstMatchingFramework(names, rules) {
  for (const [framework, matches] of rules) {
    if (matches.some((name) => names.has(name) || [...names].some((item) => item.startsWith(`${name}/`)))) {
      return framework;
    }
  }
  return '';
}

function inferFramework(projectPath, language) {
  if (language === 'Node.js') {
    return firstMatchingFramework(dependencyNames(readProjectJson(projectPath, 'package.json')), [
      ['NestJS', ['@nestjs/core']],
      ['Next.js', ['next']],
      ['Express', ['express']],
      ['Fastify', ['fastify']],
      ['Koa', ['koa']],
      ['Hono', ['hono']]
    ]);
  }
  return '';
}

function sanitizeFramework(value) {
  const framework = value.trim();
  if (!framework || framework.length > 120 || /[\u0000-\u001f\u007f|`]/u.test(framework) || /https?:\/\//iu.test(framework)) {
    throw new Error('framework 必须是安全的单行框架名称');
  }
  return framework;
}

function deriveFramework(projectPath, projectSelection, language) {
  if (projectSelection === 'NEW_PROJECT' || projectSelection === 'PREPARED_NEW_PROJECT') {
    return { framework: defaultFrameworks[language], frameworkSource: 'DEFAULT_NEW_PROJECT' };
  }
  const inferred = inferFramework(projectPath, language);
  return {
    framework: inferred || existingProjectFrameworkFallback,
    frameworkSource: inferred ? 'PROJECT_INFERRED' : 'PROJECT_STRUCTURE_FALLBACK'
  };
}

function resolveFramework(args, projectPath, projectSelection, language) {
  const suppliedFramework = typeof args.framework === 'string' && args.framework.length > 0
    ? sanitizeFramework(args.framework)
    : '';
  const suppliedSource = typeof args['framework-source'] === 'string' ? args['framework-source'] : '';
  if (suppliedSource && !frameworkSources.has(suppliedSource)) throw new Error('framework-source 非法');

  if (!suppliedSource) {
    return suppliedFramework
      ? { framework: suppliedFramework, frameworkSource: 'EXPLICIT' }
      : deriveFramework(projectPath, projectSelection, language);
  }
  if (!suppliedFramework) throw new Error('framework-source 必须与 framework 同时提供');
  if (suppliedSource === 'EXPLICIT') {
    return { framework: suppliedFramework, frameworkSource: suppliedSource };
  }

  const derived = deriveFramework(projectPath, projectSelection, language);
  if (derived.framework !== suppliedFramework || derived.frameworkSource !== suppliedSource) {
    throw new Error('framework 与当前项目推导事实不一致');
  }
  return derived;
}

function runFrameworkResolve(args) {
  const language = normalizeLanguage(required(args, 'language'));
  const projectSelection = required(args, 'project-selection');
  if (!['NEW_PROJECT', 'PREPARED_NEW_PROJECT', 'CURRENT_PROJECT', 'OTHER_PROJECT'].includes(projectSelection)) {
    throw new Error('project-selection 非法');
  }
  let projectPath = '';
  if (projectSelection === 'CURRENT_PROJECT' || projectSelection === 'OTHER_PROJECT') {
    projectPath = fs.realpathSync(required(args, 'project-path'));
    if (!isReadableDirectory(projectPath)) throw new Error('现有项目路径不可访问');
  }
  const resolved = resolveFramework(args, projectPath, projectSelection, language);
  return JSON.stringify({ language, ...resolved });
}

function startConfirmationFacts(args) {
  const productType = required(args, 'product-type');
  const mapping = productVariants[productType];
  if (!mapping) throw new Error('product-type 非法，仅支持 webpay');

  const projectPath = required(args, 'project-path');
  const projectSelection = required(args, 'project-selection');
  const language = normalizeLanguage(required(args, 'language'));
  const { framework, frameworkSource } = resolveFramework(args, projectPath, projectSelection, language);
  const productName = args['product-name'] || mapping.productName;
  if (productName !== mapping.productName) throw new Error('product-name 与 product-type 不匹配');
  if (!path.isAbsolute(projectPath)) throw new Error('project-path 必须是绝对路径');

  const route = runUnixInspector(
    ['scan', productType, projectPath, projectSelection],
    '项目检查',
    '项目检查器'
  );
  if (route.projectSelection !== projectSelection) throw new Error('项目检查结果与本轮 projectSelection 不一致');
  const existing = projectSelection === 'CURRENT_PROJECT' || projectSelection === 'OTHER_PROJECT';
  const preparedNew = projectSelection === 'PREPARED_NEW_PROJECT';
  if (
    !(preparedNew && route.projectOrigin === 'NEW_PROJECT' && route.projectOriginLabel === '本轮新建项目') &&
    !(existing && route.projectOrigin === 'EXISTING_PROJECT' && route.projectOriginLabel === '现有项目')
  ) {
    throw new Error('项目来源与本轮项目选择不一致');
  }
  if (!['TARGET_PARTIAL', 'NO_PAYMENT'].includes(route.integrationStatus)) {
    throw new Error('项目集成状态不允许发起代码开发确认');
  }
  if (typeof route.evidence !== 'string') {
    throw new Error('项目检查结果缺少必要事实字段');
  }

  return {
    productType,
    variant: mapping.variant,
    productName,
    projectPath: fs.realpathSync(projectPath),
    projectSelection,
    language,
    framework,
    frameworkSource,
    route
  };
}

function renderStartConfirmation(facts) {
  return renderMessage('integration.start.confirm', facts.variant, {
    productName: facts.productName,
    projectPath: facts.projectPath,
    projectOriginLabel: facts.route.projectOriginLabel,
    integrationStatus: facts.route.integrationStatus,
    language: facts.language,
    framework: facts.framework,
    nextFlow: 'integration'
  });
}

export function createStartConfirmation(args) {
  return renderStartConfirmation(startConfirmationFacts(args));
}

export function createChecklistScopeReceipt(productType, projectPath) {
  const variant = productVariants[productType]?.variant;
  if (!variant) throw new Error('checklist scope product-type 非法');
  const snapshot = projectSnapshot(projectPath);
  return encodeReceipt({
    schema_ver: 1,
    kind: receiptKinds.checklist,
    variant,
    project_path: snapshot.canonicalPath,
    project_fingerprint: snapshot.fingerprint
  });
}

function validateChecklistScopeReceipt(receipt, expectedVariant, expectedProjectPath, snapshot) {
  const payload = decodeReceipt(receipt, receiptKinds.checklist);
  const canonicalExpectedPath = fs.realpathSync(expectedProjectPath);
  return payload.variant === expectedVariant
    && payload.project_path === canonicalExpectedPath
    && snapshot.canonicalPath === canonicalExpectedPath
    && snapshot.fingerprint === payload.project_fingerprint;
}

function runContextRequired(args) {
  const missingItems = required(args, 'missing-items');
  if (missingItems !== '项目路径') throw new Error('missing-items 非法，Coze 定制版只允许项目路径');
  return renderMessage('integration.context.required', 'DEFAULT', {
    missingItems
  });
}

function runProductUnsupported(args) {
  return renderMessage('product.unsupported', 'DEFAULT', {
    productName: required(args, 'product-name')
  }, terminalMetricContextFromArgs(args, { terminalReason: 'unsupported_product' }));
}

function runLocalAcceptanceNotice() {
  return renderMessage('integration.local_acceptance.notice', 'DEFAULT', {});
}

function runTroubleshootingTerminal(args) {
  assertOnlyArgs(args, [
    'outcome',
    'user-input-count-total',
    'user-input-count-after-flow-start',
    'flow-start-observed'
  ]);
  const outcome = required(args, 'outcome');
  if (!['RESOLVED', 'UNRESOLVED'].includes(outcome)) {
    throw new Error('outcome 非法，仅支持 RESOLVED、UNRESOLVED');
  }
  emitTerminalMetric({
    rootIntent: 'integration_only',
    productType: 'WEBPAY',
    ...terminalMetricContextFromArgs(args, {
      rootIntent: 'integration_only',
      terminalReason: outcome === 'RESOLVED' ? 'completed' : 'partial_with_remaining_actions'
    })
  });
}

function runWebpaySandboxExperience(args) {
  assertOnlyArgs(args, ['start-command', 'payment-url', 'return-mode']);
  const returnMode = required(args, 'return-mode');
  if (!['RETURN', 'NO_RETURN'].includes(returnMode)) {
    throw new Error('return-mode 非法，仅支持 RETURN、NO_RETURN');
  }
  return renderMessage('webpay.sandbox.experience', 'DEFAULT', {
    startCommand: required(args, 'start-command'),
    paymentUrl: required(args, 'payment-url'),
    returnMode
  });
}

function runProductionCredentialHandoff(args) {
  assertOnlyArgs(args, []);
  process.stderr.write(`${internalPrefix}CUSTOMER_MESSAGE_DELIVERY_REQUIRED=integration.production_credential.handoff\n`);
  return renderMessage('integration.production_credential.handoff', 'DEFAULT', {});
}

function runCredentialFieldContract(args) {
  assertOnlyArgs(args, []);
  return renderMessage('integration.production_credential.field_contract', 'DEFAULT', {});
}

function runSafetyCloseout(args) {
  assertOnlyArgs(args, ['variant', 'acceptance-summary']);
  const variant = required(args, 'variant');
  if (variant !== 'WEBPAY') throw new Error('variant 非法，仅支持 WEBPAY');
  const acceptanceSummary = `${required(args, 'acceptance-summary')}；本轮不读取、不唤起 Coze 支付宝支付密钥托管卡片，也不执行生产配置替换。确认产品已开通后，可以在 Coze 主动触发上线前准备流程：当前 Skill 会先通过 Coze 打开或检查全局支付宝支付密钥配置，缺失时展示全局卡片；如果没有弹出卡片，可能是当前 Coze 编程平台已经配置了全局支付宝支付密钥。查看入口：扣子编程首页 → 左侧栏集成管理 → 外部集成 → 支付宝支付密钥托管。配置前请确认生产 appId、支付宝公钥和应用私钥属于同一套生产应用；若后续明确改用其他生产 appId，以最新确认结果为准。应用私钥只在卡片中维护，不发送给 Agent。卡片处理完成后再触发独立生产配置技能处理。`;
  return renderMessage('integration.safety.closeout', variant, {
    acceptanceSummary
  });
}

async function readStdin() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  return input.trim() ? JSON.parse(input) : {};
}

function checklistInputFromArgs(args) {
  const mapping = {
    'overall-result': 'overallResult',
    'failed-items': 'failedItems',
    'manual-items': 'manualItems',
    'webpay-experience-result': 'webpayExperienceResult',
    'sandbox-config-state': 'sandboxConfigState',
    'configuration-state': 'configurationState',
    'blocking-defect-state': 'blockingDefectState',
    'execution-mode': 'executionMode',
    'next-flow-reminder': 'nextFlowReminder'
  };
  const hasTypedInput = Object.keys(mapping).some((name) => Object.prototype.hasOwnProperty.call(args, name));
  if (!hasTypedInput) return null;

  const input = {};
  for (const [argName, fieldName] of Object.entries(mapping)) {
    if (Object.prototype.hasOwnProperty.call(args, argName)) input[fieldName] = args[argName];
  }
  for (const requiredName of [
    'overall-result',
    'failed-items',
    'manual-items',
    'webpay-experience-result',
    'sandbox-config-state',
    'configuration-state',
    'blocking-defect-state',
    'execution-mode',
    'next-flow-reminder'
  ]) {
    required(args, requiredName);
  }
  return input;
}

function terminalReasonForChecklist(input) {
  if (input.overallResult === '通过') return 'completed';
  if (input.overallResult === '未通过' || input.blockingDefectState === 'PRESENT') return 'integration_blocked';
  return 'partial_with_remaining_actions';
}

function fullProcessHandoff(input, context = {}) {
  let integrationResult;
  if (input.overallResult === '未通过' || input.blockingDefectState === 'PRESENT') {
    integrationResult = '未完成';
  } else if (input.overallResult === '通过') {
    integrationResult = '已完成';
  } else if (input.overallResult === '部分通过'
      && input.configurationState === 'SANDBOX_ACTIVE'
      && input.sandboxConfigState !== 'READY') {
    integrationResult = '部分完成，沙箱配置待完成';
  } else if (input.overallResult === '部分通过'
      && input.sandboxConfigState === 'READY'
      && input.manualItems !== '无') {
    integrationResult = '部分完成，人工待验证';
  } else {
    throw new Error('full_process checklist 结果无法映射为确定性衔接状态');
  }

  const handoff = {
    schema_ver: 1,
    integration_result: integrationResult,
    sandbox_config_state: input.sandboxConfigState,
    manual_verification_items: input.manualItems,
    configuration_state: input.configurationState,
    onboarding_allowed: !['未完成', '结果未知'].includes(integrationResult)
  };
  if (context.businessDescription) handoff.business_description = context.businessDescription;
  return handoff;
}

async function runChecklistResult(args) {
  const variant = required(args, 'variant');
  if (variant !== 'WEBPAY') throw new Error('variant 非法，仅支持 WEBPAY');
  assertOnlyArgs(args, [
    'variant',
    'project-path',
    'scope-receipt',
    'overall-result',
    'failed-items',
    'manual-items',
    'webpay-experience-result',
    'sandbox-config-state',
    'blocking-defect-state',
    'execution-mode',
    'next-flow-reminder',
    'business-description',
    'configuration-state',
    'finalize-audit-findings',
    'user-input-count-total',
    'user-input-count-after-flow-start',
    'flow-start-observed'
  ]);
  if (Object.prototype.hasOwnProperty.call(args, 'finalize-audit-findings') && args['finalize-audit-findings'] !== 'true') {
    throw new Error('finalize-audit-findings 只允许 true');
  }
  const scopeReceipt = required(args, 'scope-receipt');
  const projectPath = required(args, 'project-path');
  const configurationState = required(args, 'configuration-state');
  if (!['SANDBOX_ACTIVE', 'UNRESOLVED'].includes(configurationState)) {
    throw new Error('configuration-state 非法，仅支持 SANDBOX_ACTIVE、UNRESOLVED');
  }
  const snapshot = projectSnapshot(projectPath);
  if (!validateChecklistScopeReceipt(scopeReceipt, variant, projectPath, snapshot)) {
    throw new Error('项目在当前 checklist 开始后发生变化，或产品不匹配；必须重新进入 checklist 阶段并重跑受影响检查');
  }
  const input = checklistInputFromArgs(args) || await readStdin();
  const businessDescription = normalizeBusinessDescription(optional(args, 'business-description'));
  if (businessDescription && input.executionMode !== '完整接入') {
    throw new Error('business-description 只允许用于 full_process 的完整接入 handoff');
  }
  const audit = inspectImplementation(variant, projectPath, snapshot, configurationState);
  if (audit.findings.length > 0) {
    const auditItems = audit.findings.map(formatAuditFindingForChecklist).join('；');
    input.overallResult = '未通过';
    input.blockingDefectState = 'PRESENT';
    input.failedItems = input.failedItems && input.failedItems !== '无'
      ? `${input.failedItems}；${auditItems}`
      : auditItems;
    if (input.executionMode === '完整接入') {
      input.nextFlowReminder = '代码开发校验通过后将自动进入支付产品-产品开通；未通过时停留在代码开发。';
    }
  }
  const rendered = renderMessage('integration.checklist.result', variant, input);
  if (input.executionMode === '完整接入') {
    const handoff = fullProcessHandoff(input, { businessDescription });
    process.stderr.write(`${internalPrefix}FULL_PROCESS_INTEGRATION_HANDOFF=${JSON.stringify(handoff)}\n`);
  }
  if (input.executionMode === '仅代码开发') {
    emitTerminalMetric({
      rootIntent: 'integration_only',
      productType: variant,
      ...terminalMetricContextFromArgs(args, {
        rootIntent: 'integration_only',
        terminalReason: terminalReasonForChecklist(input)
      })
    });
  }
  return rendered;
}

export async function runIntegrationMessageCli(argv = process.argv) {
  const { command, args } = parseArgs(argv);
  if (command === 'resolve-project') {
    console.log(runResolveProject(args));
    return;
  }
  if (command === 'locate-projects') {
    console.log(runLocateProjects(args));
    return;
  }
  if (command === 'start-confirm') {
    console.log(createStartConfirmation(args));
    process.stderr.write(`${internalPrefix}CUSTOMER_MESSAGE_DELIVERY_REQUIRED=integration.start.confirm\n`);
    return;
  }
  if (command === 'framework-resolve') {
    console.log(runFrameworkResolve(args));
    return;
  }
  if (command === 'context-required') {
    console.log(runContextRequired(args));
    return;
  }
  if (command === 'product-unsupported') {
    console.log(runProductUnsupported(args));
    return;
  }
  if (command === 'local-acceptance-notice') {
    console.log(runLocalAcceptanceNotice());
    return;
  }
  if (command === 'troubleshooting-terminal') {
    runTroubleshootingTerminal(args);
    return;
  }
  if (command === 'webpay-sandbox-experience') {
    console.log(runWebpaySandboxExperience(args));
    return;
  }
  if (command === 'production-credential-handoff') {
    console.log(runProductionCredentialHandoff(args));
    return;
  }
  if (command === 'credential-field-contract') {
    console.log(runCredentialFieldContract(args));
    return;
  }
  if (command === 'safety-closeout') {
    console.log(runSafetyCloseout(args));
    return;
  }
  if (command === 'checklist-result') {
    const rendered = await runChecklistResult(args);
    if (rendered !== null) console.log(rendered);
    return;
  }
  throw new Error('用法: integration_message_runner.mjs <resolve-project|locate-projects|framework-resolve|start-confirm|context-required|product-unsupported|local-acceptance-notice|troubleshooting-terminal|webpay-sandbox-experience|production-credential-handoff|credential-field-contract|safety-closeout|checklist-result> ...');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runIntegrationMessageCli().catch((error) => {
    console.error(`INTEGRATION_MESSAGE_ERROR:${error.message}`);
    process.exitCode = 1;
  });
}
