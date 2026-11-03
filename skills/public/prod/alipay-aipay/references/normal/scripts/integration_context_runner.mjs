#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { checklistForProduct } from './checklist_sections.mjs';

const internalPrefix = 'ALIPAY_AIPAY_INTERNAL:';
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const integrationDir = path.resolve(scriptDir, '../../integration');
const modulesDir = path.join(integrationDir, 'modules');
const interfaceGuidePath = path.join(modulesDir, 'interface-guide.md');
const productTypes = new Set(['webpay']);
const cozeReference = 'modules/coze-runtime.md';
const cozeDevelopmentReference = 'modules/coze-development-guide.md';
const sdkReference = 'modules/alipay-sdk-reminder.md';

const languageRules = Object.freeze({
  nodejs: { name: 'Node.js', directory: 'nodejs' }
});

function parseArgs(argv) {
  const command = argv[2];
  const args = {};
  for (let index = 3; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`未知参数 ${token}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`参数 ${token} 缺少取值`);
    const name = token.slice(2);
    if (Object.prototype.hasOwnProperty.call(args, name)) throw new Error(`参数 ${token} 重复`);
    args[name] = value;
    index += 1;
  }
  return { command, args };
}

function required(args, name) {
  const value = args[name];
  if (typeof value !== 'string' || !value) throw new Error(`缺少参数 --${name}`);
  return value;
}

function normalizeLanguage(value) {
  const compact = value.trim().toLowerCase().replace(/[\s_.-]+/gu, '');
  if (compact === 'node' || compact === 'nodejs' || compact === 'javascript' || compact === 'js') return languageRules.nodejs;
  throw new Error('server-language 非法，Coze 当前仅支持 Node.js');
}

export function resolveIntegrationPlatform(serverLanguage) {
  const language = normalizeLanguage(serverLanguage);
  const referencePath = path.join(integrationDir, cozeReference);
  if (!fs.statSync(referencePath).isFile()) throw new Error(`Coze 平台依据不存在：${cozeReference}`);
  return {
    schema_ver: 1,
    platform: 'coze',
    server_language: language.name,
    product_hint: 'webpay',
    product_hint_source: 'COZE_FIXED_SCOPE',
    platform_reference: cozeReference
  };
}

function relativeToIntegration(absolutePath) {
  return path.relative(integrationDir, absolutePath).split(path.sep).join('/');
}

function codeValues(value) {
  return [...value.matchAll(/`([^`]+)`/gu)].map((match) => match[1]);
}

function productRoutes() {
  const source = fs.readFileSync(interfaceGuidePath, 'utf8');
  const lines = source.split(/\r?\n/u);
  const header = lines.findIndex((line) => line.startsWith('| productType | 产品 |'));
  if (header < 0) throw new Error('interface-guide 缺少默认读取路由事实表');
  const routes = {};
  for (let index = header + 2; index < lines.length && lines[index].startsWith('|'); index += 1) {
    const cells = lines[index].slice(1, -1).split('|').map((cell) => cell.trim());
    if (cells.length !== 6) throw new Error('interface-guide 默认读取路由表列数非法');
    const [productType] = codeValues(cells[0]);
    const [sandboxAction] = codeValues(cells[4]);
    const sandboxReferences = codeValues(cells[5]);
    if (!productTypes.has(productType) || routes[productType]) throw new Error('interface-guide productType 非法或重复');
    const contracts = codeValues(cells[2]).map((value) => `modules/${value}`);
    const exampleDirectories = codeValues(cells[3]);
    if (!cells[1] || contracts.length === 0 || exampleDirectories.length === 0 || !sandboxAction || sandboxReferences.length > 1) {
      throw new Error(`interface-guide 的 ${productType} 路由字段不完整`);
    }
    routes[productType] = {
      name: cells[1],
      contracts,
      exampleDirectories,
      sandboxAction,
      sandboxReference: sandboxReferences[0] ? `modules/${sandboxReferences[0]}` : null
    };
  }
  if (Object.keys(routes).length !== productTypes.size) throw new Error('interface-guide 产品路由不完整');
  return routes;
}

function existingRoutePaths(route) {
  const paths = [...route.contracts, ...(route.sandboxReference ? [route.sandboxReference] : [])];
  for (const relativePath of paths) {
    if (!fs.statSync(path.join(integrationDir, relativePath)).isFile()) throw new Error(`路由文件不存在：${relativePath}`);
  }
}

function examplePathsFor(route, languageDirectory) {
  const roots = route.exampleDirectories.map((directory) => path.join(modulesDir, 'code-examples', languageDirectory, directory));
  const examples = roots.flatMap((directory) => fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relativeToIntegration(path.join(directory, entry.name))));
  if (examples.length === 0) throw new Error('当前产品和语言没有本地代码示例');
  return examples.sort((left, right) => left.localeCompare(right));
}

export function resolveIntegrationContext(productType, serverLanguage) {
  const product = productRoutes()[productType];
  if (!product) throw new Error('product-type 非法，Coze 当前仅支持 webpay');
  const language = normalizeLanguage(serverLanguage);
  const platform = resolveIntegrationPlatform(serverLanguage);
  existingRoutePaths(product);
  for (const reference of [cozeDevelopmentReference, sdkReference]) {
    if (!fs.statSync(path.join(integrationDir, reference)).isFile()) {
      throw new Error(`代码开发依据不存在：${reference}`);
    }
  }
  const examples = examplePathsFor(product, language.directory);
  const primaryExamples = examples.filter((reference) => reference.includes('/2-网站支付/'));
  if (primaryExamples.length !== 1) throw new Error('网站支付主示例必须且只能有一个');
  const supportingExamples = examples.filter((reference) => !primaryExamples.includes(reference));
  const requiredReading = [
    product.contracts[0],
    cozeDevelopmentReference,
    sdkReference,
    platform.platform_reference,
    ...product.contracts.slice(1),
    ...primaryExamples,
    ...supportingExamples
  ];
  if (new Set(requiredReading).size !== requiredReading.length) {
    throw new Error('代码开发必读依据重复');
  }
  return {
    schema_ver: 1,
    product_type: productType,
    product_name: product.name,
    server_language: language.name,
    sdk_reference: sdkReference,
    platform_reference: platform.platform_reference,
    development_reference: cozeDevelopmentReference,
    contracts: product.contracts,
    examples,
    required_reading: requiredReading,
    checklist: {
      delivery_phase: 'checklist',
      sections: checklistForProduct(productType).sections
    },
    sandbox_acceptance: {
      action: product.sandboxAction,
      reference: product.sandboxReference
    }
  };
}

export function runIntegrationContextCli(argv = process.argv) {
  const { command, args } = parseArgs(argv);
  if (command === 'platform') {
    const context = resolveIntegrationPlatform(required(args, 'server-language'));
    process.stderr.write(`${internalPrefix}INTEGRATION_PLATFORM_CONTEXT=${JSON.stringify(context)}\n`);
    return;
  }
  if (command === 'resolve') {
    const context = resolveIntegrationContext(required(args, 'product-type'), required(args, 'server-language'));
    process.stderr.write(`${internalPrefix}INTEGRATION_CONTEXT=${JSON.stringify(context)}\n`);
    return;
  }
  throw new Error('用法: integration_context_runner.mjs <platform --server-language Node.js|resolve --product-type webpay --server-language Node.js>');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runIntegrationContextCli();
  } catch (error) {
    process.stderr.write(`${internalPrefix}INTEGRATION_CONTEXT_ERROR=${String(error?.message || error).replace(/[\r\n]/gu, ' ')}\n`);
    process.exitCode = 1;
  }
}
