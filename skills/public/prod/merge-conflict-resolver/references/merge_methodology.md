# 合并方法论（smart / guided）

本文件给两种「需要模型动脑子」的合并路径提供操作手册。

> **重要约束：smart 与 guided 路径都由当前模型本身完成合并，不要调用任何外部 LLM 工具或子模型**。文中虽然保留了"prompt 输入"、"输出协议"等措辞，含义是：**模型自己**按这套结构组织上下文与产出，不是发请求给另一个 LLM 再解析它的回复。

## 适用范围

| 路径 | 触发 | 适用文件 type |
|---|---|---|
| **smart** | 用户对该 feature 选 `keep_both` | 仅 both-modified / both-added 普通源码 |
| **guided** | 用户对该 feature 选 `manual` 且 `desc` 非空 | 所有 type（普通源码 / lock / 删改 / both-deleted / rename） |

两条路径**共享失败回退、单侧无 commit 退化、写文件时的硬规则**；唯一的差别是 guided 路径多了一份用户的自定义指令（`desc`）作为首要依据。

## 输入收集（共用）

预检阶段（preflight.py 或 list_conflicts.py）已经把所有上下文准备好了：

- `_files_meta[i].ours_commits` / `theirs_commits`：双方在该文件上的 commits（subject）
- `_files_meta[i].all_features`：该文件命中的全部 feature（不只 primary）
- `_files_meta[i].type`：冲突类型
- `_files_meta[i].is_lockfile`：是否 lock 文件

三方文件内容由 `bash scripts/dump_three_way.sh <file>` 取，输出 JSON（base / ours / theirs / current）；该脚本同时会把含冲突标记的 current 备份到 `.git/merge-conflict-resolver/<hash>.conflict`，供失败回退。

> 仅普通源码（both-modified / both-added）调 dump_three_way.sh。lock / 删改 / both-deleted / rename 类按 type 直接取对应 stage：`git show :2:<file>`（ours）、`git show :3:<file>`（theirs）。

## smart 路径

模型自己执行，不调外部 LLM：

### 步骤

1. **单侧无 commit 退化**（先做，省时间）：
   - `meta.ours_commits` 为空 → 直接 `bash scripts/apply_strategy.sh f theirs`，结束本文件
   - `meta.theirs_commits` 为空 → 直接 `bash scripts/apply_strategy.sh f ours`，结束本文件
   - 两侧都有 commit → 继续

2. **取上下文**：`bash scripts/dump_three_way.sh f`

3. **模型直接产出合并版本**——按下面"smart 内部组织格式"逐项思考完后，**直接** Read 文件、Edit/Write 输出最终版本，不要包成 JSON 再解析自己。

4. **校验输出**：文件不再含 `<<<<<<<` / `=======` / `>>>>>>>`。命中 → 走"失败回退"。

5. 通过校验后 `git add f`。

### smart 内部组织格式（模型在产出文件前先在脑子里走一遍）

```
文件：{file}
语言：{language}    # 由扩展名推断: .py -> Python, .ts/.tsx -> TypeScript, ...

【该文件参与的所有 feature】
{all_features}      # 例: ["login", "auth", "perf"]

【目标分支(ours, {target_branch}) commits】
{每条: sha + subject}

【源分支(theirs, {source_branch}) commits】
{每条: sha + subject}

【三方内容】
- base
- ours
- theirs

【硬规则】
1. 同时保留双方分支的语义意图，不要丢失任何一边的功能修改。
2. 当二者真的不可兼容时，按以下优先级判断并在末尾用单行注释 // MERGE_NOTE: 说明取舍：
   - 安全/正确性 > 可读性 > 风格
3. 严禁输出 <<<<<<< ======= >>>>>>> 等冲突标记。
4. 严禁猜测两侧之外的新逻辑（除非是为了让两边都成立的最小调和）。
5. 严禁删除注释、import、license 头等无关内容。
6. 保持 {language} 的惯用风格（PEP 8 / Prettier 等），不要随意调整缩进或排序 import。
7. 把这些规则当作自我提示走一遍后，**直接** 写出整份合并文件正文。
```

## guided 路径

跟 smart 结构相同，**关键差异是 prompt 第一段是用户的 `desc`**，且因为可能涉及 lock / 删改 / rename，模型产出的不是单一文件正文，而是一份"内部决定 + 文件内容"的结构化结果（仍然是模型自己产出 + 自己应用，不调外部 LLM）。

### 步骤

1. **取上下文**：
   - 普通源码：`bash scripts/dump_three_way.sh f`（含备份）
   - lock：`git show :2:f` / `:3:f` 拿双方版本；不调 dump_three_way
   - 删改 / both-deleted / rename：按 type 取对应 stage 内容，缺失视为空

2. **模型自我组织**（按下面"guided 内部组织格式"思考） → 在脑子里得出"这个文件应该怎么处理"的结构化决定。

3. **直接执行**这个决定（不要把它包装成 JSON 字符串再 parse 自己的输出）：
   - 普通源码：直接 Write 合并后内容 → `git add f`
   - lock：按"采源/采目标/版本约束"调 `bash scripts/resolve_lockfile.sh f <ours|theirs>`，必要时先改 manifest（`package.json` / `pyproject.toml`）的 version 字段
   - 删改 / both-deleted：写文件 + `git add` / 直接 `git rm -- f` / `git mv` + 写新路径
   - rename：`git mv old new` + Write 内容 + `git add`
   - 模型判断"无法落地" → 直接进入失败回退（manual_files），不要硬干

4. **校验**：跟 smart 一致——普通源码不能残留冲突标记；其它 type 看 git 状态正常。

### guided 内部组织格式（模型先想清楚再动手）

```
【用户指令】（首要依据，必须遵循）
{user_desc}

【文件】 {file}
【语言】 {language}
【冲突类型】 {type}
【是否 lock】 {is_lockfile}

【该文件参与的所有 feature】
{all_features}

【目标分支(ours) commits】
{每条: sha + subject}

【源分支(theirs) commits】
{每条: sha + subject}

【三方内容】（按 type 取，缺失字段标 (none)）
- base / ours / theirs / current

【按 type 决定动作】

A. 普通源码（type=both-modified/both-added，is_lockfile=false）：
   决定字段:
     content: <最终文件正文>
     note:    <为什么这么合>

B. lock 文件（is_lockfile=true）：
   决定字段:
     action:           "regenerate"
     pick:             "source" | "target"
     manifest_changes: <(可选) 列出对 manifest 的修改, 形如 [{file: "package.json", set: {"axios": "1.6.2"}}]>
     note:             <为什么这么选>

C. 删改型（deleted-by-them / deleted-by-us / both-deleted）：
   决定字段:
     action:    "keep" | "delete" | "rename"
     content:   <action=keep/rename 时给出最终文件正文>
     rename_to: <action=rename 时给出新路径>
     note:      <为什么这么选>

D. rename-conflict / other：
   同 C 的字段。无法落地 → action="give_up", note 写原因。

【硬规则】
1. 严禁输出 <<<<<<< ======= >>>>>>> 等冲突标记。
2. 严禁删除注释、import、license 头等无关内容。
3. 保持 {language} 的惯用风格。
4. 用户指令模糊时，按指令的字面最近义执行；仍无法决定时 action="give_up"，不要硬猜。
```

模型按这个格式想清楚之后**直接执行**对应的 git 命令和文件操作。注意：**不要**把决定先序列化成 JSON 文本再 parse 自己的输出——浪费 token、还容易格式失败。结构化格式的目的是组织思路，不是序列化通讯。

## 共用：失败回退

任一情况都触发回退：

- 模型尝试合并后觉得自己没把握保证语义正确
- 产物残留冲突标记
- 用户 desc 与三方上下文严重不一致，且无法用最近义解释
- 模型主动判定 `action=give_up`
- `git add / rm / mv` 失败

回退动作：

1. 不要 `git add`
2. 普通源码：`bash scripts/restore_conflict.sh <file>`（备份回写 + index 恢复 unmerged）
3. 删改 / lock / rename：什么都不做，文件保持 in-progress 状态
4. 把该文件加进 `manual_files`，在汇报里单独列出，附上模型的 note（如有）

## 共用：单侧无 commit 优化（仅 smart）

`apply_per_file` 在走 smart 流程**之前**先看：

- `meta.ours_commits` 为空 → 直接退化成 `keep_source`（`bash scripts/apply_strategy.sh f theirs`）
- `meta.theirs_commits` 为空 → 直接退化成 `keep_target`（`bash scripts/apply_strategy.sh f ours`)

理由：一侧没改过的话没什么可"合"的，直接取动的那一边就对了。

**guided 路径不做这个退化**——用户写了 desc 说明 ta 对单侧无改动这事仍有意图（比如想"基于源分支再加个东西"），不能跳过用户的指令。
