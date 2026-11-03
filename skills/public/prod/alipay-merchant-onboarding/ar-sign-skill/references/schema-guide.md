# artisanPage Schema 解析指南

> 本文档是 LLM 参考手册，定义如何解析后端返回的 artisanPage 动态表单结构。被 references/preview.md 引用。

## 1. artisanPage 结构层次

后端返回的响应信封：

```
{
  "success": true/false,
  "data": {
    "artisanPage": { ... },   ← 主要信息在这里
    "hasError": false
  },
  "traceId": "..."
}
```

artisanPage 内部三层结构：

### 顶层

| 字段 | 说明 |
|---|---|
| `title` | 产品名称（如"APP支付"、"电脑网站支付"） |
| `structure.children` | 区块展示顺序，数组 `[{id: "businessInfo"}, {id: "criticalCg"}, ...]` |
| `data` | 区块字典，key 为区块 ID |

### 区块层（formContainer）

每个区块位于 `data.<blockId>`，结构如下：

| 字段 | 说明 |
|---|---|
| `basic.id` | 区块标识（如 `contactInfo`） |
| `basic.title` | 区块标题（如"联系人"），部分区块可能无 title |
| `data.schema.properties` | 字段定义树（JSON Schema 风格） |
| `data.values` | 当前/默认值 |
| `loadMode` | 加载模式（如 `PRIMARY`） |
| `status` | 区块状态（`OK` 表示正常） |

### 字段层

字段定义位于 `data.schema.properties.<blockId>.properties` 下，可能存在**多层嵌套**。当某个节点 `type=object` 且含 `properties` 子节点时，需递归向下遍历，直到找到含 `widget` 属性的叶子字段。

例如深层路径：`editableCg#tradeScenario.{orderLineId}.{cgCode}.index0.L2345`

遍历规则：
1. 从区块根节点开始，检查每个 property
2. 如果该 property 有 `widget` 属性 → 这是一个叶子字段，按 widget 类型处理
3. 如果该 property `type=object` 且有 `properties` 子节点但无 `widget` → 这是一个中间节点，递归进入其 `properties` 继续遍历
4. values 中的路径与 schema 中的嵌套层级一一对应

每个叶子字段可包含：

| 属性 | 类型 | 说明 |
|---|---|---|
| `title` | string | 字段展示名称（如"App名称"） |
| `description` | string | 字段含义描述，可用于引导用户 |
| `placeholder` | string | 输入提示文字 |
| `type` | string | 数据类型：`string`、`object`、`array`（详见 §6） |
| `widget` | string | 渲染组件类型，决定交互方式 |
| `required` | boolean | 是否必填 |
| `hidden` | boolean | 是否隐藏（不展示给用户） |
| `disabled` | boolean | 是否禁用（不可编辑） |
| `order` | number | 同一区块内的展示顺序 |
| `rules` | array | 校验规则，每项含 `message`（错误提示）和 `pattern`（正则表达式，用户输入必须匹配） |
| `enums` | array | 枚举选项（radio/select），每项含 `key`（展示名）和 `value`（值） |
| `props` | object | 扩展属性（如 `maxLength`、`minLength`、`linkage` 等） |
| `extra` | object/string | 补充说明（如限额提示、帮助链接） |
| `properties` | object | 子字段定义（当 type=object 时） |

## 2. 字段收集判断规则

**只收集 schema 中定义的必填字段**。schema 是唯一真相来源。

> **⚠️ 禁止从 values 推断字段是否存在。** values 中可能有 schema 中不存在的 key（如联动前 `screenshot: null`），这些字段当前不需要收集。只有 schema.properties 中存在的字段才参与判断。

| 条件 | 处理方式 |
|---|---|
| **schema 中存在** + `required=true` + values 中**无**对应值 + **非** `hidden` | **需要向用户收集** |
| **schema 中存在** + `required=true` + values 中**有**值 | 已有值，展示供用户确认 |
| **schema 中存在** + `hidden=true` | 不向用户展示，直接使用 values 中的值 |
| **schema 中存在** + `disabled=true` | 不可编辑，仅作信息展示 |
| **schema 中存在** + `required=false` | **不主动收集**，但接受用户主动提供值 |
| **schema 中不存在**（即使 values 中有该 key） | **完全忽略**，不展示、不收集 |

**判断步骤**：
1. 按 `structure.children` 顺序遍历区块
2. 在每个区块内，从 `data.schema.properties` 递归获取含 `widget` 的叶子字段，按 `order` 升序排列
3. 对每个 schema 中的字段，检查 values 中是否已有对应值（注意嵌套路径：`values.<blockId>.<fieldName>`）
4. 汇总出"需要收集的字段列表"

> 联动说明：某些字段只在特定条件下出现（如 webStatus=OFFLINE 时 screenshot 才出现在 schema 中）。每次 previewFormView 返回后 schema 可能变化，必须以最新 schema 为准重新分析。

## 3. widget 类型 → 交互方式映射

widget 决定字段的交互形态。同一类交互可能有多个 widget 名称，按以下分组统一处理。

### 文本输入类

| widget | 说明 |
|---|---|
| `input` | 通用文本框 |
| `DebounceInput` | 防抖文本框，交互同 input |
| `Password` | 密码框，交互同 input（输入时隐藏） |
| `TextArea` | 多行文本框，交互同 input |
| `InputNumber` | 数字输入框，**只接受数字** |

**LLM 交互方式**：请用户输入文本。使用 `title` 作为字段名，`placeholder` 作为提示，`props.maxLength` 提示长度限制。如有 `rules`，提前告知格式要求。`InputNumber` 需提示用户只能填数字。

### 选择类

| widget | 说明 |
|---|---|
| `radio` | 单选按钮组 |
| `select` | 下拉选择框（单选） |
| `checkboxes` | 多选复选框 |

**LLM 交互方式**：
- **radio / select**（单选）：展示 `enums` 中的选项列表（`key` 为展示名，`value` 为值），请用户选择一项。如选项有 `extra` 说明则附带展示。
- **checkboxes**（多选）：同上，但用户可选多项，值为选中项 value 的数组。

### 截图/图片类

| widget | 说明 | V1 状态 |
|---|---|---|
| `webSiteShotV2` | 网站截图（按 enums 逐项收集 picUrl） | **已支持** |
| `ImageUpload` | 通用图片上传 | **待定** |
| `ImageUploadV2` | 通用图片上传（V2） | **待定** |

**LLM 交互方式**：
- `webSiteShotV2`：按 `enums` 逐项引导用户提供截图 URL（picUrl），参考 `references/schema-guide.md §6.1` 的 array + enums 规则。已支持，正常收集。
- `ImageUpload` / `ImageUploadV2`：V1 待定，兜底处理见下方。

### 特殊类

| widget | 说明 | LLM 交互方式 |
|---|---|---|
| `mccV2` | MCC 类目选择 | 委托 MCC-Skill 处理，或使用已有 values |
| `ackInputV2` | 验证码输入 | 需先触发发送验证码，再请用户输入。V1 **待定** |
| `frontProtocol` | 协议展示 | 通常 `hidden=true`，不需用户操作。可展示协议名称和链接供知悉 |
| `customPrice` | 价格展示 | 不需用户操作，展示费率信息 |
| `criticalFrontAttr` | 关键属性 | 通常有预设值，展示供用户确认（如退款期限） |

### V1 兜底策略

遇到**待定** widget（`ImageUpload`、`ImageUploadV2`、`ackInputV2`）时（⚠️ `webSiteShotV2` 不在此列，它是已支持的截图组件）：
- 告知用户："此项（{title}）暂不支持在线操作，请前往支付宝商家中心完成。"
- 不阻断整体流程，继续收集其他字段
- 在确认汇总时标注该字段为"待线上补充"

## 4. 字段元信息使用指南

引导用户时，按以下优先级使用字段元信息：

| 属性 | 使用方式 |
|---|---|
| `title` | 作为字段名展示给用户（如"请输入 **App名称**"） |
| `description` | 补充说明字段含义（如"指APP上架的应用商店"） |
| `placeholder` | 作为输入提示（如"请输入完整的APP名称"） |
| `rules[].pattern` + `rules[].message` | pattern 是正则表达式，用户输入必须匹配才合法。收集前用 message 提前告知格式要求（如"名称长度不能超过20个字符"），收集后可用 pattern 做前置校验 |
| `props.maxLength` | 告知长度限制 |
| `enums[].key` / `enums[].value` | 列出可选项供用户选择 |
| `enums[].extra` | 选项的补充说明（如选择"未上线"时的限额提示） |
| `order` | 决定同一区块内字段的展示顺序（升序） |
| `extra` | 额外说明或帮助链接 |

## 5. 示例：contactInfo 区块解析

以下为 APP 支付中"联系人"区块的实际 artisanPage 数据，展示 schema → values 的对应关系：

**schema（字段定义）**：

```json
{
  "contactInfo": {
    "properties": {
      "contactName": {
        "title": "姓名",
        "type": "string",
        "widget": "input",
        "required": true,
        "order": 0,
        "props": { "maxLength": "20" },
        "rules": [{ "message": "姓名长度不能超过20个字符", "pattern": "^.{1,20}$" }]
      },
      "contactMobileInfo": {
        "title": "手机号码",
        "type": "object",
        "widget": "ackInputV2",
        "required": true,
        "order": 1,
        "props": { "ruleMessage": "请输入正确格式的手机号", "maxLength": "11" }
      },
      "ackCode": {
        "title": "验证码",
        "type": "string",
        "widget": "input",
        "required": true,
        "order": 2,
        "props": { "maxLength": "6" },
        "rules": [{ "message": "请输入正确的验证码", "pattern": "^.{6}$" }]
      }
    }
  }
}
```

**values（当前值）**：

```json
{
  "contactInfo": {
    "contactName": "少长",
    "contactMobileInfo": {
      "contactMobile": "17341375202"
    }
  }
}
```

**LLM 解析结果**：

| 字段 | required | values 有值？ | widget | 判断 |
|---|---|---|---|---|
| contactName | true | 有（"少长"） | input | 已有值，展示供确认 |
| contactMobileInfo | true | 有（含 contactMobile） | ackInputV2 | 已有值，展示供确认（V1 兜底：验证码相关交互待定） |
| ackCode | true | 无 | input | 需要收集（但依赖验证码发送，V1 可能兜底） |

## 6. type=array 字段解析规则

当字段 `type=array` 时，表示该字段需要收集**多个值**（值为数组）。根据字段的附加属性判断具体收集方式：

### 6.1 array + enums

```json
{
  "title": "网站页面截图",
  "type": "array",
  "widget": "ImageUploadV2",
  "enums": [
    { "key": "首页截图", "value": "HOME_PAGE" },
    { "key": "商品详情页截图", "value": "PRODUCT_PAGE" },
    { "key": "支付页面截图", "value": "PAY_PAGE" }
  ]
}
```

**含义**：`enums` 中的每一项代表需要收集的一个子项。enums 有 N 个值 → 需要收集 N 项。

**交互方式**：逐项引导用户提供，使用 `enums[].key` 作为每项的名称。例如上例需要收集 3 张图片：首页截图、商品详情页截图、支付页面截图。

**值格式**：数组，**按 enums 顺序排列**，每个位置对应同索引的 enum 项。用户提供的值必须按 enums 定义的顺序放入数组。

**写入 values 的格式**（以截图为例）：

```json
// enums 顺序: [0]首页截图, [1]商品详情页截图, [2]支付页面截图
// values 中数组位置与 enums 索引一一对应
"screenshot": [
  { "picUrl": "https://..." },   // [0] 对应 enums[0] 首页截图
  { "picUrl": "https://..." },   // [1] 对应 enums[1] 商品详情页截图
  { "picUrl": "https://..." }    // [2] 对应 enums[2] 支付页面截图
]
```

**LLM 关键职责**：用户提供图片时可能不按顺序说（如先说"支付页截图"），LLM 必须根据 enums 定义的顺序，将用户提供的值放到正确的数组位置。未提供的位置用 `{"picUrl": ""}` 占位。

**传入脚本的方式**：

```bash
# 将完整数组作为 JSON 传入
python3 scripts/build_preview_request.py 'webSiteInfo.screenshot=[{"picUrl":"https://home.png"},{"picUrl":"https://product.png"},{"picUrl":"https://pay.png"}]'
```

### 6.2 array + props.maxCount（无 enums）

```json
{
  "title": "网站备注图片",
  "type": "array",
  "widget": "ImageUploadV2",
  "props": { "maxCount": "3", "accept": ".png,.jpg,.jpeg" }
}
```

**含义**：用户可上传最多 `maxCount` 项，但不强制必须提供满。

**交互方式**：告知用户最多可提供 N 项，按需上传。

### 6.3 判断优先级

| 条件 | 收集数量 | 说明 |
|---|---|---|
| 有 `enums` | enums 的长度 = 必须收集的项数 | 每个 enum 对应一项 |
| 无 `enums`，有 `props.maxCount` | 最多 maxCount 项 | 非强制填满 |
| 都没有 | 至少 1 项 | 按 widget 类型引导 |
