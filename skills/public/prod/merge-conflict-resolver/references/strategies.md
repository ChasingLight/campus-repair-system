# 决策语义详解

每次合并冲突，用户对每个 feature 选择一次决策。`resolve_conflict` 工具的 4 个选项含义如下。

适用范围：Python / TypeScript 项目。

## 1. `keep_source`（保留源分支）

含义：**这次合并以源分支（被合进来的那一侧）为准**。

适用场景：
- 整个 feature 就是要把源分支的改动同步过来；
- 目标分支这边的改动已被另外的方式取代或废弃；
- 源分支的实现是这个 feature 的"权威版本"。

文件级翻译（详细见 SKILL.md 的【翻译表】）：
- 普通源码 / both-added → `apply_strategy.sh f theirs`
- lock 文件 → `resolve_lockfile.sh f theirs`（采源分支后 install 重生）
- deleted-by-them（源删了） → `git rm f`（接受源的删除决定）
- deleted-by-us（源改了） → 保留源的修改

## 2. `keep_target`（保留目标分支）

含义：**这次合并以目标分支（当前 HEAD）为准**，丢弃源分支的改动。

适用场景：
- 源分支的修改在目标分支已经被重构覆盖；
- 目标分支做了不可回退的架构变更；
- 用户明确表示放弃源分支的这次改动。

文件级翻译跟 keep_source 镜像反过来。

## 3. `keep_both`（智能合并）

含义：**由当前模型自己把双方语义合并成一份**。这是大多数双方都做了真实修改场景下的最佳选择。**不调外部 LLM**——模型自己读三方内容、按方法论的硬规则思考、写出合并版本。

实现：
- 普通源码：模型自己跑三方合并（详见 `merge_methodology.md` 的 smart 路径）
- lock 文件：**退化成 `keep_source`** —— 模型靠谱合 lock 的难度太高，避免出错；模型生成 desc 时已经在 desc 里告知用户
- 删改型 / both-deleted：等价于 `keep_source`（无法智能合并已删除的文件）
- rename-conflict：**只有 `manual+desc` 能处理**；keep_both / keep_source / keep_target 都退到 legacy manual（保留冲突标记）

风险与回退：
- 模型产出仍含 `<<<<<<<` 等冲突标记 → `restore_conflict.sh` 还原 + 转 manual_files
- 产出语法/类型不通过 verify 的 step 0（lint）→ 在汇报里告诉用户该文件可能要复检

## 4. `manual`（手动处理 · 提供自定义方案）

含义：**用户提供自定义解决方案**。响应里 manual 通常带一个 `desc` 字段，承载用户对这个 feature 该怎么处理的自然语言指令。

模型行为分两支：

### 4.1 `desc` 非空 → guided merge（当前模型按 desc 自己合并）

把 `desc` 当作首要指令，配合 3-way 内容 + 双方 commits + 文件类型，由**当前模型自己**产出最终结果。**不调外部 LLM**——模型直接 Read 上下文、按方法论的"guided 内部组织格式"思考、按结果直接 Write 文件 / 调 git 命令。

具体执行因文件 type 不同：
- 普通源码：跟 smart 流程结构一致，但首要依据是用户的 desc（不再是双方 commit 推断）
- lock 文件：模型按 desc 解析"采源/采目标/版本约束"，调 `resolve_lockfile.sh` 或自己改 manifest 后重生
- 删改型 / both-deleted：模型按 desc 解析"恢复并改成 X"或"接受删除"等意图，按结果用 `git rm` 或写文件
- rename-conflict：模型按 desc 解析最终路径和内容，用 `git mv` + 写文件

详见 `merge_methodology.md` 的"guided 路径"和失败回退。

适用场景：
- 用户对该 feature 已经想好了具体方案（"两边都保留，但把 X 函数重命名"）
- 双方语义高度纠缠，需要用户先描述"按哪个思路合"
- 含 rename-conflict / 多类型混合的 feature——其它 3 个选项无法准确表达意图时

### 4.2 `desc` 为空 → 退回 legacy manual

文件保留 in-progress 冲突状态，加进 `manual_files`。汇报阶段提示用户："feature X 选了 manual 但未提供方案，已留作手动处理"。

适用场景（前端理论上不该让用户在没填 desc 时提交 manual，但容错保留）：
- 用户暂时拿不定主意，想自己看一眼
- 文件含敏感配置（密钥、证书、生产配置）

### 写好 desc 的几条建议（给前端 / 用户）

- **明确"想保留谁的什么"**："保留源分支的 token 刷新逻辑，但目标分支的鉴权层不动"
- **指定具体函数 / 类 / 配置项**：模糊词（"合并相关代码"）模型没法落地
- **lock 文件里给版本号**："采源分支版本但锁定 axios 到 1.6.2"
- **删改型说清"留还是不留"**：用一句话回答这个文件最终是否存在
- **rename / 跨文件挪动**：直接写"把 src/old.ts 改名为 src/new.ts，内容用源分支版本"

## 默认推荐（用户拿不定主意时）

按以下顺序判断：

1. desc 里已标"含 rename-conflict / 双方纠缠 / 文件数过多" → **manual**
2. lock 文件占主导（feature 里只有 lock 文件） → **keep_source**（默认接收上游版本再 install）
3. **配置/凭证类文件**（`.env*`、`secrets/*`） → **manual**
4. **自动生成代码**（Python `*_pb2.py` / `*_pb2_grpc.py`；TS `*.d.ts` / `dist/*` / `build/*` / `.next/*`） → 取一侧后由生成命令重新产出，**不要走 keep_both**
5. **配置类源码**（`tsconfig.json`、`pyproject.toml`、`package.json`、`vite.config.ts`） → **manual**（依赖项合并要谨慎）
6. **migrations / 数据库迁移**（alembic / prisma / django migrations） → **manual**，往往需要人工裁决先后甚至重新生成
7. **普通源码且双方都有 commits** → **keep_both**
8. **文件只有一边在动** → 取动的那一边（preflight.py 已经会自动退化，不会真去做合并）
