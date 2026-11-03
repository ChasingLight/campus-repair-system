---
name: general-deploy
description: 必须在以下时机加载：项目初始化对账时；任务最终交付前；产物类型切换或目标类型骨架重建后；构建产物、启动入口、运行时依赖、目录结构或 `.coze` 发生变化后；用户提供部署失败日志或要求修复部署配置时。用于确认项目是否支持部署，并创建、修复或校验 `.coze` 的部署配置；已有 `[deploy]` 只算输入事实，不能作为跳过本 skill 的依据。
---

# Coze Deploy Config Editor

负责维护项目根目录 `.coze` 中与部署识别、运行时、构建命令和启动命令相关的配置，使项目可以被 Coze Deploy 正确识别、构建和启动。

## Use This Skill When

- 项目初始化对账需要确认或补齐部署配置；已有 `[deploy]` 也要把它当作输入事实重新确认，而不是直接视为完成。
- 任务彻底交付前需要确认部署配置已经可用，尤其本轮发生过代码、脚本、运行时、构建产物、启动入口、目录结构或 `.coze` 变更。
- 用户要求切换产物类型、重建目标类型骨架，或从 web / miniprogram / app / backend / agent / workflow 等类型迁移到另一类产物后，需要重新配置部署。
- 用户提供部署失败日志、部署平台错误、部署配置缺失/错误/不兼容等问题，需要修复部署配置。
- 用户要求创建、修复、更新或校验 `.coze`
- 用户要求设置或调整 `project.entrypoint`、`project.requires`、`deploy.profile`、`deploy.build`、`deploy.run`、`deploy.deps`、`deploy.build_app_dir`、`deploy.backend`
- 用户要求根据平台支持语言选择正确的 `project.requires`
- 部署平台无法识别项目类型，或提示 deploy 配置缺失、错误或不兼容
- 用户只想判断项目属于哪类仓库，或应该以什么 deploy surface 运行

## Do Not Use This Skill For

- 排查线上实例、日志、发布记录、环境权限等非 `.coze` 配置问题
- 修改业务代码来适配部署，除非用户明确要求
- 编造平台未确认支持的字段、枚举值、包管理器、端口或系统依赖

## Working Principles

1. 先读现有 `.coze` 和仓库事实，再决定是否修改；不要先问用户项目类型，优先自行判断。
2. 根目录 `.coze` 和子目录 `.coze` 都可以按各自项目实际情况读取、创建或修改；不要把子目录 `.coze` 简化成无关样例，也不要误把某个子项目的配置直接套到另一层目录。
3. 根目录 `.coze` 仍是最终执行入口；如果同时维护子目录 `.coze`，需要保证根目录执行时引用的入口、脚本和相对路径仍然成立。
4. 已存在 `.coze` 时只做对应目录内的增量修改；保留未知 section、非 deploy 配置和用户自定义内容。
5. 默认行为是把识别结果写回目标 `.coze`；只有用户明确要求“只检查”“只判断”或“不要改文件”时，才允许只读分析。
6. 默认不要生成 `[preview]` 或 `[dev]`；这两类 section 不属于本 skill 的必写范围。
7. 不要把“仓库类型”直接等同于 `deploy.profile.flavor` 或 `deploy.build/run` 模板；这三者要分别判断。
8. 对 `build/run/deps/runtime` 的判断，优先保留现有可用配置或命中的已知模板，不要用“通用写法”覆盖。
9. 如果仓库信号互相冲突或无法识别为受支持类型，不要猜测，直接说明依据与阻塞点。
10. 如果 `deploy.build/run` 只能靠猜测，宁可停下来说明缺失信号，也不要编造一套近似命令。
11. `deploy.build/run` 默认基于对应 `.coze` 所在目录执行；不要额外引入任何 workdir 包装。
12. 如果根目录 `.coze` 调度子目录脚本，不能只确认脚本文件存在；还要确认脚本内部会落到正确的项目根目录，而不是默认回到调用时的 `pwd`。优先接受基于脚本位置推导项目根目录的写法，例如 `SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"` 配合 `PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"`；像 `COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"` 这类默认当前目录的写法，如果实际执行时会停在仓库根或其他错误目录，应视为不安全。
13. 对外提供 HTTP 服务的项目，启动端口固定为 `5000`；不要根据框架默认值或仓库脚本自行猜成 `3000`、`8000`、`8080` 等其他端口，除非用户明确要求。
14. 向用户解释平台支持的运行时时，只说明支持的语言和版本，以及对应的 `project.requires` key；不要展开 build image、runtime image 或 tag 等实现细节。
15. `deploy.build` 和 `deploy.run` 统一使用脚本入口；不要写成 `bash -c`、`bash -lc` 或其他内联 shell 片段。
16. 对于生成式 Agent / Workflow / App 模板，不要只校验 `.coze`。还要做一次部署启动前检查：脚本工作目录、`COZE_WORKSPACE_PATH`、`COZE_PROJECT_TYPE`、端口、配置文件路径和数据库环境变量获取逻辑是否能在 FaaS 部署环境成立。若问题落在业务代码或模板运行时代码，只有用户要求部署成功或允许修代码时才修改；否则报告为 `.coze` 之外的风险。

## Workflow

1. Inspect
   - 读取目标项目所在目录的 `.coze`；如果不存在则记录为待创建。若仓库同时存在根目录和子目录 `.coze`，要分别识别各自服务的配置需求。
   - 查看能识别项目类型和命令模板的关键文件：`package.json`、`requirements.txt`、`pyproject.toml`、`go.mod`、`pom.xml`、`mvnw`、`project.config.json`、`app.json`、`app.config.ts`、`app.config.js`、`build.gradle`、`settings.gradle`、skill 清单、锁文件和现有启动脚本。
   - 扫描仓库中的 `.sh` 文件，不要只看 `.cozeproj/scripts/*` 或 `scripts/*`。优先检查名称和内容都像 deploy 脚本的候选，例如包含 `build`、`setup`、`install`、`run`、`start`、`serve`、`http`、`pack` 等信号的脚本。
   - 对候选 `.sh` 文件要读内容再判定职责，确认它实际负责什么：安装依赖、构建、启动、端口处理、参数解析，以及它依赖的工作目录假设；不要只凭文件名下结论。
2. Detect Repo Type
   - 先看用户显式意图，再看现有 `.coze`，最后看仓库结构。
   - 得出 `repo_type`、`deploy_kind`、`deploy_flavor`、`project_entrypoint`、`runtime_requires`、`service_port`。
3. Resolve Command Strategy
   - 按优先级确定 `deploy.build`、`deploy.run`、`deploy.deps` 的来源：现有 `.coze`、已知模板 reference、仓库原生命令或无法确定。
   - 如果根目录 `.coze` 需要调度子目录项目，必须额外核对脚本相对路径、入口路径和产物路径是否仍然相对根目录有效；不要直接照搬子目录 `.coze` 中的相对路径。
   - 上述核对不只看 `.coze` 里的路径字符串；还要按真实调用方式检查脚本内部的 `cd`、`dirname "$0"`、`COZE_WORKSPACE_PATH`、包管理器和产物相对路径假设。像根 `.coze` 执行 `bash subproj/scripts/build.sh`、但脚本内部再 `cd "${COZE_WORKSPACE_PATH:-$(pwd)}"` 回到仓库根，导致 `pnpm install` / `npm run` / `python` 在错误目录执行的情况，应直接判定为需要修正。
   - 对根 `.coze` + `[subprojects] path = ["projects"]` 结构，优先按根目录视角写 `.coze` 路径，例如 `projects/scripts/setup.sh`、`projects/.cozeproj/scripts/prod_build.sh`、`deploy.build_app_dir = "./projects/client"`；同时脚本内部必须按自身位置回到 `projects` 子项目根，而不是依赖调用时的 `pwd`。
   - 只有在命令来源清晰时才写入；不要仅凭项目类型硬编码命令。
4. Edit
   - `.coze` 不存在时创建最小可用配置，并把识别出的结果实际写入文件。
   - `.coze` 已存在时只更新需要修正的字段，不删除无关 section。
   - 如果已存在 `[deploy]`，优先保留其中已有的 `build`、`run`、`deps`，除非它们与仓库事实或命中的模板 reference 冲突。
   - 如果 `.coze` 里的脚本路径已经正确，但脚本内部的工作目录解析错误，优先修脚本本身；不要为了绕过问题把 `.coze` 改成更深的相对路径、`bash -c`，或其他一次性命令拼接。
   - 不要为了补全模板而新建 `[preview]` 或 `[dev]`。
5. Verify
   - 回读 `.coze`，检查字段组合是否合法、是否真实落盘、是否被错误“简化”为另一套命令。
   - 确认 `deploy.profile.kind`、`deploy.build`、`deploy.run` 都真实存在于文件中；仅当 `deploy.profile.kind = "service"` 时确认 `deploy.profile.flavor` 存在。
   - 如果根目录 `.coze` 调度子目录脚本，至少静态演算一次“从仓库根执行 `bash subproj/scripts/build.sh` / `bash subproj/scripts/run.sh`”时脚本最终会落到哪个目录；确认安装、构建、启动命令看到的是子项目自己的 `package.json`、`pyproject.toml`、`go.mod`、`pom.xml` 等信号，而不是仓库根目录。
   - 对 Python Agent / Workflow，静态检查 `http_run.sh` 是否最终导出正确运行环境：Agent 应导出 `COZE_PROJECT_TYPE=agent`，Workflow / Automation 应导出 `COZE_PROJECT_TYPE=workflow` 或至少不依赖错误类型；如果代码通过 `COZE_WORKSPACE_PATH` 定位配置，应在脚本中把它固定到项目根目录。
   - 对依赖数据库、配置文件或平台环境变量的模板，检查启动路径是否会读取到真实文件。例如 Agent 的 `agent_llm_config.json` 如果位于 `config/`，运行时不能因为 `COZE_WORKSPACE_PATH` 指向错误目录而去找 `/opt/bytefaas/config/agent_llm_config.json`；数据库连接不能因为平台环境变量接口暂时失败就导致整个 HTTP 服务无法启动，除非业务明确强依赖数据库。
6. Report
   - 输出修改摘要和风险，不要把猜测当事实。

## Detection Order

按以下优先级决策，前一层足够明确时不要被后一层覆盖：

1. 用户明确指定的项目类型、部署目标或命令来源
2. 现有 `.coze` 中已经存在且与仓库事实不冲突的配置
3. 命中的已知模板 reference
4. 全仓库 shell 脚本、仓库文件结构、入口文件和锁文件
5. 无法确定时保守退出并解释原因

## Repo Type Heuristics

- `web`
  - 存在 `package.json`、`go.mod`、`pom.xml`、`mvnw` 或非 Android 的 `build.gradle`，并且项目明显是 HTTP 服务或服务型 Web 项目
  - 对于 Vite 纯前端仓库，当前平台也按 `service` 处理；不要因为缺少后端代码就把它排除在 `web` 之外
- `agent`
  - 存在 `requirements.txt` 或 `pyproject.toml`，并且项目明显是 Python 智能体仓库
  - 强信号包括平台项目类型为 Agent、现有 `.coze` / 项目模板语义指向 agent、存在 `src/agents/agent.py`、`agents/`、`agent_llm_config.json` 或 `graph_helper.is_agent_proj()` 一类智能体入口
- `workflow`
  - 存在 Python 服务结构，且用户意图或项目语义明确指向 workflow / automation
  - 强信号包括平台项目类型为 Automation、现有 `.coze` / 项目模板语义指向 workflow、存在 `src/graphs/graph.py`、`src/graphs/state.py`、LangGraph `StateGraph` 编排或工作流节点结构
- `miniprogram`
  - 存在 `project.config.json`、`app.json`、`src/app.config.ts`、Taro 依赖、`taro build --type weapp` / `tt` 脚本，或典型小程序目录结构
- `android`
  - App 项目也归为 Android；强信号包括 Expo / React Native 配置，例如 `client/app.config.ts`、`client/app.config.js`、`expo-router`、`expo`、`react-native`、`client/package.json`、`deploy.build_app_dir`
- `skill`
  - 存在 `[skill]`、`.skill`、skill 清单文件，或仓库明显是 skill 项目

如果命中多种信号，优先选择更强的项目级标识；仍冲突时不要自行定型。

## References

只有在需要确定 `project.requires` 白名单或 `deploy.build/run/deps` 模板时，才读取对应 reference：

- 选择 `project.requires` 前：读取 [references/runtime-whitelist-20260325.md](references/runtime-whitelist-20260325.md)
- 命中 Next.js 包装脚本模板：读取 [references/web-next-wrapper.md](references/web-next-wrapper.md)
- 命中 Vite 纯前端 service 模板：读取 [references/web-vite-frontend-service.md](references/web-vite-frontend-service.md)
- 命中 Expo Android App + 后端模板：读取 [references/app-expo-android-service.md](references/app-expo-android-service.md)
- 命中 Taro 小程序 + 后端模板：读取 [references/miniprogram-taro-service.md](references/miniprogram-taro-service.md)
- 命中 Python Agent 服务模板：读取 [references/python-agent-service.md](references/python-agent-service.md)
- 命中 Python Workflow 服务模板：读取 [references/python-workflow-service.md](references/python-workflow-service.md)
- 命中普通 Python HTTP service 模板：读取 [references/python-http-service.md](references/python-http-service.md)
- 命中简单 Go HTTP 服务模板：读取 [references/go-http-service.md](references/go-http-service.md)
- 命中简单 Java HTTP 服务模板：读取 [references/java-http-service.md](references/java-http-service.md)

不要一次性加载所有 reference；根据命中的模板特征只读必要文件。
如果 reference 不仅提供 `.coze` 命令模板，还提供脚本编写规则，则在“脚本缺失但命令来源清晰”时按该 reference 生成脚本。

## Field Rules

1. `web / agent / workflow` 统一写为 `deploy.profile.kind = "service"`。
2. Android 项目写为 `deploy.profile.kind = "android"`，其中 App / Expo / React Native 项目也属于 Android；小程序项目写为 `deploy.profile.kind = "miniprogram"`；这两类不写 `deploy.profile.flavor`。
3. `deploy.profile.flavor` 仅允许 `web | agent | workflow`，且仅在 `deploy.profile.kind = "service"` 时写入。
4. `deploy.profile.flavor` 表示 service 的展示与提示词子类；普通 HTTP service 写 `web`，明确的 Agent 写 `agent`，明确的 Workflow / Automation 写 `workflow`。不要因为 Agent / Workflow 最终以 HTTP 服务启动就强行写成 `web`。
5. 如果存在 `[skill]` 且项目明显是 skill 项目，识别结果视为 `kind=skill`。
6. `project.entrypoint` 必须指向实际运行入口，优先取现有 `.coze` 或命中的模板 reference。
7. `project.requires` 只能从 runtime whitelist reference 中选择受支持的 key，不要编造白名单外的值。
8. `project.requires` 的取值优先级为：现有 `.coze` 中已验证可用且仍在白名单内的 runtime > 命中的已知模板 reference > 仓库内明确工具链主版本信号与 runtime whitelist 的交集 > 明确的平台策略。
9. 不要因为“某语言通常用某个版本”之类的泛化经验，就把一个已知模板或现有 `.coze` 中的 runtime 强行改写成其他版本。
10. 对于 Node、Python、Go、Java 仓库，先识别语言和主版本，再映射到 runtime whitelist 里的 key；如果主版本无法可靠识别，只能在白名单内保守选择并说明依据。
11. `deploy.build_app_dir` 仅在 Android 场景写入；Expo / React Native App 模板通常为 `"./client"`，必须确认目录存在。
12. `deploy.backend.enabled` 只有在现有 `.coze` 已存在、命中的 reference 明确要求，或仓库事实明确需要时才写入；Android / 小程序项目如果包含 `server/`、后端启动脚本或 deploy run 服务壳，本期应写为 `true`。
13. `deploy.deps` 只有在仓库事实或命中的 reference 明确要求时才写入；不要因为模板习惯而默认补写。
14. 如果没有明确系统依赖，不要写 `deploy.deps = []`；应直接省略 `deploy.deps` 字段。
15. 对外提供 HTTP 服务时，`deploy.run` 必须明确或最终保证监听 `5000` 端口；优先由脚本自身处理，不要通过 `bash -c` 一类内联命令注入端口。
16. 当前平台不支持把纯前端项目按纯静态站点单独部署；如果仓库是 Vite 等纯前端项目，也必须产出可在服务端运行的 `deploy.run`。
17. 当前平台暂不支持纯前端小程序或纯前端 Android 部署；如果无法确认后端或服务壳，不要补写 `deploy.backend.enabled = false`，应停止并说明缺失信号。
18. 不要为了“看起来完整”而补写无法从仓库或用户需求验证的字段。
19. 对于已识别出的 `deploy.profile.kind`，只要当前任务不是只读检查，就必须写入 `.coze`；`deploy.profile.flavor` 仅在 service 场景写入。仅在报告中展示不算完成。
20. `[preview]` 和 `[dev]` 默认禁止新增；只有这两个 section 已存在，或用户明确要求配置它们时，才允许修改。

## Build/Run Resolution Order

按以下顺序确定 `deploy.build`、`deploy.run`、`deploy.deps`：

1. 现有 `.coze`
   - 如果 `[deploy]` 已存在且与仓库事实不冲突，优先保留。
   - 如果仓库已经明确命中某个 reference，而现有 `[deploy]` 用的是与该 reference 相冲突的裸命令形式，也视为冲突，不能因为“能跑”就保留。
2. 已知模板 reference
   - 如果仓库明显命中某个模板特征，读取对应 reference，并按 reference 原样写入命令和依赖。
3. 仓库脚本扫描
   - 先扫描仓库里的 `.sh` 文件并分类，不要把搜索范围限制在 `.cozeproj/scripts` 或 `scripts`。
   - 如果某个已有脚本经过内容确认，明显承担了安装依赖、构建或启动 HTTP 服务的职责，就优先复用该脚本，即使它位于自定义目录。
   - 如果找到了多个候选脚本，优先选择职责单一、与 deploy 语义最接近、且端口和入口最清晰的那组；冲突时不要猜。
4. 仓库原生命令
   - Node 项目：在完成 `.sh` 扫描后，再看 `package.json` scripts、`packageManager` 字段和锁文件；如果确认缺少可复用脚本，但底层命令明确，可生成脚本入口而不是内联命令。若已命中 Next.js 包装模板且完整扫描后确认不存在合适脚本，可补齐 `.cozeproj/scripts/deploy_build.sh` 与 `.cozeproj/scripts/deploy_run.sh`。若已命中 Vite 纯前端 service 模板，则继续补齐 `scripts/build.sh` 与 `scripts/run.sh`，不要停在“只有前端构建、没有服务端入口”的状态。
   - Android 项目：在完成 `.sh` 扫描后，再看 Expo、React Native、Gradle、`build_app_dir` 和后端服务入口。若命中 Expo Android App + 后端模板，仍按 Android 处理，优先复用 `.cozeproj/scripts/prod_build.sh` 与 `.cozeproj/scripts/prod_run.sh`，并写入 `deploy.profile.kind = "android"`、`deploy.build_app_dir` 和 `deploy.backend.enabled = true`。如果只有客户端目录、没有后端或服务壳，不要猜测纯前端部署配置。
   - 如果 Android / App 项目使用根 `.coze` 调度 `projects/.cozeproj/scripts/prod_build.sh` 或类似子项目脚本，脚本内的 `ROOT_DIR` / `PROJECT_DIR` 必须从 `SCRIPT_DIR` 推导到 `projects` 子项目根；不要保留 `ROOT_DIR="$(pwd)"`，否则 BuildZip 阶段可能在仓库根运行包管理器并失败。
   - 小程序项目：在完成 `.sh` 扫描后，再看 Taro、`project.config.json`、`app.json`、`build:weapp`、`build:tt`、`pack`、后端服务入口。若命中 Taro 小程序 + 后端模板，优先复用 `.cozeproj/scripts/deploy_build.sh` 与 `.cozeproj/scripts/deploy_run.sh`，并写入 `deploy.profile.kind = "miniprogram"` 与 `deploy.backend.enabled = true`。如果只有小程序前端、没有后端或服务壳，不要猜测纯前端部署配置。
   - Python Agent 项目：在完成 `.sh` 扫描后，再看 `src/main.py`、`src/agents/agent.py`、LLM config、`scripts/setup.sh`、`scripts/http_run.sh`。若命中 Python Agent 服务模板，写入 `deploy.profile.kind = "service"` 与 `deploy.profile.flavor = "agent"`，并优先复用现有脚本。不要因为它以 HTTP 服务启动就把 flavor 改成 `web`。
   - Agent 的 `http_run.sh` 不能依赖平台注入的 `COZE_WORKSPACE_PATH` 默认值；应从脚本位置推导 `PROJECT_DIR`，`cd "$PROJECT_DIR"`，并导出 `COZE_WORKSPACE_PATH="$PROJECT_DIR"`。如果项目依赖类型判断，还应导出 `COZE_PROJECT_TYPE=agent`。
   - Python Workflow 项目：在完成 `.sh` 扫描后，再看 `src/main.py`、`src/graphs/graph.py`、`StateGraph`、`scripts/setup.sh`、`scripts/http_run.sh`。若命中 Python Workflow 服务模板，写入 `deploy.profile.kind = "service"` 与 `deploy.profile.flavor = "workflow"`，并优先复用现有脚本。平台项目类型 Automation 可作为 workflow 强信号。
   - Workflow / Automation 若包含数据库或异步任务运行时，启动路径应允许数据库环境变量获取失败时降级为内存 checkpointer 或明确报出业务阻塞；不要让非必需 DB 初始化在 lifespan 阶段直接阻断 HTTP 服务启动。
   - 其他 Python HTTP 服务项目：在完成 `.sh` 扫描后，再看明确的 HTTP 入口和安装方式；如果确认缺少可复用脚本，但入口和安装方式明确，可生成脚本入口而不是内联命令。若已命中 Python HTTP service 模板且完整扫描后确认不存在合适脚本，可补齐 `scripts/setup.sh` 与 `scripts/http_run.sh`。
   - Go / Java 项目：优先复用仓库里已有脚本、wrapper 或 Make target；如果完整扫描后确认缺失、且仓库明确命中了简单 HTTP 服务 reference，可按对应 reference 补齐 `scripts/build.sh` 与 `scripts/run.sh`。命中这类 reference 时，不要退化成裸 `mvn`、`java`、`go build`、`go run` 命令写进 `.coze`。如果命令、产物路径或端口处理仍不清晰，不要只凭语言编造 `build/run`。
5. 无法确定
   - 如果无法可靠判断命令、包管理器或端口参数，不要编造，直接说明阻塞点。

仅凭 `repo_type=web`、`repo_type=agent` 或 `deploy.profile.flavor=web` 这类结论，不足以推出具体的 `build/run` 命令。
如果服务是 HTTP 形态，则 `5000` 是默认且固定的运行端口，命令解析时应优先保证这一点。

## Write-Back Requirements

- 服务型项目至少要把识别结果写成合法 TOML 嵌套表：

```toml
[deploy.profile]
kind = "service"
flavor = "web"
```

- Android 项目至少要把识别结果写成合法 TOML 嵌套表，且不要写 `flavor`。App / Expo / React Native 项目也使用这套 Android 画像：

```toml
[deploy.profile]
kind = "android"

[deploy.backend]
enabled = true
```

- 小程序项目至少要把识别结果写成合法 TOML 嵌套表，且不要写 `flavor`：

```toml
[deploy.profile]
kind = "miniprogram"

[deploy.backend]
enabled = true
```

- 如果命中了已知模板 reference，`project.entrypoint`、`project.requires`、`deploy.build`、`deploy.run`、`deploy.deps`、`deploy.backend.enabled` 应优先按 reference 原样写入，不要擅自“简化”为另一套看似等价的命令。
- 如果命中 Android / Expo App reference，`deploy.build_app_dir` 必须指向真实客户端目录；如果目录不存在，不要写入近似路径。
- 如果仓库命中 Vite 纯前端 service 模板，不要把 `deploy.run` 留空，也不要把 `vite preview` 当成最终部署命令；必须落成可在服务端长期运行的脚本入口。
- 如果 `deploy.build/run` 指向脚本，而仓库里缺少对应脚本文件，只有在完成全仓库 `.sh` 扫描后仍确认不存在合适脚本、且 reference 或仓库事实已经把脚本职责说明清楚时才补建脚本；否则停止并说明缺失依据。
- 如果简单 Go / Java HTTP reference 已经命中，而现有或候选配置仍是裸 `mvn` / `java` / `go build` / `go run` 命令，应把它视为“需要修正”的状态：要么落成脚本并让 `.coze` 指向脚本，要么明确说明为什么当前仓库不适用该 reference。
- 如果 `.coze` 里已经有且确认应保留的 `[deploy]`，则保留它，只补齐缺失或错误的字段。
- 如果 `.coze` 的脚本路径已经正确，但脚本内部会把构建或启动命令落到错误目录，应优先修脚本本身，而不是为了迁就错误脚本去重写 `.coze` 路径。
- 最小写回集合应聚焦在 `project.entrypoint`、`project.requires`、`deploy.profile`、`deploy.build`、`deploy.run`、`deploy.deps`、`deploy.backend.enabled`、`deploy.build_app_dir` 等必要字段，不要顺带生成 `[preview]` 或 `[dev]`。
- 如果 `deploy.build/run` 依赖相对路径或脚本文件，直接基于对应 `.coze` 所在目录执行；不要额外包一层 workdir 逻辑。
- 如果根目录 `.coze` 复用子目录项目的脚本或入口，必须把路径换算为相对根目录可执行的形式，并再次确认文件真实存在。
- 如果根目录 `.coze` 复用子目录项目的脚本，除了路径存在，还必须确认脚本会自行定位到正确项目根目录；优先使用按脚本位置推导 `PROJECT_DIR` 的写法，不要保留默认依赖调用时 `pwd` 的脚本实现。
- 如果写入了 `[subprojects] path = ["projects"]` 或保留了现有 subprojects 配置，必须同步检查 `project.entrypoint`、`deploy.build/run`、`deploy.build_app_dir` 是否都是相对根 `.coze` 的路径；脚本内部再自行回到子项目根。
- `deploy.build` 和 `deploy.run` 应直接指向脚本文件，例如 `["bash", "scripts/setup.sh"]`；不要使用 `bash -c`、`bash -lc` 或拼接出来的一次性命令。
- 对外提供 HTTP 服务时，`deploy.run` 应明确体现或最终保证端口 `5000`；不要保留模糊端口、不传端口，或把端口写成其他默认值。
- 对于 `deploy.build/run`，如果没有把握写对，不要写“近似命令”；宁可停下来报告缺失信号。
- 创建或修改 `.coze` 后必须再次读取文件，确认写入结果中确实存在目标字段，且命令没有被意外改写。

## Editing Rules

- 保留未知 section，不覆盖业务配置。
- 可以修改目标项目对应目录下的 `.coze`；如果同时涉及根目录和子目录，分别在各自文件里增量修正，不要把一个目录的配置整体覆盖到另一个目录。
- 优先局部修正，不要清空目标 `.coze` 后重写。
- 默认要落盘修改目标 `.coze`；只有用户明确要求“判断”“检查”或“不要改文件”时才只读。
- 仅输出 `deploy_kind`、`deploy_flavor`、`runtime_requires` 的报告而未写入 `.coze`，视为未完成。
- 不要主动生成 `[preview]` 或 `[dev]`；如果文件里已经存在它们，则按“保留未知 section”处理，除非用户明确要求修改。
- 不要把模板仓库里的包装脚本擅自改写成裸命令；例如 reference 用 `bash scripts/...` 时，不要替换成直接调用 `python` 或 `pnpm run ...`。
- 对于简单 Go / Java HTTP 模板，同样不要把 reference 规定的脚本入口退化成裸 `mvn` / `java` / `go build` / `go run`；如果最后没有生成脚本，应说明是因为 reference 没有命中或关键信号不足。
- 先扫描并评估仓库里现有的 `.sh` 文件；只要存在职责清晰、可直接复用的构建或启动脚本，就不要重复生成新脚本。
- 如果需要新建脚本，只在确认全仓库不存在合适脚本后，才创建 deploy 所需的包装脚本；不要顺手生成 `[dev]` 对应脚本，除非用户明确要求。
- 新建或修复 deploy 脚本时，只包装已验证过的安装、构建、启动动作；不要把业务逻辑搬进脚本，也不要在脚本里追加无法验证的旁路操作。
- 不要额外引入 workdir 包装；直接基于目标 `.coze` 所在目录组织命令。
- 不要把 `deploy.build/run` 写成 `bash -c`、`bash -lc` 或其他内联 shell 形式。
- 如果没有明确系统依赖，不要写 `deploy.deps = []`；应删除该字段或保持缺省。
- 如果 `.coze` 写入了脚本路径，修改结束前必须确认该脚本文件实际存在，且脚本内容与 `.coze` 的命令意图一致；若根目录 `.coze` 与子目录 `.coze` 复用了同一套脚本，还要确认两边的相对路径都正确。
- 如果 `.coze` 复用了子目录脚本，还必须确认脚本内部的工作目录解析也正确；不要保留会把 `pnpm install`、构建命令或运行入口落到仓库根、`scripts/` 目录或其他错误位置的实现。必要时可以把脚本修成基于 `SCRIPT_DIR` 推导 `PROJECT_DIR`，但不要只改 `.coze` 而忽略脚本本身的 `cd` 逻辑。
- 对 Python Agent / Workflow 脚本，如果代码会根据环境变量定位项目根或项目类型，运行脚本应显式导出稳定值；不要让部署环境里的 `COZE_WORKSPACE_PATH` 覆盖脚本推导出的项目根。Agent 至少应设置 `COZE_PROJECT_TYPE=agent`，Workflow / Automation 至少应避免被误判成 agent。
- 如果部署失败原因是 `PGDATABASE_URL`、`coze_workload_identity`、`coze_coding_dev_sdk`、`agent_llm_config.json`、`graphs.graph` 等运行时代码问题，不要误判为 `.coze` profile 错误。先判断是否是工作目录/环境变量导致；若是脚本能修则修脚本，若是业务代码缺少降级或文件路径错误，则按用户授权修业务代码或明确报告。
- 如果服务是 HTTP 形态，默认还要把端口固定为 `5000`；Android / 小程序的后端服务也适用。不要因为仓库脚本里出现其他端口就直接照抄，除非用户明确要求保留。
- 如果 `deploy.build/run` 只能靠猜测，停止并说明缺了哪些依据，而不是编造一套“通用命令”。
- 若仓库没有任何可支撑的 deploy profile 证据，不要生成 `.coze`。
- 修改后给出简短说明：为什么这么判定，命令来源是什么，改了什么，剩余什么风险。

## Output Contract

每次使用这个 skill，最终都要给出：

- `repo_type`
  - App / Expo / React Native 项目应输出为 `android`，不要输出新的 `app` 类型
- `deploy_kind`
- `deploy_flavor`
  - 非 service 项目应输出为空、`none` 或 `not_applicable`，不要伪造为 `web`
- `project_entrypoint`
- `runtime_requires`
- `service_port`
- `runtime_source`，例如 `existing-.coze`、`reference:runtime-whitelist-20260325`、`repo-version-inference`
- `command_source`，例如 `existing-.coze`、`reference:web-next-wrapper`、`reference:web-vite-frontend-service`、`reference:app-expo-android-service`、`reference:miniprogram-taro-service`、`reference:python-agent-service`、`reference:python-workflow-service`、`reference:python-http-service`、`reference:go-http-service`、`reference:java-http-service`、`repo-shell-script-scan`、`repo-inference`
- 是否修改了 `.coze`
- 已写入的字段位置，例如 `[project]`、`[deploy]`、`[deploy.profile]`
- 主要变更点
- 是否存在风险或待确认项

如果未修改，也要明确说明未修改的原因，例如：

- 项目类型无法可靠识别
- 用户请求仅为只读检查
- `deploy.build/run` 缺少足够信号，无法安全写入
- 现有配置已经满足规则

## Quality Bar

- 不输出与仓库事实不符的猜测
- 不引入未确认的枚举值、命令或依赖
- 不丢失原有配置中的非 deploy 内容
- 不把简单修复变成大范围重写
- 不把模板命令“优化”成另一套未经验证的命令
