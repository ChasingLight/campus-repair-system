# Agent 运行框架与开发沙箱：候选分析依据

- 日期：2026-11-05
- 用途：支撑 [PoC 技术选型清单](../CAP应用开发平台-PoC技术方案.md)，解释底层职责、扩展点和接入成本，供用户选择。
- 调查方式：官方文档和源码只读核查；未安装或实测本稿候选组合。

## 1. 分清比较对象

| 层次 | 职责 | 本轮典型候选 |
| --- | --- | --- |
| 模型协议层 | 模型请求、流式输出、工具协议与用量 | 模型 API、pi-ai、自定义 provider |
| Agent Harness | 上下文、模型/工具循环、结果回灌、停止/继续、会话和扩展 | DSH、Pi coding-agent、Codex、OpenCode、OpenHands |
| 执行环境 | 文件、进程、网络、端口、资源和存续 | OpenSandbox、E2B Embed、自管容器 |
| CAP 产品控制 | 需求、任务、验证门槛、预览确认、版本和发布 | 自有状态机或工作流编排器 |

server、SDK、JSON-RPC 是接入形态。OpenCode server 内部运行其 Harness，TypeScript client 访问它；“有 server API”不足以判定内部策略是否适合 CAP。

LangGraph 可以用于建设 Agent 或编排现成 Harness，但它本身不等于已经具备完整编程工具和项目运行环境。

## 2. 本次核查基准

| 对象 | 基准与边界 |
| --- | --- |
| DSH | 官方提交 fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159，2026-11-04；核心包和 SDK 为 0.2.2-rc.1。 |
| Pi | 官方 main 提交 d57c2d21916eaad1158031526ac6ec860eae5f14，2026-11-05；与 v1.5.0 发布作对照，main 快照不等于 npm 发布构件。 |
| OpenSandbox | 稳定 release-1.2.0；重点核查 Docker 后端，不混入 rc 或 Kubernetes 专属能力。 |
| Codex | 当日官方 Harness、app-server、Hooks、模型网关文档；未作同等深度的完整内核源码审计。 |
| OpenCode | 当日 v2 文档及 dev 分支 Session/Runner 接口源码；正式采用时需固定完整提交和 server/client 配套版本。 |

### 2.1 DSH：插件化的完整 Harness

```text
profile / bundles → Cordis Context
→ AgentRegistry / AgentFactory → 默认 ReactLoopAgent
→ Session 派生上下文 → LLM adapter → tool executor / pipeline
→ fs / subprocess / sandbox 能力后端
```

具体可控点：

| 部分 | 源码事实 | 优点与代价 |
| --- | --- | --- |
| Agent loop | 默认 ReactLoopAgent；factory 可替换，preStep 装配模型、工具和上下文。 | 可深入干预步准入和请求；需理解 Cordis 与作用域。 |
| 工具执行 | 可替换 executor；pipeline 包括审批、guard、执行与结果处理；并发安全按工具判断。 | 扩展点完整；自定义执行器必须保留参数、结果和取消语义。 |
| Skill | provider 提供 list/get，目录与正文分开，显式调用与按需加载均有入口。 | 可接审核后的 CAS Skill；选择效果和资源契约仍需实测。 |
| 状态 | append-only Session 派生模型消息，JSONL provider 保存，压缩独立处理。 | 有恢复基础；暂态 token 流与已结算日志不是同一耐久保证。 |
| 外部接口 | TS/Python SDK 启动独立 dsh runtime，经 stdio JSON-RPC 通信；Web Host 有另外的控制协议。 | 不是简单进程内 import；当前 SDK 无 session/cancel，超时只停止等待。 |

源码：[AgentFactory](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/core/agent/src/index.ts)、[ReactLoopAgent](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/core/agent-loop/src/agent.ts)、[工具契约](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/core/tools/src/executor.ts)、[SDK 当前限制](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/sdk/client/README.md#known-limitations-and-deferred-work)。

DSH 可使用原生 DeepSeek adapter，也有 pi-ai provider。它复用模型传输不等于复用 Pi 的 Agent loop。源码注册与当前配置支持的协议需逐项确认。

DSH 的插件、工具授权和 OS 沙箱是不同边界；插件是受信任进程内代码。MIT 与开发预览的兼容性变动声明见 [官方 README](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/README.md)。

### 2.2 Pi：需明确选择哪一层

| 组件 | 已提供 | 主要代价 |
| --- | --- | --- |
| pi-ai | 多 provider 请求和流式协议。 | 只复用协议层时，整个 Harness 需要另建。 |
| pi-agent-core | runLoop、请求/轮次与工具前后钩子、steer/follow-up。 | 编程资源、工具、压缩和会话需要补充。 |
| pi-coding-agent | 编程工具、Skill、模板、项目上下文、JSONL 会话、压缩及 extensions。 | 平台流程、沙箱、事件提交与预览发布仍由 CAP 补齐。 |
| pi-durable | 另一条耐久 Harness 路线，含任务、Storage、ExecutionEnv。 | 实验性 API；不是 coding-agent 的直接持久化升级。 |

主要循环为模型请求 → 流式响应 → 工具调用准备与执行 → 结果回灌 → 继续或结束；有 prepareRequest、finishTurn 等策略钩子。工具串行/并行需要按具体实现配置。

来源：[agent loop](https://github.com/earendil-works/pi/blob/d57c2d21916eaad1158031526ac6ec860eae5f14/packages/agent/src/agent-loop.ts)、[coding-agent SDK](https://github.com/earendil-works/pi/blob/d57c2d21916eaad1158031526ac6ec860eae5f14/packages/coding-agent/src/core/sdk.ts)、[durable 定位](https://github.com/earendil-works/pi/blob/d57c2d21916eaad1158031526ac6ec860eae5f14/packages/durable/README.md)。

远程工具接口可实现 read/write/edit/bash 的 Operations，但实际接入还需处理：

1. grep/find/ls、用户 shell 和 extension 的其他执行路径。
2. cwd、图片、长输出、取消、超时与退出码。
3. Skill、AGENTS、模板和扩展的资源落点；部分资源仍直接从本地文件读取。
4. 控制侧环境变量的透传规则。
5. 会话落盘、平台事件和恢复状态的关联。

例如 /skill:name 的正文展开直接本地读文件，不能靠远程 read 工具自动接管。coding-agent 的事件订阅也不是异步数据库落盘确认；message_end 发出后才进入会话保存路径。

来源：[资源加载器](https://github.com/earendil-works/pi/blob/d57c2d21916eaad1158031526ac6ec860eae5f14/packages/coding-agent/src/core/resource-loader.ts)、[会话事件和资源展开](https://github.com/earendil-works/pi/blob/d57c2d21916eaad1158031526ac6ec860eae5f14/packages/coding-agent/src/core/agent-session.ts)、[隔离指南](https://github.com/earendil-works/pi/blob/d57c2d21916eaad1158031526ac6ec860eae5f14/packages/coding-agent/docs/containerization.md)。

Pi 仓库采用 MIT；官方明确没有内置文件、进程、网络和凭据权限系统。工具钩子与项目 trust 不能当作 OS 隔离。[官方 README](https://github.com/earendil-works/pi/blob/d57c2d21916eaad1158031526ac6ec860eae5f14/README.md)

### 2.3 Codex：开源 Harness 与产品协议

官方将 Harness 定位为模型周围的上下文、工具、边界与会话执行系统，并开放 CLI、app-server 和 SDK；模型与托管服务另行提供。[官方 Harness 说明](https://developers.openai.com/blog/codex-as-a-platform)

对 CAP 有用的接口包括 Thread/Turn/Item、继续线程、启动与中断轮次、流式事件和审批。动态工具提供调用扩展面，但部分字段仍为实验性；不能据此认定内置文件与命令全部已转为远程后端。[app-server](https://learn.chatgpt.com/docs/app-server)

Codex 支持自定义 provider，但当前要求兼容 Responses API，不能直接假设 Chat Completions-only 服务满足契约。Hooks 可以接生命周期策略，不构成独立隔离。[网关要求](https://learn.chatgpt.com/docs/enterprise/gateway-compatibility)、[Hooks](https://learn.chatgpt.com/docs/hooks)

整进程放入 OpenSandbox 时可保留本地文件/命令语义，再从外部连接 app-server。官方 externalSandbox 模式表示外层已经提供执行边界；它不是远程工具适配器，也不能在无外层隔离时当作等价配置。

### 2.4 OpenCode 与 OpenHands：保留为并列候选

OpenCode v2 的 Session 接口组合了历史、inbox、上下文、快照差异及 SessionRunner；server 对外开放 API，client 本身不执行编程循环。MIT 许可见 [LICENSE](https://github.com/anomalyco/opencode/blob/dev/LICENSE)。

源码观察：[Session](https://github.com/anomalyco/opencode/blob/dev/packages/core/src/session.ts)、[SessionRunner](https://github.com/anomalyco/opencode/blob/dev/packages/core/src/session/runner/index.ts)。本次读取的两个文件 blob SHA 分别为 8c1f40b76792aaf60fdadea6049d88313de25550、9f32886248b33237f0f0735961be84fcd57fbeb1；它们是文件摘要，不是可替代整仓锁版的提交号。

[v2 client](https://opencode.ai/v2/docs/build/client/) 的实时订阅无历史重放或自动重连；这不代表没有会话历史，意味着 CAP 需自己处理 UI 事件恢复。

[OpenHands SDK](https://github.com/OpenHands/software-agent-sdk) 与 [持久化](https://docs.openhands.dev/sdk/guides/convo-persistence) 提供另一套 Agent/工作区组合。它适合接受 Python 执行侧的方案；已有 Docker 工作区不能直接当作已完成 OpenSandbox 适配。

## 3. Harness 与 OpenSandbox 的接法

| 接法 | 可复用能力 | 必须验证 |
| --- | --- | --- |
| 整个 Harness 在沙箱内 | 内置工具、资源和子进程处于同一环境。 | Harness 的服务桥、启动、会话目录、凭据、端口与重建恢复。 |
| Harness 在控制侧，远程工具后端 | 集中管理策略、模型配置与会话。 | 文件、命令、搜索、图片、取消、资源加载和扩展执行必须完整覆盖。 |

DSH 有 fs/subprocess/sandbox seams 和 SSH 实现先例；Pi 有 Operations/ResourceLoader 与远程示例。它们不等于现成 OpenSandbox provider。

Codex/OpenCode/OpenHands 的进程内置能力同样要按实际边界处理。追加 MCP 工具不会自动让原有 shell 或资源加载改走沙箱。

OpenSandbox 官方 [Codex 示例](https://github.com/opensandbox-group/OpenSandbox/blob/release-1.2.0/examples/codex-cli/main.py) 和 [OpenCode 示例](https://github.com/opensandbox-group/OpenSandbox/blob/release-1.2.0/examples/opencode/main.py) 能说明运行方式，但 CLI 执行示例没有验证 CAP 的产品会话、恢复或发布集成。

## 4. OpenSandbox 的具体职责与限制

Docker 后端的主要结构：

```text
CAP Sandbox Client
→ 生命周期 Server → Docker provider → 创建/暂停/回收开发容器
→ endpoint → 容器内 execd:44772 → 命令、文件、PTY 与服务代理
→ 可选 egress sidecar → 网络策略
```

| 接口组 | 可利用能力 | CAP 仍需明确 |
| --- | --- | --- |
| 环境生命周期 | create、renew、pause/resume、kill。 | 项目映射、资源规格、期限和恢复判定；close 仅释放客户端连接。 |
| 命令执行 | 前台输出流、后台执行 ID、状态与日志、interrupt。 | 输出断开不等于成功；后台启动确认不等于进程完成。 |
| 文件与持久化 | 文件 API、host bind、named volume。 | 固定挂载身份、权限和删除策略；源码、会话与产物分别保留。 |
| 端口与预览 | HTTP/SSE/WS 代理和 endpoint。 | 老师入口的 TLS、鉴权、稳定域名、CAS 回调与 HMR。 |
| 资源与网络 | 容器资源、可选运行时与网络策略。 | 组合兼容性、允许访问的端点和实际凭据边界。 |

本次固定版本中的实际限制：

- pause/resume 是 Docker freeze/unfreeze，不是跨主机或跨重建快照；暂停不延长 TTL。
- Docker 不支持统一模型里的部分 lifecycle hooks、idlePolicy 和 secureAccess 签名入口。
- gVisor 与 networkPolicy 的组合被该版本拒绝；不能预设所有隔离与网络选项可同时开启。
- 默认运行时不等于微 VM；管理员需准备具体 runtime。
- endpoint 的内部代理地址不能直接用作学校 CAS 的外部 service 地址。

依据：[架构](https://github.com/opensandbox-group/OpenSandbox/blob/release-1.2.0/docs/architecture/index.md)、[生命周期实现](https://github.com/opensandbox-group/OpenSandbox/blob/release-1.2.0/server/opensandbox_server/services/docker/docker_service.py)、[网络兼容校验](https://github.com/opensandbox-group/OpenSandbox/blob/release-1.2.0/server/opensandbox_server/services/validators.py)、[单机网络](https://github.com/opensandbox-group/OpenSandbox/blob/release-1.2.0/docs/architecture/network/single-host-network.md)、[execd 协议](https://github.com/opensandbox-group/OpenSandbox/blob/release-1.2.0/specs/execd-api.yaml)。

## 5. 同层沙箱候选的比较口径

| 候选 | 已核对优势 | 已知代价 |
| --- | --- | --- |
| OpenSandbox Docker 后端 | 标准生命周期/命令/文件接口；利用既有 Docker 环境。 | 默认容器边界，能力随后端/版本不同；预览和工作区管理仍需 CAP。 |
| E2B Embed | 单机开源完整栈、Firecracker 与 SDK。 | KVM 和专用主机；官方发布声明不含 volumes/secrets/workload identity，不能假设项目持久化已解决。 |
| 自管 Docker + gVisor | 可裁剪接口与运行时。 | 工具服务、存续、端口、持久化和运维由 CAP 建设。 |

[E2B 官方发布](https://e2b.dev/resources/introducing-e2b-embed)、[Embed 目录](https://github.com/e2b-dev/runtime/tree/main/embed)、[gVisor Docker 接入](https://gvisor.dev/docs/user_guide/quick_start/docker/)。

E2B 部分为官方资料快速对照，未作与 OpenSandbox 相同深度的源码核验；不能仅凭共同叫“沙箱”就把卷、快照、暂停与身份能力视作相同。

## 6. 对比实验需控制变量

1. 能接入同一模型时固定模型与预算，避免将模型差异误算成 Harness 差异。
2. 固定报修需求、CAS Skill、模板、依赖和验收断言。
3. 分别测试正常完成、失败修复、主动取消和事件断线。
4. 将会话恢复、文件恢复、进程恢复和外部副作用分别核对。
5. 在选定组合上验证 V1/V2 发布与业务数据保留。

本稿只提供候选依据，不给未经实测的成功率、速度、成本或质量排名。最终组合由用户选择后进入 PoC 验证。
