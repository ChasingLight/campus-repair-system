# 语法解析错误

> 代码无法解析，阻断所有后续类型检查，必须最先修复。
> TS1005 和 JSX 闭合错误是最容易反复出现的语法问题 — 修复后务必检查配对完整性。

---

## 通用闭环（先做这一步）

**判定特征**
- tsc/vue-tsc 输出第一条错误即为语法类（TS1005/TS1127/TS1128/TS1109/TS1136/TS1434 等）
- 同一文件/相邻行出现大量级联错误（修第一条后通常会批量消失）

**最小修复步骤（通用）**
1. 只看**第一条**报错的文件路径 + 行列号（后续同文件报错大概率为级联）
2. 从第一条报错行**向上回溯 20-80 行**，找到最近的函数/组件/对象字面量边界，重点检查括号/模板字符串是否闭合
3. 若第一条报错是 `';' expected` / `Expression expected` 这类"缺符号"，优先怀疑**上一段代码**缺了 `)`/`}`/`` ` ``/`,` 等

> **防止"修了 A 引入 B"**：语法错误修复后常引入 TS2339/TS2304 类型错误。修复语法时不要随意改变量名或删代码，只修最小范围的符号缺失。

**复跑验证**
- 复跑触发该错误的同一条命令（test_run/CI 里是什么就复跑什么）：`npx tsc --noEmit` / `npx vue-tsc --noEmit` / `pnpm ts-check`
- 目标：错误数明显下降，或第一条报错位置发生变化（说明修复有效，继续按第一条错误推进）

**仍失败时需要补充**
- 第一条报错及其上下文（同文件向上 50 行 + 向下 20 行）
- 实际执行命令与执行目录（monorepo/子包尤其重要）

---

## TS1005 — 预期符号缺失

**判定特征**
- 报错：`';' expected` / `'}' expected` / `',' expected`

**常见根因**
- 括号、花括号、方括号不匹配，或分号/逗号缺失
- AI 生成代码截断（大文件分段写入时拼接断裂）
- JSX 中表达式未用 `{}` 正确包裹
- 模板字符串 `` ` `` 未闭合

**最小修复步骤（在"通用闭环"基础上补充）**
1. 统计全文括号差值：在编辑器里搜索并粗略统计 `{` vs `}` 和 `(` vs `)` 的数量差，先确认缺了几个、缺的是哪种
2. JSX 场景重点看 `.map()`：返回值是否用 `()` 包裹，结尾是否闭合为 `))}`

重点检查的高频场景：
- JSX 中 `.map()` 的返回值是否被 `()` 包裹，末尾必须是 `))}` 三连闭合
- 对象/数组字面量的末尾逗号和闭合括号
- 多层嵌套的 `{}` 是否对称
- 模板字符串 `` ` `` 是否成对（特别是多行模板字符串）

```typescript
// ❌ Bad — map 返回的 JSX 缺少闭合
{items.map((item) =>
  <span>{item.name}</span>
// 缺少 )}

// ✅ Good
{items.map((item) => (
  <span>{item.name}</span>
))}
```

**复跑验证**
- 复跑 `npx tsc --noEmit`（或 test_run 中同一条命令），确认同文件后续的 TS1005/TS1128/TS1109 级联错误是否消失

---

## JSX 标签闭合专项（TS17008 / TS17002 / TS1381）

> JSX 闭合是最容易"修了又错"的语法问题。

**判定特征**
- TS17008：`JSX element 'xxx' has no corresponding closing tag.`
- TS17002：`Expected corresponding JSX closing tag for 'xxx'.`
- TS1381：`Unexpected token. Did you mean '{'}'}' or '&rbrace;'?`

**修复检查清单（每次修 JSX 后必须逐条确认）**

1. **每个开标签必有对应闭标签**：
   - `<div>` 必有 `</div>`
   - `<Component>` 必有 `</Component>`
   - 自闭合标签必须写 `/>`：`<img />`、`<br />`、`<input />`、`<Component />`

2. **嵌套层级检查**：从外到内逐层确认配对
   ```typescript
   // 从外到内检查：div → Card → CardContent → p
   <div>               {/* 第1层 */}
     <Card>            {/* 第2层 */}
       <CardContent>   {/* 第3层 */}
         <p>text</p>   {/* 第4层 ✓ */}
       </CardContent>  {/* 第3层 ✓ */}
     </Card>           {/* 第2层 ✓ */}
   </div>              {/* 第1层 ✓ */}
   ```

3. **花括号内的 JSX 表达式**：
   ```typescript
   // ❌ Bad — 花括号内的条件渲染少了闭标签
   {isVisible && <div>
     <span>content</span>
   }

   // ✅ Good
   {isVisible && (
     <div>
       <span>content</span>
     </div>
   )}
   ```

4. **三元表达式中的 JSX**：两个分支都必须有完整的标签配对
   ```typescript
   // ❌ Bad — else 分支标签不完整
   {isLoading ? <Spinner /> : <div><span>loaded</div>}

   // ✅ Good
   {isLoading ? <Spinner /> : <div><span>loaded</span></div>}
   ```

---

## TS1127 — 非法字符

**判定特征**
- 报错：`Invalid character.`

**常见根因**
- 代码中混入了中文全角标点或不可见 Unicode 字符
- 全角逗号 `，`、分号 `；`、冒号 `：`、引号 `""`、括号 `（）`
- BOM 标记、零宽空格等不可见字符

**最小修复步骤**
1. 定位报错行，把全角标点替换为半角（最常见：`，` `；` `：` `（` `）`）
2. 若是不可见字符（看起来"没问题"但仍报错），删除该行并手动重打

```typescript
// ❌ Bad
const name = "hello"；      // 全角分号
const data = {key： "value"} // 全角冒号

// ✅ Good
const name = "hello";
const data = {key: "value"}
```

---

## TS1128 — 预期声明或语句

**判定特征**
- 报错：`Declaration or statement expected.`

**常见根因**
- 文件中存在多余的 `}` 或代码块层级错乱，通常由 copy-paste 或分段写入导致

**最小修复步骤**
1. 在报错位置上下各看 20-50 行，检查是否有多余的 `}` / `)` / `]`
2. 若报错位置出现在文件末尾，重点检查是否遗漏了某个代码块的开头

---

## TS1109 — 预期表达式

**判定特征**
- 报错：`Expression expected.`

**常见根因**
- 在需要表达式的位置使用了语句（如 `if`/`for`）或不完整的表达式
- 最常见：JSX `{}` 内写了语句

**最小修复步骤**
- JSX `{}` 内只能放表达式：`if` → 三元运算符，`for` → `.map()`

```typescript
// ❌ Bad — JSX 内写了 if 语句
<div>{if (show) { <span>text</span> }}</div>

// ✅ Good — 三元表达式
<div>{show ? <span>text</span> : null}</div>
```

---

## TS1136 — 预期属性赋值

**判定特征**
- 报错：`Property assignment expected.`

**常见根因**
- 对象字面量内部语法错误：键值对间缺少逗号、使用了 `=` 而非 `:`、或在对象内写了语句块

**最小修复步骤**
- 检查对象字面量：键值用 `:` 分隔，属性间用 `,` 分隔

---

## TS1434 — 意外的关键字或标识符

**判定特征**
- 报错：`Unexpected keyword or identifier.`

**常见根因**
- `require()` 写入了 ESM 模块（`.ts` 文件）
- 缺少 `async` 关键字但使用了 `await`
- 类型标注语法错误

**最小修复步骤**
- `require()` → `import`
- 检查 `await` 是否在 `async` 函数内
- 检查类型标注是否使用了正确的 `:` 而非 `=`
