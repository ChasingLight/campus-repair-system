# Web 原型规范

---

## Head 模板

> Head 模板及 `@theme` 结构见骨架模板 [templates/skeleton-web.html](templates/skeleton-web.html)

---

## 布局结构 / 全局组件一致性

> 布局结构、导航组件 HTML 结构、全局组件一致性规则见 [common-web.md](common-web.md)

---

## 通用组件

```html
<!-- 主按钮 -->
<button class="bg-primary text-on-primary px-4 py-2 rounded-md text-sm font-medium
               hover:opacity-90 active:scale-[0.98] transition-all inline-flex items-center gap-2">
  <i data-lucide="plus" class="w-3.5 h-3.5"></i>新建
</button>

<!-- 次按钮 -->
<button class="bg-surface-container text-on-surface border-none px-4 py-2 rounded-md text-sm font-medium
               hover:bg-surface-container-high active:scale-[0.98] transition-all">取消</button>

<!-- 卡片 -->
<div class="bg-surface rounded-lg shadow-card p-5">内容</div>

<!-- 输入框（必须 border-none + bg-surface-container） -->
<input class="w-full bg-surface-container border-none rounded-md px-3 py-2 text-sm
              text-on-surface placeholder:text-on-surface-variant/50
              focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"/>

<!-- Badge -->
<span class="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium bg-success/15 text-success">进行中</span>
<span class="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium bg-error/15 text-error">已停止</span>

<!-- 表格 -->
<div class="bg-surface rounded-lg shadow-card overflow-hidden">
  <div class="grid grid-cols-4 px-4 py-3 bg-surface-container text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
    <span>名称</span><span>状态</span><span>日期</span><span>操作</span>
  </div>
  <div class="divide-y divide-outline-variant/50">
    <div class="grid grid-cols-4 px-4 py-3 hover:bg-surface-container/50 transition-colors">
      <span class="text-sm font-medium">项目 A</span>
      <span class="inline-flex items-center px-2 py-0.5 rounded-sm text-xs bg-success/15 text-success w-fit">进行中</span>
      <span class="text-sm text-on-surface-variant">2024-01-15</span>
      <button class="text-primary text-sm font-medium hover:underline w-fit">编辑</button>
    </div>
  </div>
</div>

<!-- 模态框 -->
<div class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
  <div class="bg-surface rounded-xl shadow-dialog max-w-md w-full max-h-[90vh] overflow-y-auto p-6">
    内容
  </div>
</div>
```

---

## 设计规则 / 图标 / 图片 / UI 要素 / 禁止事项

> 以上公共规范见 [common-web.md](common-web.md)

---

## 交互规范

### 交互元素 ID

所有有交互功能的元素必须添加语义化 id：`id="btn-submit"`、`id="nav-dashboard"`、`id="table-row-1"`

### jQuery 统一使用

- 所有交互逻辑使用 jQuery 写法
- 页面脚本统一在 `$(function(){ ... })` 中初始化
- 统一使用 `$()` 与 `.on()` 进行事件绑定
- **不要使用原生 `getElementById` 或 `querySelector`**

### 选择器规范

- jQuery 选择器**优先使用 `#id`**，禁止用 class 组合链（如 `$('.flex.items-center.gap-2 button')`）作为交互选择器
- 列表子项等重复元素可用 `.class` 选择集合（如 `.todo-item`），但容器和具名按钮必须用 `#id`
- 事件委托时，外层容器用 `#id`，内层目标用 `.class`：`$('#todo-list').on('click', '.btn-delete', fn)`

### 交互复杂度原则

原型只需实现**简单交互**（切换状态、筛选 show/hide、删除节点、页面跳转等）。

**复杂交互**（内联编辑、拖拽排序、富文本输入等）**禁止实现完整逻辑**，只需：
1. 保留 UI 元素（按钮/入口）在 HTML 中
2. 绑定事件入口
3. **注释中必须详细描述后续应实现的完整交互行为**，让后续开发者能直接据此编码，不能只写一句"编辑功能"

```javascript
// 编辑按钮 - 点击后应实现内联编辑：
// 1. 将标题文字替换为 input 输入框，自动聚焦并全选
// 2. 按 Enter 保存修改，按 ESC 取消编辑
// 3. 保存后更新列表项的标题文字
$('#todo-list').on('click', '.btn-edit', function() {
    console.log('编辑待办:', $(this).closest('.todo-item').data('id'));
});
```

### 参数处理

#### 发送参数

```javascript
$('#detail-button').on('click', function() {
    const item_id = $(this).data('id');
    window.location.href = `detail.html?item_id=${item_id}`;
});
```

#### 接收参数：详情页内容硬编码（必须遵守）

详情页内容**直接硬编码在 HTML 中**，禁止通过 JS 根据 URL 参数查找 mock 数据再写入 DOM。不管从哪个入口进入，展示的都是同一份硬编码内容。

**禁止**在参数为空时调用 `window.history.back()` 或提前 `return`。

```html
<!-- 详情页内容直接硬编码，无需 JS 动态渲染 -->
<h1 id="item-name" class="text-xl font-bold text-on-surface">示例标题</h1>
<p id="item-desc" class="text-sm text-on-surface-variant mt-2">详细描述内容</p>
```

### 第三方接口处理

保留 UI 元素，事件处理函数中只添加一行日志：

```javascript
$('#camera-button').on('click', function() {
    console.log('需要调用第三方接口实现相机拍照功能');
});
```

### 登录页

登录页账号密码**禁止预设或硬编码**，demo 项目不判断账密，直接跳转。

---

## Mock 数据规范（硬编码 HTML）

> **核心原则：禁止通过 JS 动态渲染首屏数据。** 所有 mock 数据必须以完整 HTML 直接写在 DOM 中，确保页面可流式从上往下渲染，无需等待 `<script>` 执行。

### 数据硬编码

- 列表/卡片/表格等重复数据区域，**每条数据直接写一个完整的 HTML 节点**
- 列表接口至少准备 **3-6 条**具有差异的真实感数据

```html
<div id="table-body">
  <div class="grid grid-cols-5 gap-4 px-6 py-4 hover:bg-surface-container/50 transition-colors">
    <span class="text-sm font-medium text-on-surface">张小美</span>
    <span class="text-sm text-on-surface-variant">138****5678</span>
    <span class="text-sm font-semibold text-primary">¥3,280.00</span>
    <span class="text-sm text-on-surface-variant">2024/1/15</span>
    <div class="flex gap-3">
      <button class="text-primary text-sm font-medium hover:underline">编辑</button>
    </div>
  </div>
  <div class="grid grid-cols-5 gap-4 px-6 py-4 hover:bg-surface-container/50 transition-colors">
    <span class="text-sm font-medium text-on-surface">李晓华</span>
    <span class="text-sm text-on-surface-variant">139****1234</span>
    <span class="text-sm font-semibold text-primary">¥5,600.00</span>
    <span class="text-sm text-on-surface-variant">2024/1/12</span>
    <div class="flex gap-3">
      <button class="text-primary text-sm font-medium hover:underline">编辑</button>
    </div>
  </div>
  <div class="grid grid-cols-5 gap-4 px-6 py-4 hover:bg-surface-container/50 transition-colors">
    <span class="text-sm font-medium text-on-surface">王大明</span>
    <span class="text-sm text-on-surface-variant">137****9999</span>
    <span class="text-sm font-semibold text-primary">¥1,200.00</span>
    <span class="text-sm text-on-surface-variant">2024/1/10</span>
    <div class="flex gap-3">
      <button class="text-primary text-sm font-medium hover:underline">编辑</button>
    </div>
  </div>
</div>
```

