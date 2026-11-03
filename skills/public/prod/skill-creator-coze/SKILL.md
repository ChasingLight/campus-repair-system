---
name: skill-creator-coze
description: 用于创建或更新 Coze 编程 Skill；当用户希望把某类任务整理成可复用 Skill，或继续完善已有 Skill 的说明、脚本与资源时使用。
---

# Coze Skill Creator

## 你要产出什么

当这个 Skill 被调用时，目标不是写一堆文件，而是交付一个真正可用的 Skill 目录。
这个目录至少应当做到三件事:

- 让智能体知道什么时候该用它
- 让智能体知道被触发后该怎么做
- 让后续维护者能继续扩展，而不是从头重写

Skill 默认生成放置在 `${COZE_WORKSPACE_PATH}`，即 `/workspace/projects/`。
每个 Skill 都应该位于独立目录中:

```text
${COZE_WORKSPACE_PATH}/<skill-name>/
├── SKILL.md
├── scripts/
├── references/
└── assets/
```

其中只有 `SKILL.md` 是必需的，其余目录按需创建。

## 先做什么判断

在开始落盘之前，先完成下面三个判断。

### 1. 用户真正要沉淀的是什么

先把需求拆成“值得复用的部分”，通常包括:

- 会重复出现的任务步骤
- 容易出错的判断规则
- 依赖特殊格式、工具或上下文的操作
- 应该长期保留的模板、样例或参考资料

不要把一次性的聊天上下文、临时背景或偶发细节直接写进 Skill。

### 2. 哪些内容写进 `SKILL.md`

`SKILL.md` 应优先承载这些信息:

- 这个 Skill 解决什么问题
- 什么请求会触发它
- 智能体收到触发后按什么顺序做事
- 哪些步骤需要读别的文件或执行脚本
- 哪些地方最容易做错

如果一段内容不能帮助智能体触发、判断或执行，一般就不该留在 `SKILL.md`。

### 3. 哪些内容拆到资源目录

- 确定性逻辑放到 `scripts/`
- 长说明、长示例、结构定义放到 `references/`
- 模板、素材、样例文件放到 `assets/`

拆分的目标只有一个: 让 `SKILL.md` 保持清楚，而不是让目录看起来更完整。

补充要求:

- 重要参考文件尽量都在 `SKILL.md` 中直接索引
- 优先保持一跳可达，不要把路由设计成多层嵌套
- 写索引时同时说明“什么场景下读这个文件”

例如:

```markdown
## 资源索引

- `references/api-schema.md`: 当任务涉及字段定义、请求体或返回结构时读取
- `references/examples.md`: 当需要参考标准输入输出样例时读取
- `references/policies.md`: 当任务涉及边界规则或例外情况时读取
```

## 创建新 Skill 的工作流

### 第一步: 明确 skill 名称和触发方式

先确定:

- skill 名称
- 典型用户表达
- 核心任务边界
- 是否需要脚本或其他资源

命名要求:

- 只用小写字母、数字、连字符
- 不以 `-skill` 结尾
- 目录名与前言区 `name` 一致

### 第二步: 初始化目录

如果是新 Skill，先使用 `scripts/init_skill.py` 创建骨架，再继续编辑。

示例:

```bash
python3 scripts/init_skill.py image-editor
python3 scripts/init_skill.py image-editor --resources scripts,references
python3 scripts/init_skill.py image-editor --resources scripts,references,assets
```

什么时候用这个脚本:

- 从零创建 Skill 时
- 已经确定名称，准备正式落盘时

什么时候不用:

- 用户明确要求修改一个已存在的 Skill
- 目标目录已经存在并且你只是在补内容

### 第三步: 先写 `SKILL.md`

不要先急着写脚本。
先把 `SKILL.md` 写清楚，再判断哪些步骤必须脚本化。

前言区至少包含:

- `name`
- `description`

其中 `description` 要同时写清:

- Skill 的能力
- Skill 的触发时机

推荐写法:

```yaml
---
name: image-editor
description: 用于处理常见图片编辑任务；当用户需要裁剪图片、调整尺寸、转换格式或批量处理图片时使用。
---
```

正文建议优先覆盖:

- 任务目标
- 何时使用
- 操作步骤
- 资源索引
- 注意事项

### 第四步: 再补资源文件

当 `SKILL.md` 写完主流程后，再按需补资源。

常见决策:

- 如果只是说明步骤，不写脚本
- 如果需要稳定执行文件处理或调用外部接口，写 `scripts/`
- 如果某段说明太长、太细，拆到 `references/`
- 如果最终结果要直接使用模板或样例文件，放到 `assets/`

补资源后，要回到 `SKILL.md`，把资源入口和用途写清楚。

### 第五步: 运行基础校验

结构初步完成后，使用 `scripts/quick_validate.py` 做一次快速校验。

示例:

```bash
python3 scripts/quick_validate.py ${COZE_WORKSPACE_PATH}/image-editor
python3 scripts/quick_validate.py /workspace/projects/image-editor
```

这个脚本适合在下面两个时间点使用:

- 新 Skill 首次成型后
- 修改已有 Skill 并准备结束前

它主要检查:

- `SKILL.md` 是否存在
- 前言区是否可解析
- `name` 是否合法且与目录名一致
- 目录是否位于工作区根目录下

### 第六步: 按脚本类型做验证

如果 Skill 中包含 `scripts/`，不要只做结构校验，还要根据脚本类型补充验证。

根据脚本特征自行选择合适的验证方法，例如:

- 对 Python 脚本做语法校验，如 `python3 -m py_compile`
- 对命令行脚本执行 `--help`
- 对支持安全试运行的脚本做 smoke test
- 对需要样例输入的脚本，构造最小 fixture 进行验证
- 对不适合直接执行的脚本，至少验证参数解析、导入是否正常，或说明为什么无法完整试跑

目标不是把所有脚本都强行跑一遍，而是确认“这个脚本在当前 Skill 里是可信的”。

### 第七步: 清理临时文件、打包并通知用户

校验通过后，继续做三件事:

1. 清理临时文件和无用产物，例如:

- `__pycache__/`
- `.DS_Store`
- 测试过程中生成的临时输出目录
- 已经不再使用的空目录

2. 使用 `zip` 命令将 Skill 打包成 `.skill` 文件，并放在 `${COZE_WORKSPACE_PATH}` 目录下。

要求:

- `.skill` 文件名必须和技能文件夹名一致
- 打包产物路径应为 `${COZE_WORKSPACE_PATH}/<skill-name>.skill`
- 打包时不要把 `__pycache__/`、`.DS_Store` 等临时文件带进去

示例:

```bash
cd ${COZE_WORKSPACE_PATH}
zip -r image-editor.skill image-editor -x "*/__pycache__/*" "*/.DS_Store"
```

如果当前环境没有 `zip`，先安装:

```bash
apt update
apt install -y zip
```

3. 向用户明确通知结果，包括技能目录位置和 `.skill` 打包产物位置。

4. 在主 Agent 完成本次文件改动，并调用 `done` 工具完成改动提交之后、结束任务之前，主动询问用户是否需要将本次创建或修改的技能保存到「我的技能」。

例如:

- 是否需要将本次创建的 `image-editor` 技能保存到「我的技能」？
- 是否需要将本次修改的 `image-editor`、`batch-image-tools` 技能保存到「我的技能」？

## 更新已有 Skill 的工作流

如果用户要修改现有 Skill，建议按这个顺序推进:

1. 先通读现有 `SKILL.md`
2. 找出已经失效、重复或冲突的部分
3. 再看相关资源文件是否也要同步修改
4. 优先让原有内容更清楚，而不是不断向后追加
5. 修改完成后再运行 `scripts/quick_validate.py`
6. 清理临时文件，并重新打包为同名 `.skill` 文件
7. 向用户通知更新结果，并在结束前询问是否需要保存到「我的技能」

更新已有 Skill 时，常见问题有:

- 前言区的触发描述已经不准确
- 主流程已经和资源文件脱节
- `references/` 里有旧规则，`SKILL.md` 里还是新规则
- 目录里残留了已经不再使用的文件

## `scripts/`、`references/`、`assets/` 的使用标准

### `scripts/`

适合放:

- 文件处理
- 数据转换
- API 调用
- 批量任务

不适合放:

- 单纯的写作提示
- 常识性分析步骤
- 只有一句话就能说明白的操作

### `references/`

适合放:

- 长篇格式说明
- 字段或结构定义
- 某个分支场景的专项规则
- 详细示例

当 `SKILL.md` 已经开始出现大段“只有少数情况才会用到”的内容时，就应该考虑拆到这里。

### `assets/`

适合放:

- 模板文件
- 样例文件
- 静态资源
- 交付结果要直接引用的素材

## 写 `SKILL.md` 时要避免什么

不要默认加入:

- `README.md`
- `CHANGELOG.md`
- 安装说明
- 与执行过程无关的记录文档

也不要把 `SKILL.md` 写成下面这些样子:

- 只有概念，没有操作顺序
- 只有操作顺序，没有触发条件
- 只有脚本清单，没有脚本用途
- 只有很多规则，没有任何示例

## 一个最小示例

如果你在做一个图片处理 Skill，一个足够好的最小版本可能是:

```text
/workspace/projects/image-editor/
├── SKILL.md
└── scripts/
    └── resize_image.py
```

其中:

- `SKILL.md` 里可以这样写:

```markdown
---
name: image-editor
description: 用于处理常见图片编辑任务；当用户需要裁剪图片、调整尺寸、转换格式或批量处理图片时使用。
---

## 何时使用

- 用户要求裁剪、缩放或转换图片
- 用户提供了一张或多张图片，并明确提出编辑需求

## 操作步骤

1. 先判断用户要做的是裁剪、缩放、格式转换还是批量处理。
2. 如果只是简单说明，直接在 `SKILL.md` 指导处理。
3. 如果需要稳定的尺寸调整，调用 `scripts/resize_image.py`。
```

- `scripts/resize_image.py` 负责真正的尺寸调整
- 如果后面出现复杂输入格式，再补 `references/`

## 自带脚本

这个 Skill 附带两个辅助脚本:

- `scripts/init_skill.py`: 用于新建 Skill 目录和初始文件
- `scripts/quick_validate.py`: 用于快速校验 Skill 结构和前言区

创建新 Skill 时先用 `scripts/init_skill.py`，创建或更新完成后再用 `scripts/quick_validate.py`。
