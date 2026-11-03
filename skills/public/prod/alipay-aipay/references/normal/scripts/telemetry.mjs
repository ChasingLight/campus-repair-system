import crypto from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const internalPrefix = 'ALIPAY_AIPAY_INTERNAL:';
const disableValues = new Set(['0', 'false', 'off', 'no']);
const canonicalProductTypes = new Set(['AIPAY', 'WEBPAY', 'APPPAY', 'UNKNOWN']);
const cozeSkillVersion = 'coze_v1';
const allowedRootIntents = new Set(['integration_only', 'onboarding_only', 'full_process']);
const syncLogBizType = 'yuyanmonitorl';
const syncLogServerURL = 'https://collect.alipay.com/yuyan/';
const syncLogMonitorVersion = 'alipay-aipay-skill:sync-log';
const syncLogCode = '1005';
const syncLogMsg = 'alipay_aipay_skill_event';
const syncLogYuyanID = '180020010001290755';
const uploadTimeoutMs = 2500;
const terminalForegroundUploadTimeoutMs = 1200;
const terminalForegroundUploadMaxAttempts = 2;
const terminalForegroundUploadRetryDelayMs = 300;
const terminalBackgroundRetryDelayMs = 1000;
const permissionedForegroundFlushLimit = 5;
const localWriteMaxAttempts = 2;
const terminalCountArgNames = Object.freeze([
  'user-input-count-total',
  'user-input-count-after-flow-start',
  'flow-start-observed'
]);
const terminalReasonValues = new Set([
  'completed',
  'partial_with_remaining_actions',
  'integration_blocked',
  'unsupported_product',
  'unsupported_platform',
  'enterprise_account_unsupported',
  'unknown'
]);
const initialUserInputId = 'run.start';
const outboxFlushLimit = 50;
const outboxClaimTtlMs = 5 * 60 * 1000;
const outboxMaxRecords = 1000;
const outboxMaxAgeMs = 7 * 24 * 60 * 60 * 1000;
const platformProjectIdEnvKeys = Object.freeze(['COZE_PROJECT_ID', 'MEOO_PROJECT_ID']);
const sessionStateEnvKeys = Object.freeze([
  'CODEX_THREAD_ID',
  'CODEX_SESSION_ID',
  'CLAUDE_CODE_SESSION_ID',
  'OPENCLAW_SESSION_ID',
  'CURSOR_SESSION_ID',
  'CURSOR_TRACE_ID',
  'COZE_SESSION_ID',
  'COZE_CONVERSATION_ID',
  'HERMES_SESSION_ID',
  'OPENAI_CONVERSATION_ID',
  'SESSION_ID',
  'CI_JOB_ID'
]);
const permissionedFlushNetworkErrors = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'NETWORK_UNREACHABLE'
]);
const productByVariant = { AIPAY: 'AIPAY', WEBPAY: 'WEBPAY', APPPAY: 'APPPAY' };
const productByName = {
  'AI 按量付费': 'AIPAY',
  'AI 网页应用收款': 'WEBPAY',
  'AI 移动应用收款': 'APPPAY',
  按量付费: 'AIPAY',
  网站支付: 'WEBPAY',
  'APP 支付': 'APPPAY'
};
const productAliases = {
  aipay: 'AIPAY',
  webpay: 'WEBPAY',
  apppay: 'APPPAY',
  unknown: 'UNKNOWN',
  AIPAY: 'AIPAY',
  WEBPAY: 'WEBPAY',
  APPPAY: 'APPPAY',
  UNKNOWN: 'UNKNOWN'
};

export const approvedStages = Object.freeze([
  'run.intent_detected',
  'run.product_clarify.start',
  'integration.context_prepare.start',
  'integration.env_prepare.start',
  'integration.start_confirm.start',
  'integration.user_confirmed',
  'integration.pre_dev_reading.start',
  'integration.code_dev.start',
  'integration.local_verify.start',
  'integration.sandbox_acceptance.start',
  'integration.checklist.start',
  'integration.closeout.start',
  'onboarding.mcc_prepare.start',
  'onboarding.plan_confirm.start',
  'onboarding.user_confirmed',
  'onboarding.auth.start',
  'onboarding.discovery.start',
  'onboarding.branch_summary.start',
  'onboarding.material_collect.start',
  'onboarding.signing.start',
  'onboarding.service.start',
  'onboarding.application.start',
  'onboarding.closeout.start',
  'run.terminal'
]);

const stageRules = new Map(approvedStages.map((stage) => [stage, {
  stage,
  flow: stage.startsWith('integration.')
    ? 'integration'
    : stage.startsWith('onboarding.')
      ? 'onboarding'
      : 'common'
}]));

const messageStageRules = {
  'product.unsupported': 'run.terminal',
  'product.clarify': 'run.product_clarify.start',

  'integration.project_path.required': 'integration.context_prepare.start',
  'integration.context.required': 'integration.context_prepare.start',
  'integration.project_candidates.select': 'integration.context_prepare.start',
  'integration.start.confirm': 'integration.start_confirm.start',
  'integration.checklist.result': 'integration.closeout.start',

  'onboarding.windows.redirect': 'run.terminal',
  'onboarding.enterprise.unsupported': 'run.terminal',
  'onboarding.plan.confirm': 'onboarding.plan_confirm.start',
  'onboarding.discovery.summary': 'onboarding.branch_summary.start',
  'materials.category.collect': 'onboarding.material_collect.start',
  'process.partial_result': 'onboarding.closeout.start'
};

const outboxRecordFields = new Set(['schema_ver', 'created_at', 'event']);
const metricEventFields = new Set([
  'schema_ver',
  'event_id',
  'skill',
  'skill_version',
  'run_id',
  'stage',
  'timestamp',
  'flow',
  'product_type',
  'root_intent',
  'ext_info'
]);
const terminalExtInfoFields = new Set([
  'user_input_count_total',
  'user_input_count_after_flow_start',
  'flow_start_observed',
  'root_intent',
  'terminal_reason'
]);

function safeText(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]+$/.test(value) ? value : '';
}

function safeDimension(value, fallback = 'unknown', maxLength = 80) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().replace(/[,\^=\r\n]/g, '_');
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLength);
}

function failedResult(error, code = 'REQUEST_ERROR', message = 'request error') {
  return {
    ok: false,
    error_code: safeDimension(error?.code || error?.name || code, code, 80),
    error_message: safeDimension(error?.message || message, message, 240)
  };
}

function normalizeSwitch(value) {
  return String(value || '').trim().toLowerCase();
}

export function telemetryEnabled(env = process.env) {
  return !disableValues.has(normalizeSwitch(env.ALIPAY_AIPAY_TELEMETRY));
}

function telemetryCaptureOnly(env = process.env) {
  return normalizeSwitch(env.ALIPAY_AIPAY_TELEMETRY_CAPTURE_ONLY) === '1';
}

export function telemetryUploadEnabled(env = process.env) {
  return telemetryEnabled(env)
    && !telemetryCaptureOnly(env)
    && !disableValues.has(normalizeSwitch(env.ALIPAY_AIPAY_TELEMETRY_UPLOAD))
    && !isMaintenanceProcess(env);
}

function scriptPath() {
  return fileURLToPath(import.meta.url);
}

function scriptDir() {
  return path.dirname(scriptPath());
}

function skillRoot() {
  return path.resolve(scriptDir(), '../../..');
}

function telemetryRoot() {
  return path.join(os.tmpdir(), 'alipay-aipay-telemetry');
}

function isMaintenanceProcess(env = process.env, argv = process.argv) {
  if (normalizeSwitch(env.ALIPAY_AIPAY_TELEMETRY_ALLOW_MAINTENANCE) === '1') return false;
  if (env.NODE_TEST_CONTEXT) return true;
  if (env.npm_lifecycle_event === 'test') return true;
  return argv.some((arg) => /(^|[/\\])test[/\\].+\.test\.mjs$/u.test(String(arg || '')));
}

function stableStateSource(env = process.env) {
  return env.ALIPAY_AIPAY_SESSION_ID || platformProjectRunId(env) || sessionStateEnvKeys.map((key) => env[key]).find(Boolean) || '';
}

function stateKeyFromSource(source) {
  if (!source) return 'default';
  if (safeText(source) && source.length <= 128) return source;
  return `key-${crypto.createHash('sha256').update(source).digest('hex')}`;
}

function stableStateKey(env = process.env) {
  return stateKeyFromSource(stableStateSource(env));
}

function stateDir(env = process.env) {
  if (env.ALIPAY_AIPAY_TELEMETRY_DIR) return env.ALIPAY_AIPAY_TELEMETRY_DIR;
  return telemetryRoot();
}

function runStatePath(env = process.env) {
  if (env.ALIPAY_AIPAY_RUN_STATE_FILE) return env.ALIPAY_AIPAY_RUN_STATE_FILE;
  return path.join(stateDir(env), `${stableStateKey(env)}.json`);
}

function outboxDir(env = process.env) {
  if (env.ALIPAY_AIPAY_TELEMETRY_OUTBOX_DIR) return env.ALIPAY_AIPAY_TELEMETRY_OUTBOX_DIR;
  return path.join(stateDir(env), 'outbox');
}

function uploadStatusPath(env = process.env) {
  if (env.ALIPAY_AIPAY_TELEMETRY_UPLOAD_STATUS_FILE) return env.ALIPAY_AIPAY_TELEMETRY_UPLOAD_STATUS_FILE;
  return path.join(stateDir(env), 'upload-status.json');
}

export function telemetryStoragePaths(env = process.env) {
  return {
    state_dir: stateDir(env),
    run_state_file: runStatePath(env),
    outbox_dir: outboxDir(env),
    upload_status_file: uploadStatusPath(env)
  };
}

function ensurePrivateDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dir, 0o700);
  } catch {}
}

function writePrivateJsonOnce(file, value) {
  let tempPath = '';
  try {
    ensurePrivateDir(path.dirname(file));
    tempPath = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
    fs.writeFileSync(tempPath, `${JSON.stringify(value)}\n`, { mode: 0o600 });
    try {
      fs.chmodSync(tempPath, 0o600);
    } catch {}
    fs.renameSync(tempPath, file);
    return true;
  } catch {
    try {
      if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {}
    return false;
  }
}

function writePrivateJson(file, value) {
  for (let attempt = 0; attempt < localWriteMaxAttempts; attempt += 1) {
    if (writePrivateJsonOnce(file, value)) return true;
  }
  return false;
}

function readRunState(env = process.env) {
  try {
    const statePath = runStatePath(env);
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.schema_ver !== 1) return null;
    if (!safeRunId(parsed.run_id)) return null;
    const createdAt = Number(parsed.created_at);
    const updatedAt = Number(parsed.updated_at);
    if (!Number.isFinite(createdAt) || createdAt <= 0) return null;
    if (!Number.isFinite(updatedAt) || updatedAt <= 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function currentRunContext(env = process.env) {
  const state = readRunState(env);
  if (!state) return null;
  return Object.freeze({
    run_id: state.run_id,
    root_intent: state.root_intent,
    product_type: state.product_type,
    terminal: state.terminal === true
  });
}

function canReadImplicitRunState(env = process.env) {
  return !isMaintenanceProcess(env);
}

function recordLocalTelemetryFailure(errorCode, message, env = process.env) {
  const safeCode = safeDimension(errorCode, 'LOCAL_TELEMETRY_FAILED', 80);
  const safeMessage = safeDimension(message || safeCode, safeCode, 240);
  writeUploadStatus({
    status: 'local_failed',
    error_code: safeCode,
    error_message: safeMessage
  }, env);
  emitTelemetryError(new Error(safeCode));
}

function writeRunState(state, env = process.env) {
  return writePrivateJson(runStatePath(env), state);
}

function persistRunState(state, env = process.env) {
  const persisted = writeRunState(state, env);
  if (!persisted && telemetryEnabled(env)) {
    recordLocalTelemetryFailure('LOCAL_RUN_STATE_WRITE_FAILED', 'failed to write local telemetry run state', env);
  }
  return persisted;
}

function outboxFilename(event) {
  const timestamp = Number.isFinite(Number(event?.timestamp)) ? String(Number(event.timestamp)) : String(Date.now());
  const eventID = safeText(event?.event_id) || crypto.randomUUID();
  return `${timestamp}-${eventID}.json`;
}

function writeOutboxRecord(event, env = process.env) {
  try {
    const normalizedEvent = normalizeMetricEvent(event);
    if (!normalizedEvent) return '';
    const dir = outboxDir(env);
    ensurePrivateDir(dir);
    const filename = outboxFilename(normalizedEvent);
    const finalPath = path.join(dir, filename);
    if (!writePrivateJson(finalPath, {
      schema_ver: 1,
      created_at: Date.now(),
      event: normalizedEvent
    })) return '';
    pruneOutbox(env);
    return finalPath;
  } catch {
    return '';
  }
}

export function enqueueMetricEvent(event, env = process.env) {
  return Boolean(writeOutboxRecord(event, env));
}

function safeRunId(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  return /[\u0000-\u001f\u007f,^=]/u.test(value) ? '' : value;
}

function platformProjectRunId(env = process.env) {
  for (const key of platformProjectIdEnvKeys) {
    const value = safeRunId(env[key]);
    if (value) return value;
  }
  if (env.MIAODA) {
    return safeRunId(env.VITE_APP_ID) || safeRunId(env.PLATFORM_ID) || '';
  }
  return '';
}

function explicitRunIdFrom(context, env) {
  return safeRunId(context.runId || context.run_id || env.ALIPAY_AIPAY_RUN_ID || env.ALIPAY_AIPAY_FLOW_RUN_ID);
}

function runIdFrom(context, env) {
  const state = canReadImplicitRunState(env) ? readRunState(env) : null;
  return safeRunId(platformProjectRunId(env) || explicitRunIdFrom(context, env) || state?.run_id);
}

function rootIntentFrom(context, env) {
  const state = canReadImplicitRunState(env) ? readRunState(env) : null;
  const value = context.rootIntent || context.root_intent || env.ALIPAY_AIPAY_ROOT_INTENT || state?.root_intent;
  return allowedRootIntents.has(value) ? value : '';
}

function canonicalProductType(value) {
  return typeof value === 'string' && productAliases[value] ? productAliases[value] : '';
}

function productTypeFrom({ ruleProductType, variantName, variables = {}, context = {}, env = process.env }) {
  const explicit = context.productType || context.product_type || ruleProductType;
  const explicitCanonical = canonicalProductType(explicit);
  if (explicitCanonical) return explicitCanonical;
  const variableCanonical = canonicalProductType(variables.productType);
  if (variableCanonical) return variableCanonical;
  if (productByVariant[variantName]) return productByVariant[variantName];
  if (productByName[variables.productName]) return productByName[variables.productName];
  if (productByName[context.productName]) return productByName[context.productName];
  const stateCanonical = canReadImplicitRunState(env) ? canonicalProductType(readRunState(env)?.product_type) : '';
  if (stateCanonical) return stateCanonical;
  const envCanonical = canonicalProductType(env.ALIPAY_AIPAY_PRODUCT_TYPE);
  if (envCanonical) return envCanonical;
  return 'UNKNOWN';
}

function parseNonNegativeInteger(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? value : null;
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function sleepSync(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return;
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(ms, 30000));
  } catch {}
}

function parseBooleanFlag(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;
  const normalized = normalizeSwitch(value);
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return null;
}

function normalizeTerminalReason(value) {
  if (typeof value !== 'string' || !value) return 'unknown';
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return terminalReasonValues.has(normalized) ? normalized : '';
}

function normalizeUserInputId(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text || text.length > 256 || /[\u0000-\u001f\u007f]/u.test(text)) return '';
  return text;
}

function userInputHash(inputId, runId) {
  const normalized = normalizeUserInputId(inputId);
  if (!normalized || !safeRunId(runId)) return '';
  return crypto.createHash('sha256').update(`${runId}\u0000${normalized}`).digest('hex').slice(0, 32);
}

function normalizeUserInputHashes(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry) => typeof entry === 'string' && /^[a-f0-9]{32}$/u.test(entry)))];
}

function normalizeUserInputCounts(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { total: 0, after_flow_start: 0, flow_start_observed: false, input_hashes: [] };
  }
  const total = parseNonNegativeInteger(value.total ?? value.user_input_count_total);
  const afterFlowStart = parseNonNegativeInteger(value.after_flow_start ?? value.user_input_count_after_flow_start);
  const flowStartObserved = parseBooleanFlag(value.flow_start_observed);
  if (total === null || afterFlowStart === null || flowStartObserved === null) {
    return { total: 0, after_flow_start: 0, flow_start_observed: false, input_hashes: [] };
  }
  return {
    total,
    after_flow_start: Math.min(afterFlowStart, total),
    flow_start_observed: flowStartObserved,
    input_hashes: normalizeUserInputHashes(value.input_hashes),
    flow_start_observed_at: parseNonNegativeInteger(value.flow_start_observed_at) || undefined,
    updated_at: parseNonNegativeInteger(value.updated_at) || undefined
  };
}

function validateTerminalCountPayload(payload = {}, env = process.env, { strict = false } = {}) {
  const fail = (message) => {
    if (strict) throw new Error(message);
    return null;
  };
  const total = parseNonNegativeInteger(payload.userInputCountTotal ?? payload.user_input_count_total);
  const afterFlowStart = parseNonNegativeInteger(
    payload.userInputCountAfterFlowStart ?? payload.user_input_count_after_flow_start
  );
  const flowStartObserved = parseBooleanFlag(payload.flowStartObserved ?? payload.flow_start_observed);
  const rootIntent = rootIntentFrom(payload, env);
  if (total === null || afterFlowStart === null || flowStartObserved === null) {
    return fail('终态用户输入计数必须是合法非负整数，flow-start-observed 必须是 true/false');
  }
  if (total < 1) return fail('终态 user_input_count_total 必须至少包含触发当前 run 的用户输入');
  if (!rootIntent) return fail('终态用户输入计数缺少合法 root_intent');
  if (afterFlowStart > total) return fail('终态 user_input_count_after_flow_start 不能大于 user_input_count_total');
  if (flowStartObserved && afterFlowStart >= total) {
    return fail('终态 flow start 已观测时，after-flow 用户输入数必须小于 total；请重新核对 before-flow/after-flow 分界');
  }
  if (!flowStartObserved && afterFlowStart !== 0) {
    return fail('终态 flow start 未观测时，after-flow 用户输入数必须为 0');
  }
  return { total, afterFlowStart, flowStartObserved, rootIntent };
}

function initialUserInputCounts(nowMs = Date.now(), inputId = initialUserInputId, runId = '') {
  return {
    total: 1,
    after_flow_start: 0,
    flow_start_observed: false,
    input_hashes: [userInputHash(inputId, runId) || userInputHash(initialUserInputId, runId)].filter(Boolean),
    updated_at: nowMs
  };
}

function addUserInputCount(counts, phase, inputId, runId, nowMs = Date.now()) {
  const inputHash = userInputHash(inputId, runId);
  if (!inputHash || counts.input_hashes.includes(inputHash)) return counts;
  return {
    ...counts,
    total: counts.total + 1,
    after_flow_start: counts.after_flow_start + (phase === 'after-flow' ? 1 : 0),
    input_hashes: [...counts.input_hashes, inputHash],
    updated_at: nowMs
  };
}

function publicUserInputCountState(counts) {
  if (!counts) return null;
  const normalized = normalizeUserInputCounts(counts);
  return {
    total: normalized.total,
    after_flow_start: normalized.after_flow_start,
    flow_start_observed: normalized.flow_start_observed,
    tracked_inputs: normalized.input_hashes.length
  };
}

function terminalExtInfoFromPayload(payload = {}, env = process.env) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '';
  const counts = validateTerminalCountPayload(payload, env);
  if (!counts) return '';
  const terminalReason = normalizeTerminalReason(payload.terminalReason ?? payload.terminal_reason);
  if (!terminalReason) return '';
  return JSON.stringify({
    user_input_count_total: counts.total,
    user_input_count_after_flow_start: counts.afterFlowStart,
    flow_start_observed: counts.flowStartObserved,
    root_intent: counts.rootIntent,
    terminal_reason: terminalReason
  });
}

function terminalExtInfoFromEvent(event) {
  if (event?.stage !== 'run.terminal') return '';
  const withEventRoot = (payload) => terminalExtInfoFromPayload({
    rootIntent: event.root_intent || event.rootIntent,
    ...(payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {})
  }, {});
  if (typeof event.ext_info === 'string') {
    try {
      return withEventRoot(JSON.parse(event.ext_info));
    } catch {
      return '';
    }
  }
  return withEventRoot(event?.ext_info);
}

export function stageMetricEvent(stage, context = {}, nowMs = Date.now(), env = process.env) {
  const rule = stageRules.get(stage);
  if (!rule) return null;
  const state = canReadImplicitRunState(env) ? readRunState(env) : null;
  const explicitRunId = platformProjectRunId(env) || explicitRunIdFrom(context, env);
  if (state && (!explicitRunId || explicitRunId === state.run_id) && !runStateCompatibleWithEventContext(state, context)) {
    return null;
  }
  const runId = runIdFrom(context, env);
  if (!runId) return null;
  const event = {
    schema_ver: 2,
    event_id: crypto.randomUUID(),
    skill: 'alipay-aipay',
    skill_version: cozeSkillVersion,
    run_id: runId,
    stage: rule.stage,
    timestamp: nowMs,
    flow: rule.flow,
    product_type: productTypeFrom({ ruleProductType: context.productType || context.product_type, context, env })
  };
  if (!canonicalProductTypes.has(event.product_type)) event.product_type = 'UNKNOWN';
  const rootIntent = rootIntentFrom(context, env);
  if (rootIntent) event.root_intent = rootIntent;
  if (event.stage === 'run.terminal') {
    const extInfo = terminalExtInfoFromPayload(context, env);
    if (extInfo) event.ext_info = extInfo;
  }
  return event;
}

export function messageMetricEvent(messageId, variantName, variables = {}, context = {}, nowMs = Date.now(), env = process.env) {
  const stage = messageStageRules[messageId];
  if (!stage) return null;
  const stageEvent = stageMetricEvent(stage, {
    ...context,
    productType: productTypeFrom({ variantName, variables, context, env })
  }, nowMs, env);
  return stageEvent;
}

function scheduleQueuedSyncLogUpload(event, queuedFile, env = process.env) {
  if (!queuedFile || !telemetryUploadEnabled(env)) return false;
  if (event?.stage === 'run.terminal') {
    if (foregroundFlushTerminalOutboxFile(queuedFile, env)) {
      if (outboxFiles(env).length > 0) {
        spawnOutboxFlush(env, { delayMs: terminalBackgroundRetryDelayMs });
      }
    } else {
      spawnOutboxFlush(env, { delayMs: terminalBackgroundRetryDelayMs });
      emitPermissionedFlushNeededMarkers(env);
    }
    return true;
  }
  spawnOutboxFlush(env);
  return true;
}

function writeMetricEventMarker(event, stream) {
  if (stream && typeof stream.write === 'function') {
    stream.write(`${internalPrefix}METRIC_EVENT=${JSON.stringify(event)}\n`);
  }
}

export function emitMetricEvent(event, { env = process.env, stream = process.stderr, upload = true } = {}) {
  if (!telemetryEnabled(env)) return false;
  const normalizedEvent = normalizeMetricEvent(event);
  if (!normalizedEvent) return false;
  writeMetricEventMarker(normalizedEvent, stream);
  if (!upload) return true;
  if (telemetryCaptureOnly(env)) {
    if (writeOutboxRecord(normalizedEvent, env)) return true;
    recordLocalTelemetryFailure('LOCAL_OUTBOX_WRITE_FAILED', 'outbox write failed', env);
    return false;
  }
  if (!telemetryUploadEnabled(env)) return true;
  const queuedFile = writeOutboxRecord(normalizedEvent, env);
  if (!queuedFile) {
    recordLocalTelemetryFailure('LOCAL_OUTBOX_WRITE_FAILED', 'outbox write failed', env);
    return false;
  }
  scheduleQueuedSyncLogUpload(normalizedEvent, queuedFile, env);
  return true;
}

function emitTerminalMetricEvent(event, { env = process.env, stream = null } = {}) {
  if (!event || event.stage !== 'run.terminal') return false;
  if (!telemetryEnabled(env)) return updateExistingRunStateFromTerminalEvent(event, env);
  writeMetricEventMarker(event, stream);

  let queuedFile = '';
  const requiresOutbox = telemetryCaptureOnly(env) || telemetryUploadEnabled(env);
  if (requiresOutbox) {
    queuedFile = writeOutboxRecord(event, env);
    if (!queuedFile) {
      recordLocalTelemetryFailure('LOCAL_OUTBOX_WRITE_FAILED', 'outbox write failed', env);
      return false;
    }
  }

  const statePersisted = updateExistingRunStateFromTerminalEvent(event, env);
  if (queuedFile && telemetryUploadEnabled(env)) {
    scheduleQueuedSyncLogUpload(event, queuedFile, env);
  }
  return statePersisted;
}

export function emitStageMetricAsync(stage, context = {}, env = process.env) {
  try {
    if (!telemetryEnabled(env) || !stageRules.has(stage) || stage === 'run.terminal') return false;
    const event = stageMetricEvent(stage, context, Date.now(), env);
    if (!event) return false;
    if (normalizeSwitch(env.ALIPAY_AIPAY_TEST_MODE) === '1') {
      return emitMetricEvent(event, { env });
    }
    const args = [scriptPath(), 'stage', event.stage, '--timestamp-ms', String(event.timestamp)];
    const options = [
      ['run-id', event.run_id],
      ['root-intent', event.root_intent],
      ['product-type', event.product_type]
    ];
    for (const [name, value] of options) {
      if (typeof value === 'string' && value) args.push(`--${name}`, value);
    }
    const child = spawn(process.execPath, args, {
      detached: true,
      stdio: 'ignore',
      env
    });
    child.on('error', (error) => {
      recordLocalTelemetryFailure(
        safeDimension(error?.code || error?.name || 'TELEMETRY_STAGE_SPAWN_FAILED', 'TELEMETRY_STAGE_SPAWN_FAILED', 80),
        safeDimension(error?.message || 'failed to start telemetry stage process', 'failed to start telemetry stage process', 240),
        env
      );
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

export function emitMessageMetric(messageId, variantName, variables = {}, context = {}) {
  try {
    const event = messageMetricEvent(messageId, variantName, variables, context);
    if (event?.stage === 'run.terminal') {
      return emitTerminalMetricEvent(event, { stream: null });
    }
    return emitMetricEvent(event, { stream: null });
  } catch {
    return false;
  }
}

export function emitTerminalMetric(context = {}, env = process.env) {
  try {
    const event = stageMetricEvent('run.terminal', context, Date.now(), env);
    return emitTerminalMetricEvent(event, { env, stream: null });
  } catch {
    return false;
  }
}

function parseCliArgs(argv) {
  const command = argv[2];
  const args = { _: [] };
  for (let index = 3; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const name = token.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`参数 --${name} 缺少取值`);
    args[name] = value;
    index += 1;
  }
  return { command, args };
}

export function terminalMetricContextFromArgs(args, context = {}) {
  const optional = (name) => {
    const value = args[name];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  };
  const terminalReason = normalizeTerminalReason(
    optional('terminal-reason') ?? context.terminalReason ?? context.terminal_reason
  );
  if (!terminalReason) throw new Error('--terminal-reason 不在允许枚举中');
  const reasonContext = { terminalReason };
  const hasCountArg = terminalCountArgNames.some((name) => Object.prototype.hasOwnProperty.call(args, name));
  if (hasCountArg) {
    const missing = terminalCountArgNames.filter((name) => optional(name) === undefined);
    if (missing.length > 0) throw new Error(`终态用户输入计数参数必须同时提供，缺少 --${missing[0]}`);
    const counts = validateTerminalCountPayload({
      userInputCountTotal: optional('user-input-count-total'),
      userInputCountAfterFlowStart: optional('user-input-count-after-flow-start'),
      flowStartObserved: optional('flow-start-observed'),
      rootIntent: args['root-intent'] || args.rootIntent || args.root_intent || context.rootIntent || context.root_intent
    }, process.env, { strict: true });
    return {
      rootIntent: counts.rootIntent,
      userInputCountTotal: counts.total,
      userInputCountAfterFlowStart: counts.afterFlowStart,
      flowStartObserved: counts.flowStartObserved,
      ...reasonContext
    };
  }
  const state = readRunState(process.env);
  const stored = normalizeUserInputCounts(state?.user_input_counts);
  if (stored.total < 1) {
    const fallbackCounts = validateTerminalCountPayload({
      userInputCountTotal: 1,
      userInputCountAfterFlowStart: 0,
      flowStartObserved: Boolean(stored.flow_start_observed),
      rootIntent: state?.root_intent
    }, process.env);
    if (!fallbackCounts) return {};
    return {
      rootIntent: fallbackCounts.rootIntent,
      userInputCountTotal: fallbackCounts.total,
      userInputCountAfterFlowStart: fallbackCounts.afterFlowStart,
      flowStartObserved: fallbackCounts.flowStartObserved,
      ...reasonContext
    };
  }
  const counts = validateTerminalCountPayload({
    userInputCountTotal: stored.total,
    userInputCountAfterFlowStart: stored.after_flow_start,
    flowStartObserved: stored.flow_start_observed,
    rootIntent: state?.root_intent
  }, process.env);
  if (!counts) return {};
  return {
    rootIntent: counts.rootIntent,
    userInputCountTotal: counts.total,
    userInputCountAfterFlowStart: counts.afterFlowStart,
    flowStartObserved: counts.flowStartObserved,
    ...reasonContext
  };
}

function contextFromCliArgs(args) {
  const context = {
    runId: args['run-id'],
    rootIntent: args['root-intent'],
    productType: args['product-type'],
    productName: args['product-name']
  };
  if (args._[0] !== 'run.terminal') return context;
  return {
    ...context,
    ...terminalMetricContextFromArgs(args, context)
  };
}

function timestampFromCliArgs(args) {
  if (args['timestamp-ms'] === undefined) return Date.now();
  const value = Number(args['timestamp-ms']);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('--timestamp-ms 必须是正整数毫秒时间戳');
  return value;
}

function assertCliArgs(args, allowedOptions, positionalCount) {
  for (const name of Object.keys(args)) {
    if (name !== '_' && !allowedOptions.has(name)) throw new Error(`不支持参数 --${name}`);
  }
  if (args._.length !== positionalCount) throw new Error('invalid telemetry arguments');
}

function createRunState(args, env = process.env, nowMs = Date.now()) {
  const runId = platformProjectRunId(env) || safeRunId(args['run-id']) || crypto.randomUUID();
  const rootIntent = args['root-intent'];
  if (!allowedRootIntents.has(rootIntent)) throw new Error('--root-intent 仅支持 integration_only、onboarding_only、full_process');
  const productType = canonicalProductType(args['product-type']) || 'UNKNOWN';
  return {
    schema_ver: 1,
    run_id: runId,
    root_intent: rootIntent,
    product_type: productType,
    user_input_counts: initialUserInputCounts(nowMs, args['input-id'] || initialUserInputId, runId),
    created_at: nowMs,
    updated_at: nowMs
  };
}

function withInitialUserInputCount(state, nowMs = Date.now(), inputId = initialUserInputId) {
  const counts = normalizeUserInputCounts(state?.user_input_counts);
  if (counts.total >= 1) return state;
  return {
    ...state,
    user_input_counts: initialUserInputCounts(nowMs, inputId, state.run_id),
    updated_at: nowMs
  };
}

function withCurrentUserInputCount(state, nowMs = Date.now(), inputId = '') {
  const normalizedInputId = normalizeUserInputId(inputId);
  const counts = normalizeUserInputCounts(state?.user_input_counts);
  if (counts.total < 1) return withInitialUserInputCount(state, nowMs, normalizedInputId || initialUserInputId);
  if (!normalizedInputId) return state;
  const nextCounts = addUserInputCount(
    counts,
    counts.flow_start_observed ? 'after-flow' : 'before-flow',
    normalizedInputId,
    state.run_id,
    nowMs
  );
  if (nextCounts === counts) return state;
  return {
    ...state,
    user_input_counts: nextCounts,
    updated_at: nowMs
  };
}

function compatibleProductType(existingProductType, requestedProductType) {
  const existing = canonicalProductType(existingProductType) || 'UNKNOWN';
  const requested = canonicalProductType(requestedProductType) || 'UNKNOWN';
  return existing === requested || existing === 'UNKNOWN' || requested === 'UNKNOWN';
}

function runStateCompatibleWithEventContext(state, context = {}) {
  if (!state) return true;
  const requestedRootIntent = context.rootIntent || context.root_intent;
  if (requestedRootIntent && state.root_intent && state.root_intent !== requestedRootIntent) return false;
  const requestedProductType = canonicalProductType(context.productType || context.product_type);
  if (requestedProductType && !compatibleProductType(state.product_type, requestedProductType)) return false;
  return true;
}

function mergeProductType(existingProductType, requestedProductType) {
  const existing = canonicalProductType(existingProductType) || 'UNKNOWN';
  const requested = canonicalProductType(requestedProductType) || 'UNKNOWN';
  if (existing === 'UNKNOWN' && requested !== 'UNKNOWN') return requested;
  if (requested === 'UNKNOWN' && existing !== 'UNKNOWN') return existing;
  return requested;
}

function reusableRunState(existing, requestedRootIntent, requestedProductType) {
  if (!existing || existing.terminal) return false;
  if (existing.root_intent !== requestedRootIntent) return false;
  return compatibleProductType(existing.product_type, requestedProductType);
}

function createOrReuseRunState(args, env = process.env, nowMs = Date.now()) {
  const rootIntent = args['root-intent'];
  if (!allowedRootIntents.has(rootIntent)) throw new Error('--root-intent 仅支持 integration_only、onboarding_only、full_process');
  const requestedProductType = canonicalProductType(args['product-type']) || 'UNKNOWN';
  const requestedRunId = platformProjectRunId(env) || safeRunId(args['run-id']);
  const existing = readRunState(env);
  if (reusableRunState(existing, rootIntent, requestedProductType) && (!requestedRunId || existing.run_id === requestedRunId)) {
    return withCurrentUserInputCount({
      ...existing,
      root_intent: rootIntent,
      product_type: mergeProductType(existing.product_type, requestedProductType),
      updated_at: nowMs
    }, nowMs, args['input-id']);
  }
  return createRunState(args, env, nowMs);
}

function withFlowStartObserved(state, nowMs = Date.now()) {
  const counts = normalizeUserInputCounts(state.user_input_counts);
  return {
    ...state,
    user_input_counts: {
      ...counts,
      flow_start_observed: true,
      flow_start_observed_at: counts.flow_start_observed_at || nowMs,
      updated_at: nowMs
    }
  };
}

export function markTelemetryFlowStart(env = process.env, nowMs = Date.now(), productType = '') {
  if (!telemetryEnabled(env)) return null;
  const existing = readRunState(env);
  if (!existing?.run_id || existing.terminal) return null;
  const requestedProductType = canonicalProductType(productType);
  if (requestedProductType && !compatibleProductType(existing.product_type, requestedProductType)) return null;
  const next = withFlowStartObserved({
    ...existing,
    product_type: requestedProductType
      ? mergeProductType(existing.product_type, requestedProductType)
      : existing.product_type,
    updated_at: nowMs
  }, nowMs);
  return persistRunState(next, env) ? next.user_input_counts : null;
}

export function recordTelemetryUserInput(phase, env = process.env, nowMs = Date.now(), inputId = '') {
  if (!telemetryEnabled(env)) return null;
  if (!['before-flow', 'after-flow'].includes(phase)) {
    throw new Error('--phase 仅支持 before-flow、after-flow');
  }
  const normalizedInputId = normalizeUserInputId(inputId);
  if (!normalizedInputId) throw new Error('用户输入计数必须提供本地幂等 --input-id，且不得包含用户输入原文或敏感信息');
  const existing = readRunState(env);
  if (!existing?.run_id || existing.terminal) return null;
  const counts = normalizeUserInputCounts(existing.user_input_counts);
  if (phase === 'before-flow' && counts.flow_start_observed) {
    throw new Error('当前 run 已观测 flow start，后续用户输入必须记录为 after-flow');
  }
  if (phase === 'after-flow' && !counts.flow_start_observed) {
    throw new Error('当前 run 尚未观测 flow start，不能记录 after-flow 用户输入');
  }
  const inputHash = userInputHash(normalizedInputId, existing.run_id);
  if (!inputHash) throw new Error('用户输入计数 input-id 无法生成本地幂等键');
  if (counts.input_hashes.includes(inputHash)) return counts;
  const nextCounts = addUserInputCount(counts, phase, normalizedInputId, existing.run_id, nowMs);
  const next = {
    ...existing,
    user_input_counts: nextCounts,
    updated_at: nowMs
  };
  return persistRunState(next, env) ? nextCounts : null;
}

export function recordTelemetryUserInputForCurrentPhase(inputId, env = process.env, nowMs = Date.now()) {
  if (!telemetryEnabled(env)) return null;
  const existing = readRunState(env);
  if (!existing?.run_id || existing.terminal) return null;
  const counts = normalizeUserInputCounts(existing.user_input_counts);
  return recordTelemetryUserInput(counts.flow_start_observed ? 'after-flow' : 'before-flow', env, nowMs, inputId);
}

function updateExistingRunStateFromTerminalEvent(event, env = process.env) {
  if (event?.stage !== 'run.terminal') return false;
  const existing = readRunState(env);
  if (!existing) return true;
  if (existing.run_id !== event.run_id) return true;
  if (!runStateCompatibleWithEventContext(existing, {
    rootIntent: event.root_intent,
    productType: event.product_type
  })) return true;
  return persistRunState({
    ...existing,
    schema_ver: 1,
    run_id: event.run_id,
    root_intent: event.root_intent || existing.root_intent || '',
    product_type: event.product_type && event.product_type !== 'UNKNOWN'
      ? event.product_type
      : existing.product_type || 'UNKNOWN',
    created_at: existing.created_at || Date.now(),
    updated_at: Date.now(),
    terminal: true,
    terminal_at: Number.isFinite(Number(event.timestamp)) ? Number(event.timestamp) : Date.now()
  }, env);
}

function normalizeOS(platform = process.platform) {
  switch (platform) {
    case 'darwin':
      return 'macOS';
    case 'linux':
      return 'Linux';
    case 'win32':
      return 'Windows';
    default:
      return 'Other';
  }
}

function normalizePlatform(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[_\s-]/g, '');
  if (normalized === 'codex') return 'codex';
  if (normalized === 'claudecode' || normalized === 'claude') return 'claudecode';
  if (normalized === 'cursor') return 'cursor';
  if (normalized === 'coze') return 'coze';
  if (normalized === 'meoo') return 'meoo';
  if (normalized === 'miaoda') return 'miaoda';
  if (normalized === 'openclaw') return 'openclaw';
  if (normalized === 'traesolo') return 'traesolo';
  if (normalized === 'qoder') return 'qoder';
  if (/^[a-z0-9.]{1,40}$/.test(normalized) && normalized !== 'unknown') return normalized;
  return 'unknown';
}

function platformFromEnv(env = process.env) {
  if (env.ALIPAY_AIPAY_PLATFORM) return normalizePlatform(env.ALIPAY_AIPAY_PLATFORM);
  if (env.AIPAY_AGENT_TYPE) return normalizePlatform(env.AIPAY_AGENT_TYPE);
  if (env.DEV_TOOL_NAME) return normalizePlatform(env.DEV_TOOL_NAME);
  if (env.PLATFORM) return normalizePlatform(env.PLATFORM);
  if (env.CLAUDE_CODE_SESSION_ID || env.CLAUDE_SESSION_ID || env.CLAUDECODE || env.CLAUDE_CODE_ENTRYPOINT) return 'claudecode';
  if (env.OPENCLAW_SESSION_ID || env.OPENCLAW_AGENT_ID) return 'openclaw';
  if (env.CURSOR_TRACE_ID || env.CURSOR_SESSION_ID || env.CURSOR_AGENT || env.CURSOR_LAYOUT) return 'cursor';
  if (env.COZE_PROJECT_ID || env.COZE_SESSION_ID || env.COZE_CONVERSATION_ID) return 'coze';
  if (env.MEOO_PROJECT_ID) return 'meoo';
  if (env.MIAODA) return 'miaoda';
  if (env.CODEX_CI || env.CODEX_THREAD_ID || env.CODEX_SESSION_ID || env.CODEX_SANDBOX_NETWORK_DISABLED !== undefined) return 'codex';
  if (env.TRAE_BRAND_NAME) return 'traesolo';
  if (env.QODER_CLI) return 'qoder';
  return 'unknown';
}

function modelFromEnv(env = process.env) {
  return safeDimension(env.AIPAY_MODEL || 'unknown');
}

function normalizeSkillVersion(value) {
  const text = String(value || '').trim();
  if (text === 'unknown') return text;
  const semverMatch = text.match(/^v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/);
  if (semverMatch) return `v${semverMatch[1]}`;
  return /^coze_v\d+(?:[._-][0-9A-Za-z]+)*$/.test(text) ? text : '';
}

function skillVersionFromEvent(event) {
  return normalizeSkillVersion(event?.skill_version) || cozeSkillVersion;
}

function isLocalSkillCheckout() {
  try {
    return fs.existsSync(path.join(skillRoot(), '../.git'));
  } catch {
    return false;
  }
}

function machineCodeRaw(env = process.env) {
  const explicit = env.ALIPAY_AIPAY_MACHINE_CODE || env.AIPAY_MACHINE_CODE;
  if (explicit) return explicit;
  try {
    if (process.platform === 'linux') {
      for (const file of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
        if (fs.existsSync(file)) {
          const value = fs.readFileSync(file, 'utf8').trim();
          if (value) return value;
        }
      }
    }
    if (process.platform === 'darwin') {
      const output = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 1000
      });
      const match = output.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
      if (match?.[1]) return match[1];
    }
    if (process.platform === 'win32') {
      const output = execFileSync('REG', ['QUERY', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 1000
      });
      const match = output.match(/MachineGuid\s+REG_SZ\s+([^\s\r\n]+)/);
      if (match?.[1]) return match[1];
    }
  } catch {}
  try {
    const hostname = os.hostname();
    if (hostname) return `hostname:${hostname}`;
  } catch {}
  return '';
}

function cozeProjectSpaceID(env = process.env) {
  const value = String(env.COZE_PROJECT_SPACE_ID || '').trim();
  if (!value) return '';
  if (/[\s\u0000-\u001f\u007f,^=]/u.test(value)) return '';
  return value;
}

function machineUserID(env = process.env) {
  const spaceId = cozeProjectSpaceID(env);
  if (spaceId) return spaceId;
  const raw = machineCodeRaw(env);
  if (!raw) return 'anonymous_uid';
  const hash = crypto.createHash('sha256').update(String(raw)).digest('hex').slice(0, 32);
  return `machine_${hash}`;
}

function monitorEnv(env = process.env, skillVersion = cozeSkillVersion) {
  switch (normalizeSwitch(env.AIPAY_BUILD_ENV)) {
    case 'dev':
      return 'DEV';
    case 'pre':
      return 'PRE';
    case 'prod':
      return 'PROD';
    default:
      break;
  }
  if (/^v?\d+\.\d+\.\d+-/.test(skillVersion)) return 'PRE';
  if (!isLocalSkillCheckout()) return 'PROD';
  return 'DEV';
}

function hasOnlyFields(value, allowedFields) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every((field) => allowedFields.has(field));
}

function normalizeMetricEvent(event) {
  if (!hasOnlyFields(event, metricEventFields)) return null;
  if (event.schema_ver !== 2 || event.skill !== 'alipay-aipay') return null;
  const eventId = safeText(event.event_id);
  if (!eventId || eventId.length > 128) return null;
  const skillVersion = normalizeSkillVersion(event.skill_version);
  if (!skillVersion) return null;
  const runId = safeRunId(event.run_id);
  if (!runId || runId !== event.run_id) return null;
  const stageRule = stageRules.get(event.stage);
  if (!stageRule || event.flow !== stageRule.flow) return null;
  if (!Number.isSafeInteger(event.timestamp) || event.timestamp <= 0) return null;
  const productType = canonicalProductType(event.product_type);
  if (!productType || productType !== event.product_type) return null;
  const rootIntent = event.root_intent;
  if (rootIntent !== undefined && !allowedRootIntents.has(rootIntent)) return null;

  const normalized = {
    schema_ver: 2,
    event_id: eventId,
    skill: 'alipay-aipay',
    skill_version: skillVersion,
    run_id: runId,
    stage: event.stage,
    timestamp: event.timestamp,
    flow: event.flow,
    product_type: productType
  };
  if (rootIntent !== undefined) normalized.root_intent = rootIntent;

  if (Object.prototype.hasOwnProperty.call(event, 'ext_info')) {
    if (event.stage !== 'run.terminal' || typeof event.ext_info !== 'string') return null;
    let parsedExtInfo;
    try {
      parsedExtInfo = JSON.parse(event.ext_info);
    } catch {
      return null;
    }
    if (!hasOnlyFields(parsedExtInfo, terminalExtInfoFields)) return null;
    if (rootIntent && parsedExtInfo.root_intent && parsedExtInfo.root_intent !== rootIntent) return null;
    const extInfo = terminalExtInfoFromPayload({
      ...parsedExtInfo,
      rootIntent: rootIntent || parsedExtInfo.root_intent
    }, {});
    if (!extInfo) return null;
    normalized.ext_info = extInfo;
  }
  return normalized;
}

export function buildSyncLogReport(event, env = process.env) {
  const normalizedEvent = normalizeMetricEvent(event);
  if (!normalizedEvent) return null;
  const skillVersion = skillVersionFromEvent(normalizedEvent);
  const item = {
    code: syncLogCode,
    msg: syncLogMsg,
    d1: normalizeOS(),
    d2: platformFromEnv(env),
    d3: modelFromEnv(env),
    d4: skillVersion,
    d5: normalizedEvent.product_type || 'UNKNOWN',
    c1: normalizedEvent.run_id,
    c2: normalizedEvent.stage,
    c3: normalizedEvent.timestamp
  };
  const terminalExtInfo = terminalExtInfoFromEvent(normalizedEvent);
  if (terminalExtInfo) item.c4 = terminalExtInfo;
  return {
    item,
    options: {
      Env: monitorEnv(env, skillVersion),
      SprintID: skillVersion,
      UserID: machineUserID(env),
      YuyanID: syncLogYuyanID
    }
  };
}

function serializeSyncLogParam4(param4) {
  return Object.keys(param4)
    .filter((key) => param4[key] !== undefined && param4[key] !== null)
    .sort()
    .map((key) => `${key}=${encodeSyncLogParam4Value(param4[key])}`)
    .join('^');
}

function encodeSyncLogParam4Value(value) {
  const text = String(value ?? '');
  try {
    return encodeURIComponent(text).replace(/'/g, '%27');
  } catch {
    return encodeURIComponent(text.replace(/[\uD800-\uDFFF]/g, '\uFFFD')).replace(/'/g, '%27');
  }
}

export function buildSyncLogLine(userID, param4, date = new Date()) {
  const pad = (value, length = 2) => String(value).padStart(length, '0');
  const clientLogTime = [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}:${date.getMilliseconds()}`
  ].join(' ');

  return [
    'D-AE',
    clientLogTime,
    '',
    '',
    '2',
    '',
    '',
    userID || 'anonymous_uid',
    '1000',
    '102023',
    'H5behavior',
    '2',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'zh-cn',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    serializeSyncLogParam4(param4)
  ].join(',');
}

function buildParam4(item, options) {
  const param4 = { ...item };
  if (options.SprintID) param4.bm_sid = options.SprintID;
  if (options.Env && !param4.env) param4.env = options.Env;
  if (options.YuyanID) param4.yuyan_id = options.YuyanID;
  param4.monitor_ver = syncLogMonitorVersion;
  return param4;
}

export function syncLogRequestBody(report, nowMs = Date.now()) {
  const param4 = buildParam4(report.item, report.options);
  return `data=${encodeURIComponent(buildSyncLogLine(report.options.UserID || 'anonymous_uid', param4))}&time=${nowMs}`;
}

export function isSuccessfulHttpStatus(statusCode) {
  const code = Number(statusCode || 0);
  return code >= 200 && code < 300;
}

export function sendSyncLogReportDetailed(report, { timeoutMs = uploadTimeoutMs } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    try {
      if (!report?.item || !report?.options) {
        finish({ ok: false, error_code: 'INVALID_REPORT', error_message: 'invalid report' });
        return;
      }
      const body = syncLogRequestBody(report);
      const req = https.request(`${syncLogServerURL}?biztype=${syncLogBizType}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: timeoutMs
      }, (resp) => {
        resp.resume();
        resp.on('end', () => {
          const statusCode = Number(resp.statusCode || 0);
          const ok = isSuccessfulHttpStatus(statusCode);
          finish({
            ok,
            status_code: statusCode || undefined,
            error_code: ok ? undefined : statusCode > 0 ? `HTTP_${statusCode}` : 'NO_HTTP_STATUS',
            error_message: ok ? undefined : statusCode > 0
              ? `http ${statusCode}`
              : 'no http status'
          });
        });
      });
      req.on('timeout', () => {
        finish({ ok: false, error_code: 'ETIMEDOUT', error_message: 'request timeout' });
        req.destroy();
      });
      req.on('error', (error) => finish(failedResult(error)));
      req.end(body);
    } catch (error) {
      finish(failedResult(error));
    }
  });
}

function outboxFiles(env = process.env, { targetFile = '', limit = 0 } = {}) {
  try {
    const dir = outboxDir(env);
    recoverStaleOutboxClaims(env);
    pruneOutbox(env);
    if (targetFile) {
      const resolved = path.resolve(String(targetFile));
      const basename = path.basename(resolved);
      return path.dirname(resolved) === path.resolve(dir)
        && basename.endsWith('.json')
        && !basename.startsWith('.')
        && fs.existsSync(resolved)
        ? [resolved]
        : [];
    }
    const files = outboxRecordEntries(dir)
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) => entry.file);
    return limit > 0 ? files.slice(0, limit) : files;
  } catch {
    return [];
  }
}

function outboxRecordEntries(dir) {
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json') && !name.startsWith('.'))
    .map((name) => {
      const file = path.join(dir, name);
      let mtimeMs = 0;
      try {
        mtimeMs = fs.statSync(file).mtimeMs;
      } catch {}
      return { file, name, mtimeMs };
    })
    .filter((entry) => entry.mtimeMs > 0);
}

function pruneOutbox(env = process.env, nowMs = Date.now()) {
  try {
    const dir = outboxDir(env);
    let entries = outboxRecordEntries(dir);
    for (const entry of entries) {
      if (nowMs - entry.mtimeMs <= outboxMaxAgeMs) continue;
      try {
        fs.unlinkSync(entry.file);
      } catch {}
    }
    entries = outboxRecordEntries(dir);
    const overflow = entries.length - outboxMaxRecords;
    if (overflow <= 0) return;
    entries
      .sort((left, right) => left.mtimeMs - right.mtimeMs || left.name.localeCompare(right.name))
      .slice(0, overflow)
      .forEach((entry) => {
        try {
          fs.unlinkSync(entry.file);
        } catch {}
      });
  } catch {}
}

function recoverStaleOutboxClaims(env = process.env, nowMs = Date.now()) {
  try {
    const dir = outboxDir(env);
    for (const name of fs.readdirSync(dir)) {
      if (!name.includes('.json.sending.')) continue;
      const claimedPath = path.join(dir, name);
      const stat = fs.statSync(claimedPath);
      if (nowMs - stat.mtimeMs < outboxClaimTtlMs) continue;
      const originalName = name.replace(/\.sending\.[^.]+$/, '');
      const originalPath = path.join(dir, originalName);
      try {
        if (fs.existsSync(originalPath)) fs.unlinkSync(claimedPath);
        else fs.renameSync(claimedPath, originalPath);
      } catch {}
    }
  } catch {}
}

function claimOutboxFile(file) {
  const claimedPath = `${file}.sending.${process.pid}`;
  try {
    fs.renameSync(file, claimedPath);
    return claimedPath;
  } catch {
    return '';
  }
}

function releaseOutboxClaim(claimedPath) {
  const originalPath = claimedPath.replace(/\.sending\.[^.]+$/, '');
  try {
    if (fs.existsSync(originalPath)) fs.unlinkSync(claimedPath);
    else fs.renameSync(claimedPath, originalPath);
    return true;
  } catch {
    return false;
  }
}

function outboxTargetFilePending(file) {
  try {
    if (fs.existsSync(file)) return true;
    const dir = path.dirname(file);
    const prefix = `${path.basename(file)}.sending.`;
    return fs.readdirSync(dir).some((name) => name.startsWith(prefix));
  } catch {
    return false;
  }
}

function readOutboxRecord(file) {
  try {
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!hasOnlyFields(record, outboxRecordFields) || record.schema_ver !== 1) return null;
    if (!Number.isSafeInteger(record.created_at) || record.created_at <= 0) return null;
    const event = normalizeMetricEvent(record.event);
    if (!event) return null;
    return { schema_ver: 1, created_at: record.created_at, event };
  } catch {
    return null;
  }
}

function hasPendingOutboxRecords(env = process.env) {
  try {
    const dir = outboxDir(env);
    recoverStaleOutboxClaims(env);
    pruneOutbox(env);
    return fs.readdirSync(dir).some((name) => {
      if (name.startsWith('.')) return false;
      return name.endsWith('.json') || name.includes('.json.sending.');
    });
  } catch {
    return true;
  }
}

function writeUploadStatus(status, env = process.env) {
  return writePrivateJson(uploadStatusPath(env), { schema_ver: 1, updated_at: Date.now(), ...status });
}

function readUploadStatus(env = process.env) {
  try {
    const parsed = JSON.parse(fs.readFileSync(uploadStatusPath(env), 'utf8'));
    if (!parsed || parsed.schema_ver !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

function networkUploadFailure(status) {
  const errorCode = safeDimension(status?.error_code || '', '', 80).toUpperCase();
  if (permissionedFlushNetworkErrors.has(errorCode)) return errorCode;
  const message = String(status?.error_message || '').toUpperCase();
  for (const code of permissionedFlushNetworkErrors) {
    if (message.includes(code)) return code;
  }
  if (message.includes('GETADDRINFO') || message.includes('COULD_NOT_RESOLVE') || message.includes('COULD NOT RESOLVE')) {
    return 'ENOTFOUND';
  }
  return '';
}

export function permissionedFlushDecision(env = process.env) {
  const outboxCount = outboxFiles(env).length;
  const status = readUploadStatus(env);
  const errorCode = networkUploadFailure(status);
  const result = {
    needed: false,
    outbox_count: outboxCount,
    error_code: errorCode || safeDimension(status?.error_code || '', '', 80),
    status: safeDimension(status?.status || 'unknown', 'unknown', 80)
  };
  if (!telemetryUploadEnabled(env) || outboxCount <= 0 || !errorCode) {
    return result;
  }
  result.needed = true;
  return result;
}

function emitPermissionedFlushNeededMarkers(env = process.env, stream = process.stderr) {
  const decision = permissionedFlushDecision(env);
  if (!decision.needed || !stream || typeof stream.write !== 'function') return false;
  stream.write(`${internalPrefix}PERMISSIONED_FLUSH_DECISION=${JSON.stringify(decision)}\n`);
  stream.write(`${internalPrefix}PERMISSIONED_FLUSH_NEEDED=true\n`);
  return true;
}

export async function flushOutbox(env = process.env, {
  limit = outboxFlushLimit,
  targetFile = '',
  timeoutMs = uploadTimeoutMs,
  sender = sendSyncLogReportDetailed,
  prioritizeTerminal = false
} = {}) {
  const result = { attempted: 0, sent: 0, retained: 0, invalid: 0 };
  if (!telemetryUploadEnabled(env)) return result;
  const files = outboxFilesForFlush(env, { targetFile, limit, prioritizeTerminal });
  for (const file of files) {
    const claimedFile = claimOutboxFile(file);
    if (!claimedFile) continue;
    const record = readOutboxRecord(claimedFile);
    if (!record) {
      result.invalid += 1;
      try {
        fs.unlinkSync(claimedFile);
      } catch {}
      continue;
    }
    const report = buildSyncLogReport(record.event, env);
    if (!report) {
      result.invalid += 1;
      try {
        fs.unlinkSync(claimedFile);
      } catch {}
      continue;
    }
    result.attempted += 1;
    let sendResult = { ok: false, error_code: 'SENDER_FAILED', error_message: 'sender failed' };
    try {
      const rawSendResult = await sender(report, { timeoutMs });
      sendResult = typeof rawSendResult === 'boolean' ? { ok: rawSendResult } : rawSendResult;
    } catch (error) {
      sendResult = failedResult(error, 'SENDER_THROW', 'sender threw');
    }
    if (sendResult?.ok) {
      result.sent += 1;
      try {
        fs.unlinkSync(claimedFile);
      } catch {
        result.retained += 1;
        releaseOutboxClaim(claimedFile);
      }
      continue;
    }
    writeUploadStatus({
      status: 'failed',
      attempted: result.attempted,
      sent: result.sent,
      retained: files.length - result.attempted + 1,
      status_code: sendResult?.status_code,
      error_code: sendResult?.error_code || 'UPLOAD_FAILED',
      error_message: sendResult?.error_message || 'upload failed'
    }, env);
    releaseOutboxClaim(claimedFile);
    result.retained += files.length - result.attempted + 1;
    break;
  }
  if (result.sent > 0 && result.retained === 0 && !hasPendingOutboxRecords(env)) {
    writeUploadStatus({
      status: 'success',
      attempted: result.attempted,
      sent: result.sent,
      retained: 0
    }, env);
  }
  return result;
}

function outboxFilesForFlush(env = process.env, { targetFile = '', limit = 0, prioritizeTerminal = false } = {}) {
  const files = outboxFiles(env, { targetFile, limit: prioritizeTerminal ? 0 : limit });
  const ordered = prioritizeTerminal ? prioritizeTerminalOutboxFiles(files) : files;
  return limit > 0 ? ordered.slice(0, limit) : ordered;
}

function prioritizeTerminalOutboxFiles(files) {
  return files
    .map((file, index) => {
      const record = readOutboxRecord(file);
      const stage = record?.event?.stage || '';
      return { file, index, terminal: stage === 'run.terminal' };
    })
    .sort((left, right) => {
      if (left.terminal !== right.terminal) return left.terminal ? -1 : 1;
      return left.index - right.index;
    })
    .map((entry) => entry.file);
}

function spawnOutboxFlush(env = process.env, { delayMs = 0 } = {}) {
  if (!telemetryUploadEnabled(env)) return false;
  try {
    const childEnv = {
      ...env,
      ALIPAY_AIPAY_TELEMETRY_UPLOAD_TIMEOUT_MS: env.ALIPAY_AIPAY_TELEMETRY_UPLOAD_TIMEOUT_MS || String(uploadTimeoutMs)
    };
    if (delayMs > 0) childEnv.ALIPAY_AIPAY_TELEMETRY_FLUSH_DELAY_MS = String(Math.min(delayMs, 30000));
    const child = spawn(process.execPath, [scriptPath(), 'flush-outbox-worker'], {
      detached: true,
      stdio: 'ignore',
      env: childEnv
    });
    child.on('error', (error) => {
      writeUploadStatus({
        status: 'spawn_failed',
        error_code: safeDimension(error?.code || error?.name || 'UPLOAD_SPAWN_FAILED', 'UPLOAD_SPAWN_FAILED', 80),
        error_message: safeDimension(error?.message || 'upload spawn failed', 'upload spawn failed', 240)
      }, env);
    });
    child.unref();
    return true;
  } catch {
    writeUploadStatus({
      status: 'spawn_failed',
      error_code: 'UPLOAD_SPAWN_FAILED',
      error_message: 'upload spawn failed'
    }, env);
    return false;
  }
}

function permissionedForegroundFlushLimitFromEnv(env = process.env) {
  const parsed = parseNonNegativeInteger(env.ALIPAY_AIPAY_TELEMETRY_PERMISSIONED_FLUSH_LIMIT);
  return parsed && parsed > 0 ? Math.min(parsed, outboxFlushLimit) : permissionedForegroundFlushLimit;
}

export async function runPermissionedOutboxFlush(env = process.env, {
  limit = permissionedForegroundFlushLimitFromEnv(env),
  timeoutMs = uploadTimeoutMs,
  sender = sendSyncLogReportDetailed,
  spawnBackground = false
} = {}) {
  const flush = await flushOutbox(env, {
    limit,
    timeoutMs,
    sender,
    prioritizeTerminal: true
  });
  const backgroundRetry = spawnBackground
    && flush.attempted > 0
    && outboxFiles(env).length > 0
    ? spawnOutboxFlush(env, { delayMs: terminalBackgroundRetryDelayMs })
    : false;
  return {
    flush,
    background_retry: backgroundRetry
  };
}

function foregroundFlushTerminalOutboxFile(file, env = process.env) {
  if (!telemetryUploadEnabled(env) || !file) return false;
  const parsed = parseNonNegativeInteger(env.ALIPAY_AIPAY_TELEMETRY_TERMINAL_FLUSH_TIMEOUT_MS);
  const timeoutMs = parsed && parsed > 0 ? Math.min(parsed, 30000) : terminalForegroundUploadTimeoutMs;
  const parsedAttempts = parseNonNegativeInteger(env.ALIPAY_AIPAY_TELEMETRY_TERMINAL_FLUSH_ATTEMPTS);
  const attempts = parsedAttempts && parsedAttempts > 0
    ? Math.min(parsedAttempts, 3)
    : terminalForegroundUploadMaxAttempts;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      execFileSync(process.execPath, [scriptPath(), 'flush-outbox-worker'], {
        stdio: 'ignore',
        timeout: timeoutMs + 800,
        env: {
          ...env,
          ALIPAY_AIPAY_TELEMETRY_UPLOAD_TIMEOUT_MS: String(timeoutMs),
          ALIPAY_AIPAY_TELEMETRY_FLUSH_TARGET_FILE: file
        }
      });
    } catch (error) {
      writeUploadStatus({
        status: 'failed',
        error_code: safeDimension(error?.code || error?.signal || error?.name || 'TERMINAL_FLUSH_FAILED', 'TERMINAL_FLUSH_FAILED', 80),
        error_message: 'terminal flush failed'
      }, env);
    }
    if (!outboxTargetFilePending(file)) return true;
    const retryable = Boolean(networkUploadFailure(readUploadStatus(env)));
    if (!retryable || attempt >= attempts) return false;
    sleepSync(terminalForegroundUploadRetryDelayMs);
  }
  return !outboxTargetFilePending(file);
}

function emitTelemetryError(error) {
  try {
    const message = safeDimension(error instanceof Error ? error.message : String(error), 'unknown', 240);
    process.stderr.write(`${internalPrefix}TELEMETRY_ERROR=${message}\n`);
  } catch {
  }
}

export async function runTelemetryCli(argv = process.argv) {
  try {
    const { command, args } = parseCliArgs(argv);
    if (command === 'start-run') {
      assertCliArgs(args, new Set(['root-intent', 'product-type', 'run-id', 'input-id']), 0);
      const state = createOrReuseRunState(args);
      if (persistRunState(state)) {
        const event = stageMetricEvent('run.intent_detected', {
          runId: state.run_id,
          rootIntent: state.root_intent,
          productType: state.product_type
        });
        emitMetricEvent(event);
      }
      return 0;
    }
    if (command === 'current-run-id') {
      assertCliArgs(args, new Set(), 0);
      const state = canReadImplicitRunState(process.env) ? readRunState(process.env) : null;
      if (state?.run_id) {
        process.stderr.write(`${internalPrefix}RUN_ID=${state.run_id}\n`);
      } else {
        process.stderr.write(`${internalPrefix}RUN_ID_MISSING=true\n`);
      }
      return 0;
    }
    if (command === 'machine-user-id') {
      assertCliArgs(args, new Set(), 0);
      const value = machineUserID(process.env);
      if (/^machine_[0-9a-f]{32}$/u.test(value)) {
        process.stderr.write(`${internalPrefix}MACHINE_USER_ID=${value}\n`);
      } else {
        process.stderr.write(`${internalPrefix}MACHINE_USER_ID_MISSING=true\n`);
      }
      return 0;
    }
    if (command === 'count-user-input' && args._.length === 0) {
      assertCliArgs(args, new Set(['phase', 'input-id']), 0);
      const counts = recordTelemetryUserInput(args.phase, process.env, Date.now(), args['input-id']);
      if (counts) {
        process.stderr.write(`${internalPrefix}USER_INPUT_COUNT_STATE=${JSON.stringify(publicUserInputCountState(counts))}\n`);
      } else {
        process.stderr.write(`${internalPrefix}USER_INPUT_COUNT_STATE_MISSING=true\n`);
      }
      return 0;
    }
    if (command === 'mark-flow-start' && args._.length === 0) {
      assertCliArgs(args, new Set(), 0);
      const counts = markTelemetryFlowStart(process.env, Date.now());
      if (counts) {
        process.stderr.write(`${internalPrefix}USER_INPUT_FLOW_START_STATE=${JSON.stringify(publicUserInputCountState(counts))}\n`);
      } else {
        process.stderr.write(`${internalPrefix}USER_INPUT_FLOW_START_STATE_MISSING=true\n`);
      }
      return 0;
    }
    if (command === 'upload-status' && args._.length === 0) {
      assertCliArgs(args, new Set(), 0);
      const status = readUploadStatus(process.env) || { schema_ver: 1, status: 'unknown' };
      process.stderr.write(`${internalPrefix}TELEMETRY_UPLOAD_STATUS=${JSON.stringify(status)}\n`);
      return 0;
    }
    if (command === 'permissioned-flush-status' && args._.length === 0) {
      assertCliArgs(args, new Set(), 0);
      const decision = permissionedFlushDecision(process.env);
      process.stderr.write(`${internalPrefix}PERMISSIONED_FLUSH_STATUS=${JSON.stringify(decision)}\n`);
      if (decision.needed) {
        process.stderr.write(`${internalPrefix}PERMISSIONED_FLUSH_CANDIDATE=true\n`);
      }
      return 0;
    }
    if (command === 'permissioned-flush-needed' && args._.length === 0) {
      assertCliArgs(args, new Set(), 0);
      const decision = permissionedFlushDecision(process.env);
      process.stderr.write(`${internalPrefix}PERMISSIONED_FLUSH_DECISION=${JSON.stringify(decision)}\n`);
      if (decision.needed) process.stderr.write(`${internalPrefix}PERMISSIONED_FLUSH_NEEDED=true\n`);
      return 0;
    }
    if (command === 'flush-outbox') {
      assertCliArgs(args, new Set(), 0);
      if (!telemetryEnabled(process.env)) return 0;
      await runPermissionedOutboxFlush(process.env, { spawnBackground: true });
      return 0;
    }
    if (command === 'flush-outbox-worker') {
      assertCliArgs(args, new Set(), 0);
      if (!telemetryEnabled(process.env)) return 0;
      const timeout = Number(process.env.ALIPAY_AIPAY_TELEMETRY_UPLOAD_TIMEOUT_MS || uploadTimeoutMs);
      const delay = parseNonNegativeInteger(process.env.ALIPAY_AIPAY_TELEMETRY_FLUSH_DELAY_MS);
      if (delay && delay > 0) sleepSync(Math.min(delay, 30000));
      await flushOutbox(process.env, {
        targetFile: process.env.ALIPAY_AIPAY_TELEMETRY_FLUSH_TARGET_FILE || '',
        timeoutMs: Number.isFinite(timeout) ? timeout : uploadTimeoutMs
      });
      return 0;
    }
    if (!telemetryEnabled(process.env)) return 0;
    if (command === 'stage-async') {
      assertCliArgs(args, new Set([
        'run-id',
        'root-intent',
        'product-type',
        'product-name'
      ]), 1);
      if (args._[0] === 'run.terminal') throw new Error('run.terminal 必须由前台终态入口上报');
      emitStageMetricAsync(args._[0], contextFromCliArgs(args), process.env);
      return 0;
    }
    if (command !== 'stage' || args._.length !== 1) {
      emitTelemetryError(new Error('invalid telemetry arguments'));
      return 0;
    }
    assertCliArgs(args, new Set([
      'run-id',
      'root-intent',
      'product-type',
      'product-name',
      'terminal-reason',
      'timestamp-ms',
      'user-input-count-total',
      'user-input-count-after-flow-start',
      'flow-start-observed'
    ]), 1);
    const event = stageMetricEvent(args._[0], contextFromCliArgs(args), timestampFromCliArgs(args));
    if (event?.stage === 'run.terminal') {
      emitTerminalMetricEvent(event, { stream: process.stderr });
    } else {
      emitMetricEvent(event);
    }
    return 0;
  } catch (error) {
    emitTelemetryError(error);
    return 0;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runTelemetryCli(process.argv).then((code) => {
    process.exitCode = code;
  }, (error) => {
    emitTelemetryError(error);
    process.exitCode = 0;
  });
}
