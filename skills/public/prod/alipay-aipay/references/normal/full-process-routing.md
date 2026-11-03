# 完整接入编排

本文件是 `full_process` 的唯一父级编排入口，只负责串联 Integration 与 Onboarding，不实现第二套代码开发流程。产品固定为 `webpay`，服务端语言固定为 Node.js。

## 启动

[`../runtime-entry.md`](../runtime-entry.md) 已在加载本文件前为 `full_process` 执行一次 `telemetry start-run`；本文件不得重复启动 telemetry。立即加载 Integration 的唯一入口：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" flow integration entry
```

从项目解析、框架确定、环境与沙箱准备、唯一 `integration.start.confirm`，到开发、验证、验收和 checklist，全部严格按 `../integration/flow.md` 的阶段顺序执行。本文件不得自行调用 `resolve-project`、`framework-resolve`、`start-confirm`，不得跳过 `prepare` 或直接加载 `development`，也不得重复执行 Integration 已完成的检查。

## 子流程衔接

- Integration checklist 只有在可见正文正常生成，且同时取得唯一 `ALIPAY_AIPAY_INTERNAL:FULL_PROCESS_INTEGRATION_HANDOFF=<json>` 时才允许衔接。该 JSON 必须有 `schema_ver=1`，并以 `integration_result`、`sandbox_config_state`、`manual_verification_items`、`configuration_state`、`onboarding_allowed` 和可选 `business_description` 为闭集；字段缺失、枚举非法、marker 重复或正文未送达时停止，不得由 Agent 自行映射。`onboarding_allowed=true` 时把这些字段分别原样绑定为 `INTEGRATION_RESULT`、`SANDBOX_CONFIG_STATE`、`MANUAL_VERIFICATION_ITEMS` 和 `CONFIGURATION_STATE`，若存在 `business_description` 则同时保留为 `BUSINESS_DESCRIPTION`，再执行：

  ```bash
  node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" flow onboarding entry
  ```

- handoff 的 `onboarding_allowed=false` 时停在 Integration 已登记的结论，不加载 Onboarding，不手写替代收口。
- Onboarding 按自身 flow 只执行一次非阻塞方案和一次组合环境入口；不得因进入第二个子流程而重启 telemetry、重跑 Integration entry 或重置已携带状态。
- Onboarding 进入 MCC 解析时，若 `BUSINESS_DESCRIPTION` 已由父级 handoff 交接，则优先把它作为 `MCC_SEARCH_QUERY`；缺失时才依据当前用户最新经营描述重新澄清。
- Onboarding 不修改项目。应用结果只输出 appId、实际状态和可安全导出的支付宝公钥；不得把同一项目操作权交回当前 Integration 执行生产配置转换。

## 状态边界

- `full_process` 固定表示当前 Skill 串行完成代码开发和产品开通，不包含生产凭证卡片、生产 appId 注入、正式网关替换或生产配置检查。用户明确提到上线或正式环境时，也只在最终收口提示后续独立生产链路。
- `CONFIGURATION_STATE` 只来自当前项目证据，当前 Skill 只接受 `SANDBOX_ACTIVE|UNRESOLVED`。进入 Onboarding 不得把项目转换为生产配置，也不得声称部署会自动切换环境。
- 后续生产链路统一见 [`../integration/modules/coze-runtime.md`](../integration/modules/coze-runtime.md)；本父级编排只负责提醒用户查看产品开通状态，并把已确认的后续边界交给独立生产链路。`full_process` 执行期间不唤起卡片、不触发 `alipay-payment-production-integration`，也不处理生产私钥；用户后续主动触发上线前准备交接时，当前 Skill 只按固定顺序先调用 `integration_detail('integration-alipay')` 唤起卡片，再衔接独立生产 Skill。
- 阶段间只复用仍有效的项目、产品、代码、沙箱和 CLI 事实。用户中断导致项目或相关事实变化时，回到对应子 flow 的登记恢复点重新校验，不恢复旧方案快照。
- 最终完成条件、部分通过条件、待办和对客正文只取两个 flow 及 runner 的登记结果；父级编排不得另建状态或生成第二份摘要。
