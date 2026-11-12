# REA 补充取证：扣子编程的可观察架构

- 日期：2026-11-05
- 结果：已实际运行 REA CLI，完成网络记录解析与前端 JavaScript 静态分析。
- 结论：补强了会话、技能、沙箱、预览和部署的对外契约；未还原扣子云端编程控制器。
- 脱敏索引：[REA 证据摘要](evidence/扣子编程-REA证据摘要.json)。
- 原始证据：保存在本机 `/private/tmp/cap-rea-evidence/`，不纳入 Git。临时目录可能被系统清理，需要长期留存时应另行归档。

## 1. 实际做了什么

| 项目 | 本次结果 |
| --- | --- |
| 工具 | 临时安装 rea-agents 6.8.0 与 Node 22.23.4；使用 CLI，未注册 MCP。 |
| 浏览器采集 | 从用户已打开的项目，经 Chrome DevTools 导出 HAR；覆盖页面加载、技能列表和部署总览，未发起新编程任务或新部署。 |
| 原始记录 | 完整 HAR 为 371 条记录、6 条 WebSocket 连接、281 帧；请求开始时间为北京时间 11:34:23–11:37:27。 |
| REA 网络分析 | 从完整 HAR 选择项目、预览及全部 WebSocket 记录，保留 129 条；完成离线解析，退出码 0。 |
| REA 静态分析 | 从 HAR 提取 10 份业务 JS，REA 重点解析技能和会话接口的 2 份，共 6 个解析模块，0 个解析失败；其余文件作人工定向核对。 |

采集的是当前页面操作。页面自身会初始化沙箱连接和终端会话；不能将所有请求都称为无副作用 GET。REA 离线解析没有重放记录中的 URL，静态分析未执行目标 JavaScript。

完整 HAR 超过 REA 的单文件输入上限，因此保留原件，生成带原始序号映射的选择集。Chrome 导出的 serverIPAddress 含方括号 IPv6 和空值，另作可追溯规范化；请求、响应和 WebSocket 扩展未改动。

REA 网络解析和静态分析均有完整 Evidence 文件及 SHA-256；选择、规范化和脚本提取的 manifest 保存在原始证据目录。摘要记录最终成功执行的证据 ID，不将早期环境失败当作成功结果。

## 2. 新增的五项架构证据

以下 `F[n]` 指完整 HAR 的零基记录序号。

| 观察对象 | 可证事实 | 对 CAP 的启示 |
| --- | --- | --- |
| 项目与会话 | 项目配置、conversation/list、chat/history、queue 分别查询；历史有 round_no、sequence_id、finish、reply_id 和 token_cost。F[107,121,130,136] | 项目、会话、消息轮次和任务状态分别持久化。 |
| 技能配置 | 当前会话保存 22 项 skill_setting；元数据明确区分 is_preload。F[121,132] | 管理 Skill 目录、选择和预加载配置，另外记录实际激活与读取。 |
| 对话与沙箱通道 | 前端主对话使用 Frontier/FWS；沙箱另有 JSON-RPC WebSocket。F[111,129,149,173,181] | 聊天事件与工作区控制采用独立适配接口。 |
| 预览生命周期 | 捕获 preview.status 返回 running、preview_enabled；另有 web.is_server_start 返回 ready。F[181] | 预览需要状态、健康检查与地址，不只是一段 URL。 |
| 发布与在线版本 | deploy_history/list 与 get_online 分开，另有 deploy_config 和 deploy_unit。F[345,349,352,353] | 发布尝试、阶段状态和生效版本分别管理。 |

这些是当前客户端和服务响应的证据，不是对服务端源码或调度器的证明。

### 2.1 Skill 预加载：可以确认到哪一步

`POST /v1/skill/by_ids` 当前返回 22 项元数据：

| 配置 | 当前观测 |
| --- | --- |
| is_preload=true | Web 性能最佳实践、前端设计进阶 |
| is_preload=false | 其余 20 项 |
| 会话配置 | conversation_setting.skill_setting 保存技能 ID 和 preload 标记 |
| 未取得 | Skill 正文注入、系统 prompt、原始生成时的激活和读取日志 |

“前端设计进阶”的元数据描述明确提到编写 DESIGN.md。这强化了当前设计能力配置的证据，但 **DESIGN.md 的原始生成来源仍未确认**。

本地 56 个一级技能、63 个 SKILL.md，网页选中 22 项，以及当前目录查询返回 35 项，是三种不同集合。

`GET /v1/api/project/tools` 实际返回项目类型的搜索、图片生成等 UI 开关，不是内部文件编辑、write_todos、test_run 的完整工具 schema。

### 2.2 历史消息与实际模型

当前 history 每次只返回 10 条，`has_more=true`。已取得片段只有 user、answer 和 thinking，未取得原始生成过程的结构化 tool_call。

模型目录返回 15 个选择项；Auto 对应空的模型名称，当前会话也采用默认选择。它能证明配置处于 Auto，不能确定某轮真正使用的模型。

全局配置存在 `chat.context_management.compression_threshold`，界面也显示压缩状态；压缩算法和压缩后的上下文仍未知。

## 3. 通道与消息的实际边界

| 通道 | 本次保留的内容 | 边界 |
| --- | --- | --- |
| Frontier `/ws/v2` | 3 条连接、58 帧，包含状态通知；部分为二进制。 | 未取得一轮编程任务的完整 query → token/tool → finish 序列。 |
| 沙箱 `/ws/devbox/{id}/api/ws` | 2 条连接、112 帧；含版本查询、sandbox.ping、project_status、preview.status、文件和终端相关方法。 | 工作区控制消息不能当成模型编程消息。 |
| Next.js HMR | 1 条连接、111 帧。 | 属于生成应用的开发热更新。 |

当前没有 text/event-stream 响应。前端另有节点解释和 API 示例中的流式实现，不能据此推断主编程对话使用 SSE。

前端存在重新连接后补查会话、history 和 queue 的逻辑；这说明客户端有恢复设计，不能证明服务端能够无丢失重放。

## 4. 前端静态核对结果

REA 从两份短 bundle 恢复了相关 webpack 模块：

| 文件／模块 | 结构核对 |
| --- | --- |
| 043-6798.cd67186c.js／52663 | 技能默认值、按 ID 查询和列表查询的接口包装。 |
| 083-4434.b633e7dc.js／94579 | 会话、历史、队列及会话配置更新的接口包装。 |

结合另外八份脚本的人工定向核对，可以看到以下关系：

1. 当前会话 skill_setting → selectedSkills → add_skills/remove_skills → 会话配置更新。
2. write_todos、test_run、load_skill → 通用 tool_call 展示卡片，读取状态、参数和内容。
3. builder-chat-websocket-channel → 获取连接参数 → FWS 发送、接收和消息分发。
4. 沙箱连接 → JSON-RPC 请求与通知 → 版本、预览、文件和终端状态。
5. 选定 commit → 部署配置与发布历史 → 运行单元与在线版本。

第 1–2 项只能证明配置和展示支持，不能从前端代码得到工具执行器实现。REA 自动关系图仍为 partial；动态 HTTP 包装未被完整识别，接口方法和路径由 HAR 响应及源码片段交叉确认。

具体人工锚点均为零基 UTF-8 byte offset：

- 092 bundle：技能选择约 540872、配置更新约 1069770、工具标题约 564715、通用结果卡约 575414。
- 092 bundle：主对话 WebSocket 约 1044366、沙箱初始化约 1013966。
- 089 bundle：预览状态、打开和关闭约 151670。
- 319 bundle：发布轮询约 171808，展示状态选择约 16856。
- 006 bundle：发布创建包含 commit_hash 和 deploy_config，约 1193804。

完整文件名、来源与摘要见临时目录 frontend-script-manifest.json。未获得的 source map、未选入 REA 分析的模块和动态关系均不补写为事实。

## 5. 发布状态不能压成一个布尔值

最新一次发布与当前在线版本不同：

| 层次 | 最新尝试的观测 |
| --- | --- |
| 发布历史顶层 | Canceled |
| 主要部署目标 detail | Failed |
| Package 阶段 | Succeeded |
| Build 阶段 | Failed |
| Deploy 阶段 | Canceled |

前端优先用主要目标 detail 的状态显示“部署失败”，与顶层取消状态并不矛盾。get_online 仍返回旧成功版本。

这证明了实体与状态分离，没有证明自动回滚已执行。已有日志只有构建中止/连接关闭证据，不能把新增技能文件当作失败原因。

## 6. 对技术方案的修正

建议 CAP 明确以下五项契约：

1. **项目与会话分开**：源码工作区与对话历史各自持久化，按项目和会话 ID 关联。
2. **配置与执行分开**：记录 selected/preload/activated/read，避免把“已选技能”当“已执行能力”。
3. **聊天与环境分开**：编程消息事件、工作区 RPC、预览状态各有清晰接口。
4. **发布与在线版本分开**：发布记录绑定代码版本，阶段失败不自动覆盖在线版本指针。
5. **结果与判断分开**：工具回执、原始断言、截图与日志构成验证证据，模型摘要不独自决定通过。

新增证据加强了“持久状态 + Harness 适配 + 环境控制 + 独立发布”的必要性。Harness、沙箱及配套候选统一列入 [技术选型清单](../CAP应用开发平台-PoC技术方案.md)，由用户决策，不作未经对比验证的主备排序。

## 7. 可复核材料

- [仓库中的脱敏摘要](evidence/扣子编程-REA证据摘要.json)：版本、原件摘要、选集口径、操作状态和关键路径模板。
- 原件：`/private/tmp/cap-rea-evidence/coze-full-resources.har`。
- 最终选集：`/private/tmp/cap-rea-evidence/coze-platform-final.har`。
- 网络结果：`/private/tmp/cap-rea-evidence/rea-platform-final-evidence.json`。
- 静态结果：`/private/tmp/cap-rea-evidence/rea-frontend-evidence-v2.json`。

原始记录和 REA 完整结果可能保留敏感查询参数及响应内容，只在本机私有目录保存。SHA 用于复核文件一致性，不证明服务端真实性或原始观测完整。

本轮未发起新编程任务，因此独立 Planner、多 Agent、原始 Skill 注入和编程运行轨迹仍未确认。选定组合后，按 [技术选型清单](../CAP应用开发平台-PoC技术方案.md) 的统一口径进行 PoC 对比验证。
