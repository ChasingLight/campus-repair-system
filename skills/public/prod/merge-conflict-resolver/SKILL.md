---
name: merge-conflict-resolver
description: 处理 Python / TypeScript 项目的 git merge / rebase / cherry-pick 冲突。当用户说"目标分支为 X / 合到 X / merge to X / 帮我解决冲突 / merge conflict"时触发。**source 默认 = 当前 HEAD 所在分支，target 必须由用户指定**。支持多 worktree 仓库：自动定位 target 所在 worktree 并切过去操作（source 分支名在 cd 前抓，避免 HEAD 漂移）。按 conventional commit scope 把冲突文件聚成 feature 维度（多 scope 命中归 source 侧最多者，无 scope 退到目录前缀），调用一次 resolve_conflict 让用户对每个 feature 选策略（keep_source / keep_target / keep_both / manual+desc）；决策广播到组内文件，按 type 翻译成具体动作；keep_both 与 manual+desc 路径都由当前模型自己读三方内容并产出合并版本，不调外部 LLM。跑 lint + build + test 验证；通过且无遗留手动文件时自动 commit（消息按本次 features + decisions 生成）到 target 分支。
---

# Merge Conflict Resolver

## Overview

按 feature 维度组织冲突，**一次** `resolve_conflict` 收齐用户决策，再逐文件执行。

两种模式：

- **模式 A（预检）**：还没开始合并，用 `git merge-tree` 不动仓库地预测冲突 → 用户决策 → 真正 `git merge --no-commit` → 按决策回放(默认此模式)。
- **模式 B（解决）**：合并已经发生（有 MERGE_HEAD），用 `git status` 读冲突 → 用户决策 → 直接按决策回放（不需要再次 merge）。

下游流程（desc 生成、resolve_conflict 调用、决策回放、verify）两种模式完全共用。

## 调用脚本的硬规则

`scripts/` 下文件名后缀**就是**应该使用的解释器：

- `*.py` → `python3 scripts/xxx.py [args]`
- `*.sh` → `bash scripts/xxx.sh [args]`

不要写成 `./scripts/xxx.py` / `sh scripts/xxx.sh` / `python scripts/xxx.py`，原因：解压后可执行位可能丢失、`sh` 不是 bash、部分系统 `python` 是 Py2。

## 前置检查

执行任何步骤前先确认：

1. `git rev-parse --is-inside-work-tree` 必须成功；否则提示用户进入仓库目录后重试。
2. **列 worktree**：跑一次 `python3 scripts/worktree_info.py`，把输出留作下面 worktree 路由用。
3. **判定模式 + worktree 路由**（按下表分发）：

   | 当前 worktree 状态 | 其它 worktree 状态 | 模式 | 动作 |
   |---|---|---|---|
   | 无 in-progress | 无 in-progress | **A**（预检） | 进【步骤 4】解析 source/target 并按 target 切 worktree |
   | 任一 in-progress 存在 | — | **B**（解决） | 直接走 Mode B，CWD 已对 |
   | 无 in-progress | 某个 worktree 有 in-progress | **B**（解决） | `cd` 到 `worktree_info --in-progress` 返回的 `match.path`，然后走 Mode B |

   in-progress = `MERGE_HEAD` / `CHERRY_PICK_HEAD` / `REBASE_HEAD` / `rebase-merge` / `rebase-apply` 任一存在。

4. **Mode A 的 source/target 解析 + worktree 路由**（仅 Mode A 用，按顺序执行）：

   **4a. 抓 source（默认 = 当前 HEAD）**：在**当前 worktree**、cd 之前跑 `git rev-parse --abbrev-ref HEAD`，记下分支名当 source。结果是 `HEAD`（detached）→ 用 `git rev-parse HEAD` 拿 SHA 当 source，并在汇报里告知用户。用户显式给了 source（少见）→ 用用户给的。

   **4b. 抓 target（必须由用户提供）**：从用户消息里提取（典型说法："目标分支为 main" / "合到 main" / "merge into main" / "target: main"）。提取不到 → 停下来问用户「请指定目标分支（要把当前分支合并进哪条分支？）」，**不要猜**。

   **4c. 校验**：source == target → 报错让用户重新确认；任一 ref 不存在（`git rev-parse --verify` 失败）→ 把 ref 名原样告诉用户。

   **4d. 按 target 切 worktree**：
   - target 就是当前 worktree 的 HEAD 分支 → 不切换
   - target 不是当前 worktree 的 HEAD → 跑 `python3 scripts/worktree_info.py --branch <target>`：
     - `match` 非 null → `cd` 到 `match.path`（这之后传给 preflight 的 target 直接用 `HEAD` 即可，source 仍是 4a 抓到的分支名/SHA）
     - `match` 为 null → target 没在任何 worktree checkout，**停下来**告诉用户「目标分支 `<name>` 没在任何 worktree checkout，请先 `git checkout` 或 `git worktree add` 到某处再调用本 skill」，**不要**自己 checkout / 创建 worktree
   - 切 worktree 时**必须**告诉用户切去了哪里（一句话即可，例：「目标分支 main 在 worktree `/path/to/main-wt`，已切到该目录操作；source = `feat/xyz`」）

5. **工作区检查**（在选定的 worktree 里跑）：如有「未冲突的未提交修改」，提示用户 `git stash` 后再继续，避免后续 verify 阶段误把这些当成本次合并产物。

> 选定 worktree 后，**所有**后续命令（preflight / list_conflicts / merge / verify / commit）都在那个 worktree 的 CWD 下执行。**不要中途 cd 回原目录。**

## 模式 A 流程：预检 + 决策 + 执行

### A0 — 拿到 source / target ref

source 默认 = 当前 HEAD 所在分支（在 cd 到 target worktree 之前抓），target 必须由用户指定（典型说法：「目标分支为 main」/「合到 main」/「merge into main」）。完整解析 + 校验 + worktree 路由的步骤在【前置检查 4a-4d】里已经做完——这里直接用 4 输出的 `source_ref` / `target_ref` / 当前 CWD（已经在 target worktree 里）即可。

### A1 — 跑预检

```bash
python3 scripts/preflight.py <source-ref> [--ours <target-ref>]
```

输出 JSON 字段说明（详见脚本 docstring）：
- `_meta.clean`：true 表示无冲突，可直接合并
- `_meta.merge_base` / `_meta.git_version`：诊断用
- `features[]`：每个 feature 一个对象，含 `feature_id` / `feature_name` / `affected_files` / `_files_meta`
- `_files_meta[]`：每个文件的 `type`（both-modified / deleted-by-us / ...）/ `is_lockfile` / `primary_feature` / `all_features` / `ours_commits` / `theirs_commits`
- `options`：4 个固定选项（keep_source / keep_target / keep_both / manual）。其中 manual 标签是"手动处理（提供自定义方案）"——前端会在用户选 manual 时收集一段自定义说明文本（desc）一并回传

**特殊返回码**：
- `0` clean → 跳过 resolve_conflict，直接走 A4 真正合并 + verify
- `1` 有冲突 → 继续 A2
- `3` git 版本太旧（< 2.38）→ 退化到模式 B：先让用户 `git merge` 制造 in-progress 状态再走模式 B

### A2 — 为每个 feature 生成 desc

对 `features[]` 里每个 feature，根据它的 `_files_meta` 自己合成一段 1-2 句话的 desc。**这一步由当前模型直接做，不调外部 LLM**。

#### desc 必须包含

1. **源分支在这个 feature 上做了什么**：聚合 `_files_meta[].theirs_commits` 的 subject，提炼"做了什么"，不要逐条复读
2. **目标分支在这个 feature 上做了什么**：同上，聚合 ours_commits
3. **特殊文件警告**（必填，下面三种情况一旦命中必须在 desc 末尾追加）：
   - 组内含 lock 文件（`is_lockfile=true`）→ 加："本组含 lock 文件 `<path>`，'智能合并' 对它退化为 keep_source + 重新 install；选'手动'时可在自定义方案里指定版本号"
   - 组内含 `rename-conflict` 类型 → 加："本组含重命名冲突 `<path>`，**只有'手动+自定义方案'能处理**——其它决策都会转 legacy manual（留冲突标记）"
   - 组内文件数 > 10 → 加："本组涉及 N 个文件，单一决策可能过粗；不确定时建议选'手动'并描述拆分思路"

#### desc 示例

输入（preflight 输出节选）：

```json
{
  "feature_id": "login",
  "_files_meta": [
    {"file":"src/auth.ts","type":"both-modified","is_lockfile":false,
     "ours_commits":[{"subject":"refactor(auth): unify guard"}],
     "theirs_commits":[{"subject":"feat(login): add token refresh"}]},
    {"file":"src/session.ts","type":"deleted-by-us",
     "ours_commits":[{"subject":"refactor(auth): drop legacy session"}],
     "theirs_commits":[{"subject":"feat(login): session token field"}]}
  ]
}
```

模型应输出 desc：

> "源分支围绕登录功能新增了 token 刷新、给 session 增加了 token 字段。目标分支这边把鉴权代码重构成统一鉴权层，并删掉了独立的 session 模块。**注意 src/session.ts**：源分支在改、目标分支已删除——选'保留源分支'会保留源的修改、选'保留目标分支'会真删除该文件。"

### A3 — 调一次 resolve_conflict

把 preflight.py 的输出去掉所有 `_` 前缀字段，加上每个 feature 的 desc，组装成一次 `resolve_conflict` 调用：

```python
resolve_conflict(
    title=preflight_output["title"],
    source_branch=preflight_output["source_branch"],
    target_branch=preflight_output["target_branch"],
    features=[
        {
            "feature_id": f["feature_id"],
            "feature_name": f["feature_name"],
            "desc": "<A2 生成的 desc>",
            "affected_files": f["affected_files"],
        }
        for f in preflight_output["features"]
    ],
    options=preflight_output["options"],
)
```

**绝对不要**把 `_files_meta` / `_meta` / `ours_commits` / `theirs_commits` 这些字段塞给工具——它们是 SKILL 内部消费的。

### A4 — 解析响应 + 真正合并

工具响应形如：

```json
{
  "resolutions": [
    {"feature_id": "login_auth", "resolution": "keep_both"},
    {"feature_id": "avatar_upload", "resolution": "keep_source"},
    {"feature_id": "build_task", "resolution": "manual", "desc": "用户的自定义方案文本"}
  ]
}
```

把它解析成内存 map：

```python
decisions = {
    item["feature_id"]: {
        "resolution": item["resolution"],   # keep_source / keep_target / keep_both / manual
        "desc": item.get("desc", "").strip()  # 仅 manual 有效；其它 resolution 即便带 desc 也忽略
    }
    for item in response["resolutions"]
}
```

**校验**：

- 每个 `feature_id` 必须能在 preflight 输出的 `features[]` 里找到；找不到说明响应损坏，停下来报错给用户。
- `resolution` 只允许 `keep_source` / `keep_target` / `keep_both` / `manual`；其它值停下来报错。
- `resolution == "manual"` 且 desc 为空：**降级**为旧语义（保留冲突标记 + manual_files），并在汇报里提示"feature X 选了 manual 但未提供方案，已留作手动处理"。

校验通过后真正开 merge：

```bash
git merge --no-commit --no-ff <source-ref>
```

退出码非 0 是预期的（有冲突），**不要 abort**。冲突文件此时进入 stage 1/2/3 状态，工作区有冲突标记。

### A5 — 按翻译表逐文件回放

遍历 `_files_meta`（不是 `affected_files` 字符串数组——需要 type 信息），按下面【翻译表】把每个文件的决策翻译成具体动作。**每个文件只处理一次**：用一个 `processed: set` 去重。

### A6 — verify

```bash
bash scripts/verify.sh
```

verify **未通过** 或 `manual_files` **非空** → 跳过 A7（不要 commit），直接进 A8 汇报。

### A7 — 自动 commit（仅在 verify 通过且 `manual_files` 为空时执行）

#### A7.1 完成合并的 git 命令（按当前 in-progress 类型分发）

模式 A 进到这一步时仓库一定处于 `git merge --no-commit` 制造的 merge-in-progress 状态。完成动作：

```bash
git commit -m "<生成的 commit message，见下>"
```

模式 B 进到这一步时按 in-progress ref 分发：

| in-progress | 完成命令 |
|---|---|
| `MERGE_HEAD` 存在 | `git commit -m "<生成的 message>"` |
| `CHERRY_PICK_HEAD` 存在 | `git cherry-pick --continue --no-edit`（保留原 commit message） |
| `REBASE_HEAD` 存在 | `git rebase --continue` |

cherry-pick / rebase --continue 之后**必须再检查一次** `.git/CHERRY_PICK_HEAD` / `REBASE_HEAD`：
- 仍然存在 → rebase / cherry-pick 还没完，**还有下一个 commit 等着 replay**。停下来告诉用户："rebase / cherry-pick 还在继续，请重新调用本 skill 处理下一个冲突批次"。
- 不存在 → 全部 replay 完，进入 A8 汇报。

> **不 push**：commit 完就结束。当前流程是本地操作，target 分支的 commit 已经落到选定的 worktree 里，是否推送到远端由用户自己决定。

#### A7.2 commit message 生成规则（**仅 merge 模式用**，cherry-pick / rebase 沿用原 commit）

格式：

```
Merge branch '<source>' into <target>

Resolutions:
- <feature_id>: <策略简述>[（<关键细节>）]
- ...

(Manual files: <count>)            ← 仅在 manual_files 非空、走老语义时输出；A7 不会到这里，留作 A8 汇报参考
```

策略简述按 resolution 取：

| resolution | 简述模板 | 关键细节 |
|---|---|---|
| `keep_source` | "保留源分支" | lock 文件追加 "+ 重新 install" |
| `keep_target` | "保留目标分支" | lock 文件追加 "+ 重新 install" |
| `keep_both` | "智能合并" | 列出实际命中 smart 的文件数 |
| `manual` (有 desc) | "自定义方案" | desc 截断到 80 字符接 `…` |
| `manual` (无 desc) | （不出现在这里——A7 不执行） | — |

示例：

```
Merge branch 'feat/add-login' into main

Resolutions:
- login: 智能合并（保留双方语义，3 个文件）
- deps: 保留源分支 + 重新 install（pnpm-lock.yaml）
- build_task: 自定义方案 - 把 build agent 的队列实现切到源分支版本但保留目标分…
```

**不要**用 markdown / emoji / 中文标点替换英文标点。message 主体保持 ASCII + 中文混排即可，避免给后续 git log 工具流增加渲染负担。

### A8 — 汇报

详见【汇报规则】小节。

## 模式 B 流程：解决 in-progress 冲突

跟模式 A 共用 A2-A3、A5-A8，差异只有 B1（数据来源）和 B4（不需要重新 merge）；A7 在 B 模式里按 in-progress 类型分发到不同的完成命令（merge / cherry-pick --continue / rebase --continue），见 A7.1 表格。完成后同样**不 push**。

### B1 — 列冲突

```bash
python3 scripts/list_conflicts.py
```

输出与 preflight.py **同构**（`_meta.clean` 在有冲突时为 false，无冲突时为 true）。把它当成 preflight 的输出走 A2 / A3。

### B4 — 不要 merge

跳过 A4：仓库已经在 in-progress 状态，conflict 文件已经在 stage 1/2/3。直接进入 A5 回放。

## 翻译表（决策 → 文件级动作）

`apply_per_file(meta, decision)` 的核心逻辑。**`manual` 列的语义随 `desc` 是否非空而变**：
- `desc` 非空 → **guided merge**（当前模型按 desc 自己合并；详见 `references/merge_methodology.md`）
- `desc` 为空 → **legacy manual**（不动文件，加进 `manual_files`）

`keep_both` 与 `manual+desc` 这两条路径都由**当前模型自己**读三方内容并产出合并结果，**禁止调用任何外部 LLM 工具**。

| `meta.type` × `decision` | `keep_source` | `keep_target` | `keep_both` | `manual` (desc 非空) | `manual` (desc 空) |
|---|---|---|---|---|---|
| **both-modified / both-added** 普通源码 | `bash scripts/apply_strategy.sh f theirs` | `bash scripts/apply_strategy.sh f ours` | smart 流程（模型自己合并） | guided 流程（模型按 desc 自己合并） | `manual_files += f` |
| **both-modified** lock 文件 | `bash scripts/resolve_lockfile.sh f theirs` | `bash scripts/resolve_lockfile.sh f ours` | **退化成 keep_source** | 模型按 desc 解读"采源/采目标/版本约束" → 对应 resolve_lockfile + 重生；解读不出来 → 退到 keep_source 并提示用户 | `manual_files += f` |
| **deleted-by-them** | `git rm -- f` | `bash scripts/apply_strategy.sh f ours` | 等价 keep_target | 模型按 desc 决定：典型如"恢复并改为 X"→ Write 文件 + add；"接受删除"→ `git rm`；解读不出来 → 退到 keep_target | `manual_files += f` |
| **deleted-by-us** | `bash scripts/apply_strategy.sh f theirs` | `git rm -- f` | 等价 keep_source | 模型按 desc 决定，镜像同上；解读不出来 → 退到 keep_source | `manual_files += f` |
| **both-deleted** | `git rm -- f` | `git rm -- f` | `git rm -- f` | 模型按 desc 决定：通常是"重建文件并写入 X"→ Write；解读不出来 → `git rm` | `manual_files += f` |
| **added-by-them** | `bash scripts/apply_strategy.sh f theirs` | `git rm -- f` | 等价 keep_source | 等同 deleted-by-us 的处理（双方语义同形） | `manual_files += f` |
| **added-by-us** | `git rm -- f` | `bash scripts/apply_strategy.sh f ours` | 等价 keep_target | 等同 deleted-by-them 的处理 | `manual_files += f` |
| **rename-conflict** / **other** / **unknown** | **强制** legacy manual | **强制** legacy manual | **强制** legacy manual | 模型按 desc 决定最终路径 + 内容（git mv + Write） | `manual_files += f` |

### smart 流程（仅 both-modified / both-added 普通源码，决策 = `keep_both`）

1. **预检退化**：先看 `meta.ours_commits` 和 `meta.theirs_commits`：
   - 任一一侧为空 → 自动退化成对应的 keep_source / keep_target，**直接应用，不进入合并**
   - 两侧都有 → 继续

2. **取上下文 + 备份**：

   ```bash
   bash scripts/dump_three_way.sh f
   ```

   该脚本同时把当前含冲突标记的文件备份到 `.git/merge-conflict-resolver/<hash>.conflict`，供失败回退。

3. **当前模型自己合并**（按 `references/merge_methodology.md` 的"smart 内部组织格式"）：
   - **关键**：把 `meta.all_features` 命中的所有 feature 在该文件上的 commits 都纳入考虑（不只是 primary feature 的 commits）。
   - 文件语言根据扩展名推断（Python / TypeScript）。
   - **不要**调用任何外部 LLM 工具或子模型——模型直接 Read 三方内容、按方法论的"硬规则"思考、Write 最终文件。

4. **校验输出**：不能再含 `<<<<<<<` / `=======` / `>>>>>>>`；命中则**走失败回退**：`bash scripts/restore_conflict.sh f` + `manual_files += f`。

5. 通过校验后写回 + `git add f`。

### guided 流程（决策 = `manual` 且 desc 非空，对所有可处理 type）

跟 smart 流程结构相同，**关键差异在用户的 desc 是首要依据**。仍由当前模型自己处理，不调外部 LLM。

1. **取上下文**：
   - 普通源码：`bash scripts/dump_three_way.sh f`（同上，含备份）
   - lock 文件：直接读双方版本的内容（`git show :2:f` / `:3:f`），**不调 dump_three_way.sh**
   - delete / rename 类：根据 type 取对应 stage 的内容，缺失的视为空

2. **当前模型按 `references/merge_methodology.md` 的"guided 内部组织格式"思考**，把 `decision.desc` 当作首要指令，3-way 内容和 commits 作为参考。**不要**把决定先序列化成 JSON 再 parse 自己的输出——直接按思考结果动手。

3. **按 type 直接执行**：
   - 普通源码：Write 整份合并后内容 → 校验无冲突标记 → `git add`
   - lock 文件：模型按 desc 决定"采源/采目标/版本约束"等 → 调 `bash scripts/resolve_lockfile.sh f <ours|theirs>`；如需先改 manifest 也由模型直接 Edit
   - delete / rename：模型按 desc 决定 keep / delete / rename → Write 文件 + `git add` / `git rm` / `git mv` + Write

4. **失败回退**：模型自判 give_up、产物含冲突标记、git 命令失败 → `bash scripts/restore_conflict.sh f`（普通源码）/ 文件保持 in-progress（其它 type）+ `manual_files += f` + 在汇报里告知用户"自定义方案未能完整应用，请人工处理"。

## 汇报规则（A8 / B8）

verify 通过 + `manual_files` 为空（A7 已经 commit 完）：
- 报告 commit SHA + commit message 第一行
- 列出本次 add / rm 的文件总数 + 各 feature 的 resolution 摘要
- 提示用户「commit 已落在 worktree `<path>` 的 `<target_branch>` 分支，未推送；如需 push 请自行执行」

verify 通过 + `manual_files` 非空：
- **不要 commit**
- 列出 `manual_files` 路径 + 每个文件没能自动处理的原因（模型产出残留冲突标记 / give_up / 用户没填 desc 等）
- 提示「请手动解决以下冲突后重新跑 `bash scripts/verify.sh`，通过后重新调用本 skill 走完成阶段」

verify 失败：
- 把失败 step 和退出码原样转给用户
- **不要 commit**
- 提示用户：要么手工修复，要么回滚整个合并（`git merge --abort` / `git rebase --abort`）——**由用户决定，不要自己 abort**

## 工具清单

调用约定：`*.py` 用 `python3 scripts/...`，`*.sh` 用 `bash scripts/...`。

| 文件 | 调用示例 | 用途 |
|---|---|---|
| `scripts/worktree_info.py` | `python3 scripts/worktree_info.py [--branch <name> \| --in-progress]` | 列 worktree / 定位某分支或 in-progress 所在 worktree（前置检查用） |
| `scripts/preflight.py` | `python3 scripts/preflight.py <source>` | Mode A：merge-tree 预检冲突 + feature 分桶 |
| `scripts/list_conflicts.py` | `python3 scripts/list_conflicts.py` | Mode B：读 in-progress 冲突 + 同构 JSON |
| `scripts/git_utils.py` | （仅作为模块被 import） | A/B 共用的 git 工具：分支名解析 / merge-base / commits / 输出组装 / OPTIONS |
| `scripts/feature_classify.py` | （仅作为模块被 import） | Conventional commit 解析 + scope 收集 + dir fallback + lock 识别 |
| `scripts/apply_strategy.sh` | `bash scripts/apply_strategy.sh <file> <ours\|theirs>` | 普通源码 ours/theirs 策略 + add |
| `scripts/resolve_lockfile.sh` | `bash scripts/resolve_lockfile.sh <file> <ours\|theirs>` | lock 文件取一侧 + 重新 install / lock + add |
| `scripts/dump_three_way.sh` | `bash scripts/dump_three_way.sh <file>` | 取 base/ours/theirs/current 内容；同时备份冲突版本 |
| `scripts/restore_conflict.sh` | `bash scripts/restore_conflict.sh <file>` | 从备份还原带冲突标记的版本（smart / guided 失败用） |
| `scripts/get_branch_info.py` | `python3 scripts/get_branch_info.py <file>` | 单文件版分支 + commits 信息（独立用，新流程不依赖） |
| `scripts/verify.sh` | `bash scripts/verify.sh` | lint + build + test，带 per-step timeout |
| `references/strategies.md` | （文档） | 各决策的语义、默认推荐、manual+desc 写法建议 |
| `references/merge_methodology.md` | （文档） | smart 与 guided 路径的合并方法论（由当前模型自己执行）+ 失败回退 |

## 不要做的事

- 不要执行 `git merge --abort` / `git rebase --abort` / `git cherry-pick --abort` —— **abort 永远是 user-facing 决定**。`--continue` 和 `git commit` 在 A7 里**会自动执行**，但 abort 不会。
- 不要在 verify 失败时为了"过测试"再回头改代码 —— 那是另一个独立任务。
- **不要调用任何外部 LLM 工具或子模型** —— smart 与 guided 路径都由当前模型自己读三方内容直接合并。把"prompt 模板"理解为模型自我提示用的内部清单，不是发给另一个 LLM 的请求。
- 不要在 verify 失败、`manual_files` 非空、或 `--continue` 后还有下一个 commit 等 replay 时执行 commit —— 三种情况都直接进 A8 汇报。
- **本流程不做任何 push**（`git push` 一律不执行）—— commit 落在本地 worktree 即结束；用户口头说"推一下"也不要做，请告诉用户当前无远端分支。
- 不要把 `manual_files` 静默忽略；汇报时一定要列出来。
- 不要调多次 resolve_conflict —— 同一回合内只调一次，所有 features 一起发。
- 不要把 preflight.py / list_conflicts.py 输出的 `_meta` / `_files_meta` / `_*` 等下划线字段塞给 resolve_conflict —— 那些是 SKILL 内部用的。
- 不要在用户没明确给 **target** 分支时自己猜（容易猜错合并方向）；source 默认 = 当前 HEAD 所在分支，target 必须用户给。
- **不要在 cd 到 target worktree 之后再去抓 source**：cd 之后 `HEAD` 已经指向 target 分支，再抓就把 source 等同于 target、合并变成 no-op。source 必须在【前置检查 4a】里 cd **之前**抓好。
- 不要在 `resolution=keep_both` 时尝试合并 lock 文件；按翻译表退化成 keep_source。
- 不要忽略 `deleted-by-us` / `deleted-by-them` / `rename-conflict` 等类型——它们的翻译表跟普通源码不同。
- 不要因为某个 feature 全选 manual 就跳过 `git merge --no-commit`（模式 A）—— 必须先开 merge 才能让 guided 流程访问 stage 1/2/3。
- **不要忽略 `manual` 决策里的 `desc` 字段**：非空时必须把它当作 guided merge 的首要指令；为空时才走 legacy manual（保留冲突标记）。
- **不要把其它 resolution（keep_source / keep_target / keep_both）的 `desc` 当指令用**：响应里只有 `manual` 的 desc 有效，其它即便附了 desc 也忽略。
- 不要在 guided merge 输出无法解析或残留冲突标记时强行 `git add`——必须走 `restore_conflict.sh` 回退 + 加进 `manual_files`。
- **不要在错的 worktree 上跑 verify / merge / commit**：前置检查阶段已经定好的 worktree 是唯一允许操作的位置；中途不要 cd 回原目录或换 worktree。
- **不要替用户 `git checkout` 目标分支或 `git worktree add` 一个新 worktree**：前置检查阶段如果 `--branch <target>` 命中为 null，停下来让用户决定，不要自作主张创建 worktree（会留下用户没预期的工作区状态）。
- **不要把 Mode B 的 in-progress 检测局限在当前 worktree**：`MERGE_HEAD` 等是**每个 worktree 独立**的，必须用 `worktree_info.py --in-progress` 跨 worktree 扫描，否则会在错误的 worktree 起一次新 merge。
