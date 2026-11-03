# Mobile 原型规范

---

## Head 模板

> Head 模板及 `@theme` 结构见骨架模板 [templates/skeleton-mobile.html](templates/skeleton-mobile.html)

---

## 页面骨架 / 全局组件一致性

> 页面骨架（Header / TabBar HTML 结构）、全局组件一致性规则见 [common-mobile.md](common-mobile.md)

---

## 通用组件

```html
<!-- 主按钮（全宽） -->
<button class="w-full bg-primary text-on-primary py-3.5 rounded-xl text-base font-semibold
               hover:opacity-90 active:scale-[0.98] transition-all inline-flex items-center justify-center gap-2">
  <i data-lucide="check" class="w-5 h-5"></i>确认
</button>

<!-- 次按钮 -->
<button class="w-full bg-surface-container text-on-surface-variant border-none py-3.5 rounded-xl text-base font-semibold
               hover:bg-surface-container-high active:scale-[0.98] transition-all">跳过</button>

<!-- 卡片 -->
<div class="bg-surface rounded-xl shadow-card mx-4 p-4">内容</div>

<!-- 输入框（必须 border-none + bg-surface-container） -->
<input class="w-full bg-surface-container border-none rounded-xl px-4 py-3 text-base
              text-on-surface placeholder:text-on-surface-variant/50
              focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"/>

<!-- 多行输入框 -->
<textarea class="w-full bg-surface-container border-none rounded-xl px-4 py-3 text-base
                 text-on-surface placeholder:text-on-surface-variant/50
                 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors resize-none"
          rows="4"></textarea>

<!-- 列表项 -->
<div class="flex items-center px-4 py-3 bg-surface hover:bg-surface-container active:bg-surface-container transition-colors">
  <div class="flex-1 min-w-0">
    <p class="text-sm font-medium text-on-surface truncate">标题</p>
    <p class="text-xs text-on-surface-variant mt-0.5">副标题</p>
  </div>
  <i data-lucide="chevron-right" class="w-3.5 h-3.5 text-on-surface-variant/50"></i>
</div>

<!-- Badge -->
<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/15 text-primary">新</span>

<!-- 模态框（底部弹出） -->
<div class="fixed inset-0 bg-black/50 z-50 flex items-end">
  <div class="bg-surface rounded-t-2xl w-full max-h-[80vh] overflow-y-auto p-6
              pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
    内容
  </div>
</div>
```

---

## 设计规则 / 图标 / 图片 / UI 要素 / 禁止事项

> 以上公共规范见 [common-mobile.md](common-mobile.md)

---

## 导航规范

### 四种核心导航动作

| 动作 | 场景 | 函数 |
|------|------|------|
| **PUSH（层级深入）** | 列表→详情，需要返回 | `navPush(route)` |
| **REPLACE（流程切换）** | 步骤1→步骤2，登录→注册 | `navReplace(route)` |
| **RESET（归位）** | 支付成功→回首页，退出登录 | `navReset(route)` |
| **BACK（返回）** | 左上角返回按钮，取消 | `navBack()` |

### 导航辅助函数（每个页面必须定义）

```javascript
function navPush(route) {
    console.log(`[原型演示] PUSH 到: ${route}`);
    window.location.href = route;
}

function navReplace(route) {
    console.log(`[原型演示] REPLACE 为: ${route}`);
    window.location.replace(route);
}

function navReset(route) {
    console.log(`[原型演示] RESET 到: ${route}`);
    window.location.href = route;
}

function navBack() {
    console.log(`[原型演示] BACK 返回上一页`);
    if(window.history.length > 1) window.history.back();
}
```

### TabBar 导航规则

- TabBar 标签间切换使用 `navReset`，不用 `navPush`
- 当前激活标签高亮显示

```html
<script>
    $(function() {
        $('#nav-home').on('click', function(e) {
            e.preventDefault();
            navReset('home.html');
        });
        $('#nav-profile').on('click', function(e) {
            e.preventDefault();
            navReset('profile.html');
        });
    });
</script>
```

---

## 交互规范

### 交互元素 ID

所有有交互功能的元素必须添加语义化 id：`id="btn-submit"`、`id="nav-home"`、`id="card-item-1"`

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
    navPush(`detail.html?item_id=${item_id}`);
});
```

#### 接收参数：详情页内容硬编码（必须遵守）

详情页内容**直接硬编码在 HTML 中**，禁止通过 JS 根据 URL 参数查找 mock 数据再写入 DOM。不管从哪个入口进入，展示的都是同一份硬编码内容。

**禁止**在参数为空时调用 `navBack()` 或提前 `return`。

```html
<!-- 详情页内容直接硬编码，无需 JS 动态渲染 -->
<h1 id="item-name" class="text-xl font-bold text-on-surface">示例标题</h1>
<p id="item-desc" class="text-sm text-on-surface-variant mt-2">详细描述内容</p>
```

### 列表选择/编辑点击区分离

卡片拆成两个独立热区：主操作区（约85%）+ 编辑按钮区（约15%，宽度≥44px）：

```html
<div class="item-card" data-id="addr-1">
    <div class="card-main"><!-- 选择/进入详情 --></div>
    <button class="card-edit-btn" aria-label="编辑"></button>
</div>
<script>
$(function(){
    $('.card-main').on('click', function(){
        const id = $(this).closest('.item-card').data('id');
        navPush(`detail.html?id=${id}`);
    });
    $('.card-edit-btn').on('click', function(e){
        e.stopPropagation();
        const id = $(this).closest('.item-card').data('id');
        navPush(`edit.html?id=${id}`);
    });
});
</script>
```

### 第三方接口处理

保留 UI 元素，事件处理函数中只添加一行日志：

```javascript
$('#camera-button').on('click', function() {
    console.log('需要调用第三方接口实现相机拍照功能');
});
```

### 登录页

登录页账号密码**禁止预设或硬编码**，demo 项目不判断账密，用户可使用任意符合格式的账号密码登录。

---

## Mock 数据规范（硬编码 HTML）

> **核心原则：禁止通过 JS 动态渲染首屏数据。** 所有 mock 数据必须以完整 HTML 直接写在 DOM 中，确保页面可流式从上往下渲染，无需等待 `<script>` 执行。

### 数据硬编码

- 列表/卡片/Feed 等重复数据区域，**每条数据直接写一个完整的 HTML 节点**
- 列表接口至少准备 **3-5 条**具有差异的真实感数据

```html
<div id="post-list">
  <div class="bg-surface rounded-xl shadow-card mx-4 mb-3 p-4">
    <div class="flex items-center gap-3 mb-2">
      <div class="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
        <span class="text-xs font-bold text-primary">小</span>
      </div>
      <span class="text-sm font-medium text-on-surface">小初</span>
    </div>
    <p class="text-sm text-on-surface">今日份 OOTD</p>
    <img src="https://images.unsplash.com/photo-xxx" alt="今日份 OOTD" data-category="服饰时尚"
         class="w-full h-40 object-cover rounded-lg mt-2"/>
    <div class="flex items-center gap-1 mt-3 text-on-surface-variant">
      <i data-lucide="heart" class="w-3.5 h-3.5"></i>
      <span class="text-xs">128</span>
    </div>
  </div>
  <div class="bg-surface rounded-xl shadow-card mx-4 mb-3 p-4">
    <div class="flex items-center gap-3 mb-2">
      <div class="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
        <span class="text-xs font-bold text-primary">美</span>
      </div>
      <span class="text-sm font-medium text-on-surface">美食家</span>
    </div>
    <p class="text-sm text-on-surface">美味午餐分享</p>
    <img src="https://images.unsplash.com/photo-yyy" alt="美味午餐分享" data-category="食物"
         class="w-full h-40 object-cover rounded-lg mt-2"/>
    <div class="flex items-center gap-1 mt-3 text-on-surface-variant">
      <i data-lucide="heart" class="w-3.5 h-3.5"></i>
      <span class="text-xs">56</span>
    </div>
  </div>
  <div class="bg-surface rounded-xl shadow-card mx-4 mb-3 p-4">
    <div class="flex items-center gap-3 mb-2">
      <div class="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
        <span class="text-xs font-bold text-primary">户</span>
      </div>
      <span class="text-sm font-medium text-on-surface">户外控</span>
    </div>
    <p class="text-sm text-on-surface">周末去爬山了</p>
    <div class="flex items-center gap-1 mt-3 text-on-surface-variant">
      <i data-lucide="heart" class="w-3.5 h-3.5"></i>
      <span class="text-xs">89</span>
    </div>
  </div>
</div>
```
