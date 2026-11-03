#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { checklistForProduct } from './checklist_sections.mjs';
import { createChecklistScopeReceipt } from './integration_message_runner.mjs';
import { emitStageMetricAsync, markTelemetryFlowStart } from './telemetry.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const referencesDir = path.resolve(scriptDir, '../..');
const productTypes = new Set(['webpay']);
const flowDefinitions = Object.freeze({
  integration: {
    source: path.join(referencesDir, 'integration/flow.md'),
    prefix: 'INTEGRATION'
  },
  onboarding: {
    source: path.join(referencesDir, 'onboarding/flow.md'),
    prefix: 'ONBOARDING'
  }
});

function definitionFor(flow) {
  const definition = flowDefinitions[flow];
  if (!definition) throw new Error('flow 仅支持 integration 或 onboarding');
  return definition;
}

function marker(name, boundary) {
  return `<!-- ALIPAY_AIPAY_FLOW:${name}:${boundary} -->`;
}

function countOccurrences(source, needle) {
  let count = 0;
  let offset = 0;
  while ((offset = source.indexOf(needle, offset)) >= 0) {
    count += 1;
    offset += needle.length;
  }
  return count;
}

export function extractFlowBlock(source, name) {
  const startMarker = marker(name, 'START');
  const endMarker = marker(name, 'END');
  if (countOccurrences(source, startMarker) !== 1 || countOccurrences(source, endMarker) !== 1) {
    throw new Error(`flow 区块 ${name} 必须且只能有一组 START/END marker`);
  }
  const start = source.indexOf(startMarker) + startMarker.length;
  const end = source.indexOf(endMarker, start);
  if (end < start) throw new Error(`flow 区块 ${name} marker 顺序非法`);
  const block = source.slice(start, end).trim();
  if (!block) throw new Error(`flow 区块 ${name} 不能为空`);
  return block;
}

function flowSource(flow) {
  return fs.readFileSync(definitionFor(flow).source, 'utf8');
}

export function flowBlockNames(flow) {
  const source = flowSource(flow);
  const names = [];
  for (const match of source.matchAll(/<!-- ALIPAY_AIPAY_FLOW:([A-Z_]+):START -->/gu)) {
    if (!names.includes(match[1])) names.push(match[1]);
  }
  for (const name of names) extractFlowBlock(source, name);
  return names;
}

function phaseName(flow, blockName) {
  const prefix = `${definitionFor(flow).prefix}_`;
  if (!blockName.startsWith(prefix)) throw new Error(`flow 区块前缀非法：${blockName}`);
  return blockName.slice(prefix.length).toLowerCase().replaceAll('_', '-');
}

function phaseBlockName(flow, phase) {
  return `${definitionFor(flow).prefix}_${phase.toUpperCase().replaceAll('-', '_')}`;
}

function stageDeclarations(block, productType) {
  const stages = [];
  const pattern = /<!-- ALIPAY_AIPAY_STAGE:([a-z0-9._-]+)(?: products=([a-z,]+))? -->/gu;
  for (const match of block.matchAll(pattern)) {
    const products = match[2]?.split(',') || null;
    if (products?.some((product) => !productTypes.has(product))) throw new Error('flow telemetry 产品声明非法');
    if (!products || !productType || products.includes(productType)) stages.push(match[1]);
  }
  return stages;
}

function cleanDirectives(block) {
  return block
    .replace(/<!-- ALIPAY_AIPAY_STAGE:[a-z0-9._-]+(?: products=[a-z,]+)? -->/gu, '')
    .trim();
}

export function flowPhaseNames(flow, { productType } = {}) {
  if (productType !== undefined && !productTypes.has(productType)) throw new Error('product-type 非法');
  const coreName = `${definitionFor(flow).prefix}_CORE`;
  return flowBlockNames(flow)
    .filter((name) => name !== coreName && !name.includes('_FRAGMENT_'))
    .map((name) => phaseName(flow, name));
}

export function loadFlowBundle(flow, phase, { productType } = {}) {
  if (productType !== undefined && !productTypes.has(productType)) throw new Error('product-type 非法');
  const definition = definitionFor(flow);
  const source = flowSource(flow);
  const blockName = phaseBlockName(flow, phase);
  if (!flowBlockNames(flow).includes(blockName) || blockName.includes('_FRAGMENT_')) {
    throw new Error(`${flow} phase 非法；允许值：${flowPhaseNames(flow, { productType }).join('、')}`);
  }
  const phaseBlock = extractFlowBlock(source, blockName);
  const loadsCore = (flow === 'integration' && phase === 'development')
    || (flow === 'onboarding' && phase === 'execute');
  const blocks = loadsCore
    ? [extractFlowBlock(source, `${definition.prefix}_CORE`), phaseBlock]
    : [phaseBlock];
  if (flow === 'integration' && phase === 'checklist') {
    if (!productType) throw new Error('integration checklist phase 缺少 product-type');
    blocks.push(`## 当前产品适用校验清单\n\n${checklistForProduct(productType).markdown}`);
  }
  return [
    `<!-- ALIPAY_AIPAY_REFERENCE_BUNDLE flow=${flow} phase=${phase}; 仅供内部执行，禁止对客 -->`,
    ...blocks.map((block) => cleanDirectives(block)).filter(Boolean)
  ].filter(Boolean).join('\n\n');
}

function parseOptions(argv) {
  const options = {};
  for (let index = 4; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`未知参数 ${token}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`参数 ${token} 缺少取值`);
    const name = token.slice(2);
    if (Object.prototype.hasOwnProperty.call(options, name)) throw new Error(`参数 ${token} 重复`);
    options[name] = value;
    index += 1;
  }
  return options;
}

export function runFlowCli(argv = process.argv) {
  const flow = argv[2];
  const phase = argv[3];
  if (!flow || !phase) throw new Error('用法: flow_loader.mjs <integration|onboarding> <phase> [阶段参数]');
  const options = parseOptions(argv);
  const productType = options['product-type'];
  if (flow === 'integration' && phase === 'checklist') {
    const projectPath = options['project-path'];
    if (!projectPath) throw new Error('integration checklist phase 缺少 --project-path');
    if (!productType) throw new Error('integration checklist phase 缺少 --product-type');
    process.stderr.write(`ALIPAY_AIPAY_INTERNAL:CHECKLIST_SCOPE_RECEIPT=${createChecklistScopeReceipt(productType, projectPath)}\n`);
  }
  const source = flowSource(flow);
  const phaseBlock = extractFlowBlock(source, phaseBlockName(flow, phase));
  for (const stage of stageDeclarations(phaseBlock, productType)) {
    emitStageMetricAsync(stage, { productType });
    if (stage === 'integration.user_confirmed' || stage === 'onboarding.user_confirmed') {
      markTelemetryFlowStart(process.env, Date.now(), productType);
    }
  }
  process.stdout.write(`${loadFlowBundle(flow, phase, { productType })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runFlowCli();
  } catch (error) {
    console.error(`FLOW_LOADER_ERROR:${error.message}`);
    process.exitCode = 1;
  }
}
