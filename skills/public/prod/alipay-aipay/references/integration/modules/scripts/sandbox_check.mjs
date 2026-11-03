#!/usr/bin/env node
// ALIPAY_AIPAY_MANAGED_SANDBOX_BUILD_GUARD

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const managedGuardBasename = 'alipay-sandbox-check.mjs';
export const sandboxGateway = 'https://openapi-sandbox.dl.alipaydev.com/gateway.do';
const managedGuardHeader = '// ALIPAY_AIPAY_MANAGED_SANDBOX_BUILD_GUARD';
const managedBuildScriptRelative = 'scripts/build.sh';
const nodeSdkConfigBasename = 'alipay-sdk-config.ts';
const buildGuardStart = '# ALIPAY_AIPAY_SANDBOX_BUILD_GUARD:START';
const buildGuardEnd = '# ALIPAY_AIPAY_SANDBOX_BUILD_GUARD:END';
const buildGuardLines = Object.freeze([
  buildGuardStart,
  'if [ "${COZE_PROJECT_ENV:-}" != "DEV" ]; then',
  '  ALIPAY_AIPAY_BUILD_SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)" || exit 1',
  '  ALIPAY_AIPAY_BUILD_ROOT="$(CDPATH= cd -- "${ALIPAY_AIPAY_BUILD_SCRIPT_DIR}/.." && pwd -P)" || exit 1',
  `  if ! node "\${ALIPAY_AIPAY_BUILD_ROOT}/${managedGuardBasename}" production "\${ALIPAY_AIPAY_BUILD_ROOT}" Node.js; then`,
  '    exit 1',
  '  fi',
  'fi',
  buildGuardEnd
]);
const sandboxGatewayCandidatePattern = /(?:https?:\/\/)?(?:openapi\.alipaydev\.com|openapi-sandbox\.dl\.alipaydev\.com)(?:\/[A-Za-z0-9._~!$&()*+=:@%/?#-]*)?/giu;
const findingHints = Object.freeze({
  BUILD_GUARD_BUILD_SCRIPT_MISSING: '保留 Coze 原始构建入口 scripts/build.sh，再重新执行 sandbox-check install-build-guard；不要新建替代构建入口或手写 guard 变体。',
  BUILD_GUARD_BUILD_SCRIPT_SYNTAX_INVALID: '先修复 scripts/build.sh 的 bash 语法，再重新执行 sandbox-check install-build-guard；不要修改受管块之外的业务构建逻辑。',
  BUILD_GUARD_BUILD_SCRIPT_UNSAFE: '把 scripts/build.sh 恢复为项目内普通文件，禁止符号链接或目录；确认后重新执行 sandbox-check install-build-guard。',
  BUILD_GUARD_FILE_CHANGED: `重新执行 sandbox-check install-build-guard 恢复受管 ${managedGuardBasename}；不要手写、裁剪或改名该文件。`,
  BUILD_GUARD_FILE_MISSING: `重新执行 sandbox-check install-build-guard 生成项目根 ${managedGuardBasename}；非 DEV 构建依赖它阻断沙箱误上线。`,
  BUILD_GUARD_FILE_UNSAFE: `删除或改正不安全的 ${managedGuardBasename}，再由 sandbox-check install-build-guard 重新生成普通文件；不要保留符号链接。`,
  BUILD_GUARD_HOOK_MISSING_OR_CHANGED: '重新执行 sandbox-check install-build-guard 恢复 scripts/build.sh 中唯一受管块；受管块必须在 COZE_PROJECT_ENV 非 DEV 时调用项目根 alipay-sandbox-check.mjs 的 production 检查并阻断部署。',
  SANDBOX_CONFIG_IN_PRODUCTION_SOURCE: '生产构建入口里不应再命中沙箱配置文件；如果还需要沙箱开发实现，请把它留在未参与本次非 DEV 构建的路径里。',
  SANDBOX_CONFIG_LOADER_MISSING: `沙箱开发路径必须在 ${nodeSdkConfigBasename} 中读取项目根的 .alipay-sandbox.json；不要把沙箱 appId 或密钥写进源码、环境变量或示例常量。`,
  SANDBOX_GATEWAY_INVALID: `SDK 入口 ${nodeSdkConfigBasename} 的沙箱网关必须完整固定为 ${sandboxGateway}；旧地址、HTTP、仅 hostname 或缺少 /gateway.do 都要替换。`,
  SANDBOX_GATEWAY_MISSING: `沙箱开发路径必须在 ${nodeSdkConfigBasename} 中显式使用固定完整网关 ${sandboxGateway}；不要从 .alipay-sandbox.json 推导网关。`,
  PRODUCTION_CONFIG_FILE_MISSING: `把 Node.js 支付宝 SDK 配置入口 ${nodeSdkConfigBasename} 放回项目中再部署；旧 Python 兼容仍允许 alipay_sdk_config.py。`,
  PRODUCTION_SANDBOX_CONFIG_FORBIDDEN: '把沙箱网关从正式配置文件里移除，或改成正式网关后再部署。',
});

function stripSourceComments(content) {
  const tokens = /"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|\/\/[^\r\n]*/gu;
  return content.replace(tokens, (token) => {
    const isComment = token.startsWith('//') || token.startsWith('/*') || token.startsWith('<!--');
    return isComment ? token.replace(/[^\r\n]/gu, ' ') : token;
  });
}

function sourceLineAt(content, index) {
  return content.slice(0, index).split(/\r?\n/u).length;
}

function safeRelative(projectPath, file) {
  return path.relative(projectPath, file).replaceAll(path.sep, '/').replace(/[\u0000-\u001f\u007f]/gu, '?');
}

function findSandboxGatewayCandidates(content) {
  return [...content.matchAll(sandboxGatewayCandidatePattern)].map((match) => ({
    value: match[0],
    index: match.index || 0
  }));
}

function listProductionConfigFiles(projectPath) {
  const files = [];
  const stack = [projectPath];
  const configBasenames = new Set(['alipay-sdk-config.ts', 'alipay_sdk_config.py']);
  while (stack.length > 0) {
    const directory = stack.pop();
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (!entry.isFile() || !configBasenames.has(entry.name)) continue;
      files.push(entryPath);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function listNodeSdkConfigFiles(projectPath) {
  return listProductionConfigFiles(projectPath)
    .filter((file) => path.basename(file) === nodeSdkConfigBasename);
}

function validateProject(projectPath) {
  if (!path.isAbsolute(projectPath)) throw new Error('项目路径必须为绝对路径');
  const stat = fs.lstatSync(projectPath);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('项目路径必须是可访问的普通目录');
  const canonicalPath = fs.realpathSync(projectPath);
  const packagePath = path.join(canonicalPath, 'package.json');
  const packageStat = fs.lstatSync(packagePath);
  if (!packageStat.isFile() || packageStat.isSymbolicLink()) throw new Error('项目根缺少安全的 package.json');
  return canonicalPath;
}

function finding(code, message, projectPath, file = '', line = 0, hint = '') {
  const result = { code, message };
  if (file) result.path = safeRelative(projectPath, file);
  if (line > 0) result.line = line;
  const resolvedHint = hint || findingHints[code] || '';
  if (resolvedHint) result.hint = resolvedHint;
  return result;
}

function formatFindingForLog(item) {
  const location = item.path ? `（${item.path}${item.line ? `:${item.line}` : ''}）` : '';
  const hint = item.hint ? `；修复提示：${item.hint}` : '';
  return `SANDBOX_CHECK_ERROR:${item.message}${hint}${location}\n`;
}

function formatFindingForError(item) {
  const location = item.path ? `（${item.path}${item.line ? `:${item.line}` : ''}）` : '';
  const hint = item.hint ? `；修复提示：${item.hint}` : '';
  return `${item.message}${hint}${location}`;
}

function managedGuardSource() {
  return fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
}

function isManagedGuardContent(content) {
  const normalized = content.replace(/\r\n/gu, '\n');
  return normalized.startsWith(`#!/usr/bin/env node\n${managedGuardHeader}\n`);
}

function normalizeBuildSource(content) {
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const normalized = content.replace(/\r\n/gu, '\n');
  if (normalized.includes('\r')) throw new Error(`${managedBuildScriptRelative} 包含不支持的混合换行符`);
  return { normalized, newline };
}

function markerIndexes(lines, marker) {
  const indexes = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] === marker) indexes.push(index);
  }
  return indexes;
}

function upsertBuildGuard(content) {
  const { normalized, newline } = normalizeBuildSource(content);
  const lines = normalized.split('\n');
  const starts = markerIndexes(lines, buildGuardStart);
  const ends = markerIndexes(lines, buildGuardEnd);
  if (starts.length !== ends.length || starts.length > 1) {
    throw new Error(`${managedBuildScriptRelative} 中受管沙箱检查标记缺失或重复`);
  }
  if (starts.length === 1) {
    if (starts[0] >= ends[0]) throw new Error(`${managedBuildScriptRelative} 中受管沙箱检查标记顺序非法`);
    lines.splice(starts[0], ends[0] - starts[0] + 1, ...buildGuardLines);
  } else {
    const insertAt = lines[0]?.startsWith('#!') ? 1 : 0;
    lines.splice(insertAt, 0, ...buildGuardLines);
  }
  return lines.join(newline);
}

function atomicWrite(file, content, mode) {
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(temp, content, { encoding: 'utf8', flag: 'wx', mode });
    fs.chmodSync(temp, mode);
    fs.renameSync(temp, file);
  } finally {
    try {
      fs.unlinkSync(temp);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

export function inspectBuildGuard(projectPath) {
  const canonicalPath = validateProject(projectPath);
  const buildPath = path.join(canonicalPath, managedBuildScriptRelative);
  const guardPath = path.join(canonicalPath, managedGuardBasename);
  const findings = [];
  let buildContent = '';

  try {
    const stat = fs.lstatSync(buildPath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      findings.push(finding('BUILD_GUARD_BUILD_SCRIPT_UNSAFE', `${managedBuildScriptRelative} 不是安全的普通文件`, canonicalPath, buildPath));
    } else {
      buildContent = fs.readFileSync(buildPath, 'utf8');
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      findings.push(finding('BUILD_GUARD_BUILD_SCRIPT_MISSING', `缺少 Coze 构建入口 ${managedBuildScriptRelative}，无法安装部署期沙箱检查`, canonicalPath));
    } else {
      throw error;
    }
  }

  if (buildContent) {
    const { normalized } = normalizeBuildSource(buildContent);
    const lines = normalized.split('\n');
    const starts = markerIndexes(lines, buildGuardStart);
    const ends = markerIndexes(lines, buildGuardEnd);
    const exactBlock = starts.length === 1 && ends.length === 1 && starts[0] < ends[0]
      && lines.slice(starts[0], ends[0] + 1).join('\n') === buildGuardLines.join('\n');
    if (!exactBlock) {
      findings.push(finding(
        'BUILD_GUARD_HOOK_MISSING_OR_CHANGED',
        `${managedBuildScriptRelative} 缺少完整受管沙箱检查，或检查内容已被改动`,
        canonicalPath,
        buildPath
      ));
    }
    const syntax = spawnSync('bash', ['-n', buildPath], { encoding: 'utf8', shell: false });
    if (syntax.error || syntax.status !== 0) {
      findings.push(finding(
        'BUILD_GUARD_BUILD_SCRIPT_SYNTAX_INVALID',
        `${managedBuildScriptRelative} 未通过 bash 语法检查`,
        canonicalPath,
        buildPath
      ));
    }
  }

  try {
    const stat = fs.lstatSync(guardPath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      findings.push(finding('BUILD_GUARD_FILE_UNSAFE', `${managedGuardBasename} 不是安全的普通文件`, canonicalPath, guardPath));
    } else if (fs.readFileSync(guardPath, 'utf8') !== managedGuardSource()) {
      findings.push(finding('BUILD_GUARD_FILE_CHANGED', `${managedGuardBasename} 缺失或已被改动`, canonicalPath, guardPath));
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      findings.push(finding('BUILD_GUARD_FILE_MISSING', `缺少受管部署检查 ${managedGuardBasename}`, canonicalPath));
    } else {
      throw error;
    }
  }

  findings.sort((left, right) => `${left.code}:${left.path || ''}:${left.line || 0}`
    .localeCompare(`${right.code}:${right.path || ''}:${right.line || 0}`));
  return { projectPath: canonicalPath, findings };
}

export function installBuildGuard(projectPath) {
  const canonicalPath = validateProject(projectPath);
  const buildPath = path.join(canonicalPath, managedBuildScriptRelative);
  const guardPath = path.join(canonicalPath, managedGuardBasename);
  let buildStat;
  try {
    buildStat = fs.lstatSync(buildPath);
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`缺少 Coze 构建入口 ${managedBuildScriptRelative}，禁止创建无法确认构建命令的占位文件`);
    throw error;
  }
  if (!buildStat.isFile() || buildStat.isSymbolicLink()) throw new Error(`${managedBuildScriptRelative} 必须是已存在且安全的普通文件`);
  const buildBefore = fs.readFileSync(buildPath, 'utf8');
  const buildAfter = upsertBuildGuard(buildBefore);
  const guardSource = managedGuardSource();
  let guardBefore = null;
  const guardMode = 0o644;

  try {
    const guardStat = fs.lstatSync(guardPath);
    if (!guardStat.isFile() || guardStat.isSymbolicLink()) throw new Error(`${managedGuardBasename} 已存在但不是安全的普通文件`);
    guardBefore = fs.readFileSync(guardPath, 'utf8');
    if (!isManagedGuardContent(guardBefore)) {
      throw new Error(`${managedGuardBasename} 已存在且不属于本 Skill，禁止覆盖`);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  let guardWritten = false;
  let buildWritten = false;
  try {
    atomicWrite(guardPath, guardSource, guardMode);
    guardWritten = true;
    atomicWrite(buildPath, buildAfter, buildStat.mode & 0o777);
    buildWritten = true;
    const verification = inspectBuildGuard(canonicalPath);
    if (verification.findings.length > 0) {
      throw new Error(`部署期沙箱检查写后核验失败：${verification.findings.map((item) => formatFindingForError(item)).join('；')}`);
    }
    return verification;
  } catch (error) {
    try {
      if (buildWritten) atomicWrite(buildPath, buildBefore, buildStat.mode & 0o777);
      if (guardWritten) {
        if (guardBefore === null) fs.unlinkSync(guardPath);
        else atomicWrite(guardPath, guardBefore, guardMode);
      }
    } catch {
      throw new Error(`部署期沙箱检查安装失败且回滚未完成：${String(error?.message || error)}`);
    }
    throw error;
  }
}

export function inspectProductionSandboxSafety(projectPath) {
  const canonicalPath = validateProject(projectPath);
  const configFiles = listProductionConfigFiles(canonicalPath);
  const findings = [];
  if (configFiles.length === 0) {
    findings.push(finding(
      'PRODUCTION_CONFIG_FILE_MISSING',
      '未找到支付宝配置文件',
      canonicalPath,
      ''
    ));
  }

  for (const file of configFiles) {
    const content = stripSourceComments(fs.readFileSync(file, 'utf8'));
    const sandboxGatewayCandidates = findSandboxGatewayCandidates(content);
    if (sandboxGatewayCandidates.length === 0) continue;
    findings.push(finding(
      'PRODUCTION_SANDBOX_CONFIG_FORBIDDEN',
      '检测到沙箱环境配置，禁止部署到线上',
      canonicalPath,
      file,
      sourceLineAt(content, sandboxGatewayCandidates[0].index),
      '部署上线时引入了沙箱环境变量（alipaydev.com），线上环境必须使用正式配置。'
    ));
  }

  findings.sort((left, right) => `${left.code}:${left.path || ''}:${left.line || 0}`
    .localeCompare(`${right.code}:${right.path || ''}:${right.line || 0}`));
  return { projectPath: canonicalPath, filesScanned: configFiles.length, findings };
}

export function inspectDevelopmentSandboxSafety(projectPath) {
  const canonicalPath = validateProject(projectPath);
  const configFiles = listNodeSdkConfigFiles(canonicalPath);
  const findings = [];
  if (configFiles.length === 0) {
    findings.push(finding(
      'SANDBOX_CONFIG_LOADER_MISSING',
      `未找到 Node.js 支付宝 SDK 配置入口 ${nodeSdkConfigBasename}`,
      canonicalPath
    ));
  }

  const sources = configFiles.map((file) => {
    const content = stripSourceComments(fs.readFileSync(file, 'utf8'));
    return { file, content, sandboxGateways: findSandboxGatewayCandidates(content) };
  });
  const validSandboxGateways = sources.flatMap(({ file, sandboxGateways }) => sandboxGateways
    .filter(({ value }) => value === sandboxGateway)
    .map((candidate) => ({ file, ...candidate })));
  if (validSandboxGateways.length === 0) {
    findings.push(finding(
      'SANDBOX_GATEWAY_MISSING',
      `未发现固定沙箱网关 ${sandboxGateway}`,
      canonicalPath
    ));
  }

  for (const { file, content, sandboxGateways } of sources) {
    if (sandboxGateways.length === 0) continue;
    const invalidCandidate = sandboxGateways.find((candidate) => candidate.value !== sandboxGateway);
    if (invalidCandidate) {
      findings.push(finding(
        'SANDBOX_GATEWAY_INVALID',
        `SDK 入口 ${nodeSdkConfigBasename} 中的沙箱网关必须为完整固定地址 ${sandboxGateway}`,
        canonicalPath,
        file,
        sourceLineAt(content, invalidCandidate.index)
      ));
    }
  }

  findings.sort((left, right) => `${left.code}:${left.path || ''}:${left.line || 0}`
    .localeCompare(`${right.code}:${right.path || ''}:${right.line || 0}`));
  return { projectPath: canonicalPath, filesScanned: sources.length, findings };
}

function runCli(argv = process.argv) {
  if (argv.length !== 5 || !['development', 'production', 'install-build-guard', 'verify-build-guard'].includes(argv[2]) || argv[4] !== 'Node.js') {
    throw new Error('用法: sandbox_check.sh <development|production|install-build-guard|verify-build-guard> <projectPath> Node.js');
  }
  if (argv[2] === 'install-build-guard') {
    installBuildGuard(argv[3]);
    process.stderr.write('ALIPAY_AIPAY_INTERNAL:SANDBOX_BUILD_GUARD=INSTALLED\n');
    return;
  }
  if (argv[2] === 'verify-build-guard') {
    const verification = inspectBuildGuard(argv[3]);
    if (verification.findings.length > 0) {
      for (const item of verification.findings) {
        process.stderr.write(formatFindingForLog(item));
      }
      process.stderr.write(`ALIPAY_AIPAY_INTERNAL:SANDBOX_BUILD_GUARD=${JSON.stringify({ state: 'BLOCKED', findings: verification.findings })}\n`);
      process.exitCode = 1;
      return;
    }
    process.stderr.write('ALIPAY_AIPAY_INTERNAL:SANDBOX_BUILD_GUARD=VERIFIED\n');
    return;
  }
  const development = argv[2] === 'development';
  const result = development
    ? inspectDevelopmentSandboxSafety(argv[3])
    : inspectProductionSandboxSafety(argv[3]);
  const marker = development ? 'SANDBOX_DEVELOPMENT_CHECK' : 'SANDBOX_DEPLOYMENT_CHECK';
  if (result.findings.length > 0) {
    for (const item of result.findings) {
      process.stderr.write(formatFindingForLog(item));
    }
    process.stderr.write(`ALIPAY_AIPAY_INTERNAL:${marker}=${JSON.stringify({ state: 'BLOCKED', findings: result.findings })}\n`);
    process.exitCode = 1;
    return;
  }
  process.stderr.write(`ALIPAY_AIPAY_INTERNAL:${marker}=PASSED\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`SANDBOX_CHECK_ERROR:${String(error?.message || error).replace(/[\r\n]/gu, ' ')}\n`);
    process.exitCode = 1;
  }
}
