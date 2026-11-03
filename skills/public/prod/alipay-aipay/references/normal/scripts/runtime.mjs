#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const referencesDir = path.resolve(scriptDir, '../..');
const flowDirs = Object.freeze({
  integration: path.join(referencesDir, 'integration'),
  onboarding: path.join(referencesDir, 'onboarding')
});

const shellEntrypoints = Object.freeze({
  sandbox: ['integration', 'sandbox_config.sh'],
  'sandbox-check': ['integration', 'sandbox_check.sh'],
  auth: ['onboarding', 'auth.sh'],
  mcc: ['onboarding', 'mcc.sh'],
  screenshots: ['onboarding', 'upload_screenshots.sh'],
  'special-license': ['onboarding', 'upload_special_license.sh'],
  sign: ['onboarding', 'ar_sign_apply.sh'],
  app: ['onboarding', 'app.sh']
});

const publicShellActions = Object.freeze({
  sandbox: Object.freeze(['ensure', 'reverify', 'verify', 'summary']),
  'sandbox-check': Object.freeze(['install-build-guard', 'verify-build-guard', 'development']),
  mcc: Object.freeze(['resolve-plan']),
  app: Object.freeze(['list', 'create-from-snapshot', 'key', 'reconcile-key', 'verify-key', 'verify-key-and-audit', 'audit', 'reuse'])
});

const nodeEntrypoints = Object.freeze({
  telemetry: ['telemetry.mjs', 'runTelemetryCli'],
  flow: ['flow_loader.mjs', 'runFlowCli'],
  'onboarding-message': ['onboarding_message_runner.mjs', 'runOnboardingMessageCli'],
  'integration-message': ['integration_message_runner.mjs', 'runIntegrationMessageCli'],
  render: ['render_customer_message.mjs', 'runRenderCustomerMessageCli'],
  'integration-context': ['integration_context_runner.mjs', 'runIntegrationContextCli'],
  'onboarding-discovery': ['onboarding_discovery_runner.mjs', 'runOnboardingDiscoveryCli'],
  'onboarding-recovery': ['onboarding_recovery_runner.mjs', 'runOnboardingRecoveryCli']
});

export const runtimeDomains = Object.freeze([
  'integration-bootstrap',
  'onboarding-bootstrap',
  'onboarding-execute-ready',
  ...Object.keys(nodeEntrypoints),
  'env',
  ...Object.keys(shellEntrypoints)
]);

function cliArgv(args) {
  return [process.execPath, fileURLToPath(import.meta.url), ...args];
}

function runShell(script, cwd, args) {
  const result = spawnSync('bash', [script, ...args], {
    cwd,
    env: process.env,
    stdio: 'inherit',
    shell: false
  });
  if (result.error) throw result.error;
  process.exitCode = Number.isInteger(result.status) ? result.status : 1;
}

function shellPath(domain) {
  const [flow, basename] = shellEntrypoints[domain];
  const cwd = flowDirs[flow];
  return [path.join(cwd, 'modules/scripts', basename), cwd];
}

function assertPublicShellAction(domain, args) {
  const allowed = publicShellActions[domain];
  if (!allowed) return;
  const action = args[0] || '';
  if (!allowed.includes(action)) {
    throw new Error(`${domain} action 非法；允许值：${allowed.join('、')}`);
  }
}

function runtimeError(domain, error) {
  const message = String(error?.message || error).replace(/[\r\n]/gu, ' ');
  if (domain === 'render') {
    process.stderr.write('当前步骤的标准消息无法安全生成，已停止后续动作。请按 MESSAGE_RENDER_ERROR 的具体原因修正输入；若消息目录或脚本缺失，再检查 Skill 文件完整性。\n');
    process.stderr.write(`MESSAGE_RENDER_ERROR:${message}\n`);
    return;
  }
  const prefixes = {
    flow: 'FLOW_LOADER_ERROR:',
    'onboarding-message': 'ONBOARDING_MESSAGE_ERROR:',
    'integration-message': 'INTEGRATION_MESSAGE_ERROR:',
    'integration-context': 'ALIPAY_AIPAY_INTERNAL:INTEGRATION_CONTEXT_ERROR=',
    'onboarding-discovery': 'ALIPAY_AIPAY_INTERNAL:DISCOVERY_RUNNER_ERROR=',
    'onboarding-recovery': 'ALIPAY_AIPAY_INTERNAL:RECOVERY_RUNNER_ERROR='
  };
  process.stderr.write(`${prefixes[domain] || 'ALIPAY_AIPAY_INTERNAL:RUNTIME_ERROR='}${message}\n`);
}

function parseRuntimeArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith('--')) throw new Error(`未知参数 ${token}`);
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`参数 ${token} 缺少取值`);
    const name = token.slice(2);
    if (Object.prototype.hasOwnProperty.call(parsed, name)) throw new Error(`参数 ${token} 重复`);
    parsed[name] = value;
    index += 1;
  }
  return parsed;
}

function requiredOption(options, name) {
  const value = options[name];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`缺少参数 --${name}`);
  return value;
}

function assertOnlyOptions(options, allowedNames) {
  const allowed = new Set(allowedNames);
  const unknown = Object.keys(options).filter((name) => !allowed.has(name));
  if (unknown.length > 0) throw new Error(`未知参数 --${unknown[0]}`);
}

function assertEnumOption(options, name, allowedValues, { required = true } = {}) {
  if (!Object.prototype.hasOwnProperty.call(options, name)) {
    if (required) throw new Error(`缺少参数 --${name}`);
    return '';
  }
  const value = requiredOption(options, name);
  if (!allowedValues.includes(value)) {
    throw new Error(`参数 --${name} 非法，仅支持 ${allowedValues.join('、')}`);
  }
  return value;
}

async function startTelemetryRun(rootIntent, productType, inputId = '') {
  const telemetryArgs = ['start-run', '--root-intent', rootIntent];
  if (productType) telemetryArgs.push('--product-type', productType);
  if (inputId) telemetryArgs.push('--input-id', inputId);
  const { runTelemetryCli } = await import('./telemetry.mjs');
  await runTelemetryCli(cliArgv(telemetryArgs));
}

async function runIntegrationBootstrap(args) {
  const options = parseRuntimeArgs(args);
  assertOnlyOptions(options, ['root-intent', 'input-id', 'mode']);
  const rootIntent = assertEnumOption(options, 'root-intent', ['integration_only']);
  const mode = assertEnumOption(options, 'mode', ['development', 'troubleshooting'], { required: false }) || 'development';
  await startTelemetryRun(rootIntent, 'webpay', options['input-id']);
  const { runFlowCli } = await import('./flow_loader.mjs');
  runFlowCli(cliArgv(['integration', mode === 'troubleshooting' ? 'troubleshooting' : 'entry']));
}

async function runOnboardingBootstrap(args) {
  const options = parseRuntimeArgs(args);
  assertOnlyOptions(options, ['root-intent', 'input-id']);
  const rootIntent = assertEnumOption(options, 'root-intent', ['onboarding_only']);
  await startTelemetryRun(rootIntent, 'webpay', options['input-id']);
  const { runFlowCli } = await import('./flow_loader.mjs');
  runFlowCli(cliArgv(['onboarding', 'entry']));
}

async function runOnboardingExecuteReady(args) {
  const options = parseRuntimeArgs(args);
  assertOnlyOptions(options, ['product-type']);
  const productType = assertEnumOption(options, 'product-type', ['webpay']);
  const { runFlowCli } = await import('./flow_loader.mjs');
  runFlowCli(cliArgv(['onboarding', 'execute', '--product-type', productType]));
  return dispatch('env', ['check', '--product-type', productType]);
}

async function dispatch(domain, args) {
  if (domain === 'integration-bootstrap') return runIntegrationBootstrap(args);
  if (domain === 'onboarding-bootstrap') return runOnboardingBootstrap(args);
  if (domain === 'onboarding-execute-ready') return runOnboardingExecuteReady(args);
  if (domain === 'auth') {
    const [script, cwd] = shellPath(domain);
    const { runAuthRuntime } = await import('./auth_runtime_runner.mjs');
    process.exitCode = runAuthRuntime(script, cwd, args);
    return;
  }
  if (shellEntrypoints[domain]) {
    assertPublicShellAction(domain, args);
    const [script, cwd] = shellPath(domain);
    return runShell(script, cwd, args);
  }
  if (nodeEntrypoints[domain]) {
    const [moduleName, exportName] = nodeEntrypoints[domain];
    const result = await (await import(`./${moduleName}`))[exportName](cliArgv(args));
    if (domain === 'telemetry') process.exitCode = result;
    return;
  }
  if (domain === 'env') {
    return runShell(path.join(scriptDir, 'alipay_cli_env.sh'), path.dirname(scriptDir), args);
  }
  throw new Error(`用法: runtime.mjs <${runtimeDomains.join('|')}> ...`);
}

export async function runRuntimeCli(argv = process.argv) {
  const domain = argv[2] || '';
  try {
    await dispatch(domain, argv.slice(3));
  } catch (error) {
    runtimeError(domain, error);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runRuntimeCli();
}
