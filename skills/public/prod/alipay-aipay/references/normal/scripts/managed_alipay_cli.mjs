#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const installerUrl = 'https://opengw.alipay.com/alipaycli/install';
const downloadTimeoutMs = 60_000;
const installTimeoutMs = 300_000;
const maxBytes = 1024 * 1024;
const maxRedirects = 3;
const internalPrefix = 'ALIPAY_AIPAY_INTERNAL:ALIPAY_CLI_PREPARE=';

function userBin(homeDir = process.env.HOME || os.homedir()) {
  if (!path.isAbsolute(homeDir) || path.resolve(homeDir) === path.parse(homeDir).root) {
    throw new Error('alipay-cli 用户安装目录必须位于绝对 Home 路径下');
  }
  return path.join(path.resolve(homeDir), '.local', 'bin');
}

function assertAllowedInstallerUrl(value) {
  const url = new URL(value);
  const allowedHost = url.hostname === 'opengw.alipay.com' || url.hostname.endsWith('.alipayobjects.com');
  if (url.protocol !== 'https:' || !allowedHost || url.username || url.password) {
    throw new Error('alipay-cli 安装脚本地址未通过支付宝 HTTPS 白名单校验');
  }
  return url;
}

function downloadInstaller(urlValue, deadline = Date.now() + downloadTimeoutMs, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = assertAllowedInstallerUrl(urlValue);
    } catch (error) {
      reject(error);
      return;
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      reject(new Error('alipay-cli 安装脚本下载超时'));
      return;
    }

    let settled = false;
    const request = https.get(url, { headers: { 'User-Agent': 'alipay-aipay-coze-installer' } });
    const totalTimer = setTimeout(() => request.destroy(new Error('alipay-cli 安装脚本下载超时')), remaining);

    function fail(error) {
      if (settled) return;
      settled = true;
      clearTimeout(totalTimer);
      reject(error);
    }

    request.setTimeout(Math.min(15_000, remaining), () => {
      request.destroy(new Error('alipay-cli 安装脚本下载连续 15 秒无响应'));
    });
    request.on('response', (response) => {
      const status = response.statusCode || 0;
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location) {
        response.resume();
        clearTimeout(totalTimer);
        settled = true;
        if (redirectCount >= maxRedirects) {
          reject(new Error('alipay-cli 安装脚本重定向次数过多'));
          return;
        }
        downloadInstaller(new URL(location, url).toString(), deadline, redirectCount + 1).then(resolve, reject);
        return;
      }
      if (status !== 200) {
        response.resume();
        fail(new Error(`alipay-cli 安装脚本下载返回 HTTP ${status || 'UNKNOWN'}`));
        return;
      }

      const declaredLength = Number(response.headers['content-length'] || 0);
      if (declaredLength > maxBytes) {
        response.resume();
        fail(new Error('alipay-cli 安装脚本超过大小上限'));
        return;
      }

      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          response.destroy(new Error('alipay-cli 安装脚本超过大小上限'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        if (settled) return;
        settled = true;
        clearTimeout(totalTimer);
        resolve(Buffer.concat(chunks));
      });
      response.on('error', fail);
    });
    request.on('error', fail);
  });
}

function verifyCli(cliPath) {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alipay-aipay-cli-verify-'));
  try {
    const result = spawnSync(cliPath, ['version'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        XDG_CONFIG_HOME: path.join(stateDir, 'config'),
        XDG_CACHE_HOME: path.join(stateDir, 'cache'),
        XDG_DATA_HOME: path.join(stateDir, 'data')
      },
      stdio: 'ignore',
      timeout: 5000,
      windowsHide: true
    });
    return result.status === 0;
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
}

export async function prepareManagedAlipayCli(options = {}) {
  if (!['darwin', 'linux'].includes(options.platform || process.platform)) {
    return { status: 'UNSUPPORTED' };
  }

  const targetDir = userBin(options.homeDir);
  const targetPath = path.join(targetDir, 'alipay-cli');
  if (verifyCli(targetPath)) return { status: 'READY', source: 'EXISTING', path: targetPath };

  await fsp.mkdir(targetDir, { recursive: true, mode: 0o700 });
  const installerPath = path.join(os.tmpdir(), `alipay-cli-install-${process.pid}-${randomBytes(6).toString('hex')}.sh`);
  try {
    const installer = await (options.downloader || downloadInstaller)(installerUrl);
    await fsp.writeFile(installerPath, installer, { flag: 'wx', mode: 0o600 });
    const result = spawnSync('bash', [installerPath], {
      env: {
        ...process.env,
        PATH: `${targetDir}${path.delimiter}${process.env.PATH || ''}`,
        ALIPAY_CLI_BIN: targetDir,
        ALIPAY_CLI_SKIP_VERIFY: 'true'
      },
      stdio: 'ignore',
      timeout: installTimeoutMs,
      windowsHide: true
    });
    if (result.error || result.status !== 0 || !verifyCli(targetPath)) {
      throw result.error || new Error('alipay-cli 安装后功能验证失败');
    }
    return { status: 'READY', source: 'INSTALLED', path: targetPath };
  } finally {
    await fsp.rm(installerPath, { force: true }).catch(() => undefined);
  }
}

export async function runManagedAlipayCli(argv = process.argv) {
  if (argv.length !== 3 || argv[2] !== 'prepare') throw new Error('用法: managed_alipay_cli.mjs prepare');
  try {
    const result = await prepareManagedAlipayCli();
    process.stderr.write(`${internalPrefix}${result.status}\n`);
    return result.status === 'READY' ? 0 : 2;
  } catch {
    process.stderr.write(`${internalPrefix}FAILED\n`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runManagedAlipayCli().then((code) => {
    process.exitCode = code;
  }).catch(() => {
    process.stderr.write(`${internalPrefix}FAILED\n`);
    process.exitCode = 1;
  });
}
