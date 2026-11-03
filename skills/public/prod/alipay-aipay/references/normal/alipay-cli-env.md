# Coze 运行环境与工具准备

本文定义 Coze 定制版唯一环境入口的功能检测、自动准备和停止契约。Node.js 是 `runtime.mjs` 的启动前置，不由 Skill 安装或切换；`jq` 与 `alipay-cli` 缺失或功能检测失败时，由环境入口在用户目录自动准备。

## 固定入口

Integration 与 Onboarding 只执行：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" env integration-check
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" env check --product-type webpay
```

每个入口固定执行一轮“检测 -> 按需自动准备 -> 复检”：

1. 验证当前 Node.js、`jq --version`、实际 jq JSON filter 和 `alipay-cli version`。
2. 现有工具全部可用时不下载，直接输出唯一 `CLI_ENV:READY`。
3. `jq` 不可用时，固定调用 `managed_jq.mjs prepare`：只支持 macOS/Linux `x64|arm64`，从登记的 jq 1.7.1 官方 GitHub HTTPS 资产下载，校验固定 SHA-256 和实际 JSON filter 后，以 `0755` 原子写入 `~/.local/bin/jq`。
4. `alipay-cli` 不可用时，固定调用 `managed_alipay_cli.mjs prepare`：只从 `https://opengw.alipay.com/alipaycli/install` 下载官方安装脚本，安装到 `~/.local/bin`，保留 `ALIPAY_CLI_SKIP_VERIFY=true`，并用隔离的临时 XDG 目录执行 `alipay-cli version` 复检。
5. 自动准备不使用 `sudo` 或系统包管理器，不覆盖功能正常的现有工具，不修改 shell rc；受控 Shell 每次启动都会发现 `~/.local/bin`，不依赖 PATH 持久化。
6. 自动准备后两项功能均通过才输出唯一 `CLI_ENV:READY`；任一项仍不可用则输出登记消息、唯一 `CLI_ENV:UNAVAILABLE` 和内部缺项 marker 后停止。

环境入口可能联网并写 `~/.local/bin`。宿主存在网络或用户目录权限控制时，对同一条登记的 `runtime.mjs env ...` 命令授予所需权限；不得把安装拆成 Agent 自由执行的 `curl`、`npm`、`npx`、Homebrew、apt 或 yum 命令。一次入口只自动准备一轮，不循环下载。

## 输出协议

- 唯一 `CLI_ENV:READY`：静默进入下一步；不额外报告检测或安装过程。
- 唯一 `CLI_ENV:UNAVAILABLE`：说明固定自动准备未成功；stdout 是 `environment.coze.unavailable` 登记正文，剔除内部行后原文送达并停止。
- `ALIPAY_AIPAY_INTERNAL:JQ_PREPARE=READY|FAILED|UNSUPPORTED` 与 `ALIPAY_AIPAY_INTERNAL:ALIPAY_CLI_PREPARE=READY|FAILED|UNSUPPORTED`：仅在对应自动准备动作执行时产生，供 Coze 平台定位准备结果。
- `ALIPAY_AIPAY_INTERNAL:CLI_ENV_MISSING`：复检后仍缺失或功能不可用的工具，枚举只允许 `node`、`jq`、`alipay-cli`。
- marker 缺失、重复、冲突或其他非 0：停止核对，不推定环境状态。

内部 marker 只供 Coze 平台排查，禁止对客。`UNAVAILABLE` 表示统一入口已完成一次自动准备尝试；Agent 不得随后自行运行 `which alipay`、`command -v alipay`、`type alipay`、`npx alipay`、近似可执行名、直连安装器或包管理器，也不得绕过环境门禁。

CLI 业务埋点固定为 `PLATFORM=coze`、非空 `COZE_PROJECT_ID` 优先作为 `PLATFORM_ID`、`PRODUCT=WEBPAY` 和 `ALIPAYCLI_BIZ_INFO={"skill":"alipay-aipay","skill_version":"coze_v1"}`；能从当前 Coze 环境取得合法 `COZE_PROJECT_SPACE_ID` 时，`ALIPAYCLI_BIZ_INFO` 还必须携带 `skill_user_id`。`COZE_PROJECT_ID` 缺失时 `PLATFORM_ID` 才回退当前 telemetry run context。这些字段不进入 MCP 请求 JSON，`alipay-cli version` 工具检测与自动准备复检也不伪装成业务 MCP 调用。
