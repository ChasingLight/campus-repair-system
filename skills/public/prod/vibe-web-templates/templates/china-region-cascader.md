# 中国行政区划选择器 框架指引（1~5 级任意深度）

> 只搭框架。视觉样式 / 组件库 / 断点由落地页面取值，不在指引内。
> 层级深度是业务参数 `maxLevel: 1..5`，同一套框架支持任意档位。**禁止**为不同深度复制多套组件。

## 1. 层级模型

| Level | 名称 | 编码长度 | 备注 |
| --- | --- | --- | --- |
| L1 | 省 / 直辖市 / 自治区 / 特别行政区 | 2 | 共 34 |
| L2 | 地级市 / 地区 / 自治州 / 盟 | 4 | 直辖市仅"市辖区"占位 |
| L3 | 市辖区 / 县级市 / 县 / 自治县 / 旗 | 6 | |
| L4 | 街道 / 镇 / 乡 | 9 | 港澳台普遍缺失 |
| L5 | 居委会 / 村委会 | 12 | 更新滞后 |

框架内部统一按 5 级建模、12 位补零编码（`110108015001`）；UI 展示几级由 `maxLevel` 决定。

## 2. maxLevel 取值

| maxLevel | 典型场景 |
| --- | --- |
| 1 | 省份分桶 / 看板筛选 |
| 2 | 城市选择 |
| 3 | 一般注册 / 收货地址（最常见） |
| 4 | 物流 / 农村电商 / 本地生活 |
| 5 | 政务 / 户籍 / 普查 / 补贴 |

## 3. 数据契约

```ts
type RegionLevel = 1 | 2 | 3 | 4 | 5;

interface RegionNode {
  code: string;          // 12 位补零
  name: string;
  level: RegionLevel;
  parentCode: string | null;
  hasChildren: boolean;
}

interface RegionPath {
  nodes: RegionNode[];   // 从 L1 起连续
  code: string;          // 末级 code
}
```

**铁律**：业务存储只存末级 code（12 位补零），不存 name、不存数组。展示时反查。

## 4. 模块切分

```
region/
├── model/    类型、编码工具（splitCode/truncateCode/isValidCode）
├── source/   RegionDataSource 抽象 + Static/Remote/Hybrid 实现
├── cache/    可插拔（Memory / IndexedDB）
├── service/  listChildren / resolvePath / search / validate
└── ui/       视图层，实现 RegionPickerProps 契约
```

`ui` 与 `service` 严格分离，换 UI 形态不改数据层。

## 5. 数据来源（强约定：用 `china-division`）

不要手写、不要自抓统计局。npm 包 [`china-division`](https://www.npmjs.com/package/china-division)（modood，18k+ star，年度同步官方）覆盖 L1~L4，提供 JSON / SQL 双格式。

```bash
npm i china-division
```

```ts
import provinces from 'china-division/dist/provinces.json'; // L1
import cities    from 'china-division/dist/cities.json';    // L2
import areas     from 'china-division/dist/areas.json';     // L3
import streets   from 'china-division/dist/streets.json';   // L4 可选
// L5 该包不带，自建后端 API 懒加载
```

适配到 `RegionNode`：

```ts
const pad12 = (c: string) => (c + '000000000000').slice(0, 12);

export function buildStaticNodes(): RegionNode[] {
  const cityP = new Set(cities.map(c => c.provinceCode));
  const areaC = new Set(areas.map(a => a.cityCode));
  return [
    ...provinces.map(p => ({ code: pad12(p.code), name: p.name, level: 1 as const,
      parentCode: null, hasChildren: cityP.has(p.code) })),
    ...cities.map(c => ({ code: pad12(c.code), name: c.name, level: 2 as const,
      parentCode: pad12(c.provinceCode), hasChildren: areaC.has(c.code) })),
    ...areas.map(a => ({ code: pad12(a.code), name: a.name, level: 3 as const,
      parentCode: pad12(a.cityCode), hasChildren: false })),
  ];
}
```

| maxLevel | 数据策略 | 数据源 |
| --- | --- | --- |
| 1~3 | china-division 静态 import | `StaticDataSource` |
| 4 | + streets.json | `StaticDataSource` 或 `HybridDataSource` |
| 5 | L1~L3 静态 + L4~L5 后端 API | `HybridDataSource` |

注意：按需 dynamic import 避免拖累首屏；SQL 文件可直灌后端 `regions` 表；版本固定到小版本。

## 6. 数据源 & 服务层 API

```ts
interface RegionDataSource {
  listRoots(): Promise<RegionNode[]>;
  listChildren(parentCode: string): Promise<RegionNode[]>;
  resolvePath(code: string): Promise<RegionPath>;
  search(q, opts?): Promise<RegionPath[]>;
}

interface RegionService {
  loadChildren(parentCode: string | null): Promise<RegionNode[]>;
  resolvePath(code: string): Promise<RegionPath>;
  search(q, opts?): Promise<RegionPath[]>;
  validate(code: string, requiredLevel: RegionLevel): Promise<boolean>;
}
```

新增数据源（高德/自建库）= 加实现类，service 与 UI 不变。`validate` 是框架级强约束：前后端都要调，防 L4 不属于所选 L3 的篡改。

## 7. 特例（service 内消化，不漏给 UI）

- **直辖市**：L2 仅"市辖区"占位。开关 `collapseMunicipalityL2` 控制 UI 是否跳过该列；数据 path 始终完整。
- **港澳台**：`hasChildren=false` 自然停止下钻并允许提交。

## 8. UI 契约（不绑形态）

```ts
interface RegionPickerProps {
  value?: string;                 // 末级 12 位 code
  onChange?(code: string, path: RegionPath): void;
  maxLevel: RegionLevel;
  minLevel?: RegionLevel;
  service: RegionService;
  collapseMunicipalityL2?: boolean;
  disabled?: boolean;
  // 视觉 props 一律不进框架
}
```

UI 形态由页面选：PC 横向级联 / 移动 Tab 弹层 / 搜索回填 / 抽屉 / 地图。各自实现 `RegionPickerProps` 可互换。

## 9. 后端接口

```
GET  /api/regions?parent={code|root}    → RegionNode[]
GET  /api/regions/path?code={code}      → RegionPath
GET  /api/regions/search?q=&level=      → RegionPath[]
POST /api/regions/validate              → { ok }
```

返回结构与第 3 节模型一致，前端零转换。

## 10. 验收清单

- [ ] 编码工具单测覆盖归一化 / 截断 / 校验
- [ ] `RegionDataSource` 至少 Static + Hybrid 两种可注入
- [ ] `validate` 前后端均接入，篡改 code 链路被拒
- [ ] 直辖市占位、港澳台空下级在 service 层消化
- [ ] 同一份代码跑通 maxLevel = 1/2/3/4/5 各一个用例
- [ ] 编辑场景：传末级 code 能回填整条 path
- [ ] `china-division` 固定小版本、按需 dynamic import
