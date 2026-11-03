# Coze AI 网页应用收款代码开发指南

本文只约束 Coze Node.js 项目的代码开发行为，不重复支付宝接口字段、生产凭证或沙箱协议。接口和浏览器提交事实以 [`interface-contract/webpay-interface-contract.md`](interface-contract/webpay-interface-contract.md) 为唯一依据；可运行形态以 [`code-examples/nodejs/2-网站支付/统一收单下单并支付页面接口代码示例.md`](code-examples/nodejs/2-网站支付/统一收单下单并支付页面接口代码示例.md) 为基线。冲突时停止核对，不自行拼接第三套实现。

## 修改前门控

在修改项目代码前依次完成：

1. 完整读取网站支付接口契约和本文。
2. 读取项目 `package.json`、锁文件、实际框架结构、现有订单存储和已安装 `alipay-sdk` 的类型定义。
3. 定位服务端下单、前端购买入口、订单结果页、交易查询、退款、关单和异步通知的实际落点；已有结构优先，不预设 Express、Next.js、React 或固定文件名。
4. 再读取 runtime 返回的 SDK、平台、其余接口契约和 Node.js 示例。未完成这些依据读取前不得写代码。

## Coze 接入红线

以下规则是 Coze 代码开发的集中执行约束。接口参数和浏览器提交事实仍以网站支付接口契约为准，不从调试结论反推未经证实的浏览器或支付宝规则。

### 项目根与沙箱配置

- Agent 的检查、写入、启动和验证只使用 runner 确认的 `PROJECT_PATH`。Node.js 项目的支付宝 SDK 配置入口固定为 `alipay-sdk-config.ts`；该入口负责从实际 Node.js package 根加载 `.alipay-sandbox.json`，找不到、越界或字段非法时失败关闭。
- Next.js 编译后的服务端模块目录可能位于 `.next/server/...`，不得从该模块的 `__dirname` 反推项目根。Next.js 可使用 `process.cwd()`，但写入代码前必须确认开发、构建和实际启动命令都以目标 `package.json` 所在目录为运行目录，并核对由此得到的配置路径就是 `PROJECT_PATH/alipay-sdk-config.ts`，再由其读取 `PROJECT_PATH/.alipay-sandbox.json`；不得声称 `process.cwd()` 在所有部署中必然正确。
- 若 monorepo、工作区启动器或现有部署方式令运行目录不是目标 package 根，沿用项目已有的显式应用根配置。其他 Node.js 框架同样按实际启动与部署证据选择稳定锚点，不使用 Agent 启动目录、Skill 目录或猜测路径。

### Coze 域名与回跳 URL

- 用户未额外指定域名时，默认使用 `COZE_PROJECT_DOMAIN_DEFAULT`。它是 Coze 当前项目默认域名，可能是 hostname，也可能已经是完整 `https://` URL。
- 用户明确指定域名时，必须使用当前 Coze 项目的实际域名；自定义域名可参考 `COZE_PROJECT_DOMAIN_ALL` 核对。不得要求项目域名必须等于 `COZE_PROJECT_DOMAIN_DEFAULT`，也不得使用不属于当前项目的任意外部域名。
- 对选定域名先去除首尾空白；仅在值没有 scheme 时补一次 `https://`，再通过 `new URL()` 解析。只接受 HTTPS、非空 hostname，且不含用户名、密码、业务 path、query 或 hash；最终只使用解析后的 `origin`。
- 禁止用 `` `https://${process.env.COZE_PROJECT_DOMAIN_DEFAULT}` ``、`'https://' + value` 一类无条件拼接。`return_url` 与 `notify_url` 使用 `new URL(path, origin)` 构造，查询参数用 `searchParams` 写入，禁止字符串级协议清理和重复拼接。
- 用户未额外强调支付后回跳页面时，默认 `return_url` 指向项目支付结果页；新项目默认实现 `/pay/result`，已有项目可沿用真实结果页 GET 路由。`notify_url` 指向项目真实的异步通知 POST 路由；新项目可使用 `/api/pay/notify`，已有项目可沿用真实通知路由。
- 环境值缺失、不合法或无法确认用户指定域名属于当前 Coze 项目时明确失败，不使用示例域名、请求头或客户端输入兜底。

### Coze 预览收银台

- 服务端固定通过 `pageExec('alipay.trade.page.pay', 'POST', ...)` 返回 HTML form；这是当前 Skill 选定的实现契约。不得把 `form.action`、hidden input、`URLSearchParams` 或 `FormData` 拼成 query string 后用 GET 跳转，也不得进一步声称 GET 必然签名无效，除非有当前 SDK 实际返回或官方资料证明。
- 默认交互是点击支付后在应用内显示 loading、向服务端创建支付并立即提交返回的 form，不增加第二次确认。支付流程禁止 `window.confirm()`、`window.alert()`、`window.prompt()` 等浏览器原生对话框；错误在当前应用内联展示。只有用户明确要求或项目既定产品体验包含订单确认时，才保留应用内自有 modal，并从其唯一确认回调提交。
- 前端使用 inert `template` 解析返回 HTML，只提取 form，不执行内嵌脚本。`template` 是本 Skill 的统一实现选择；跨域 form 可以由浏览器正常提交，不能把跨域本身误判为 `template` 方案失效，也不得把“DOMParser 会执行脚本”当作选择依据。
- 先校验 action 的 `protocol === 'https:'`，再比较 `${action.origin}${action.pathname}` 与当前生效配置的固定完整网关；不要把沙箱域名写死为唯一白名单，也不要在前端自行猜环境后再切换网关。移除 `target`，把隐藏 form 追加到当前文档，再调用 `HTMLFormElement.prototype.submit.call(form)`；该写法避免控件名 `submit` 遮蔽方法，不是为了绕过 React。`form.submit()` 没有触发可见跳转时，不得在没有浏览器控制台或网络证据的情况下归因“用户手势丢失”，也不得改成 `window.location.href` 或 GET 化 hidden input。
- 默认从创建支付请求的异步处理函数直接提交，不为“等待 React 渲染”额外引入 state/effect。确有项目结构要求使用 effect 时，必须一次性消费状态，防止 React Strict Mode 或重复渲染二次提交。
- 禁止 `document.open/write/close`、`window.open()`、`_blank`、全屏白色过渡层或把 HTML 当 URL。`document.write()` 会替换当前应用文档，不得因一次调试成功或“跨域会拦截 template”这一错误归因而采用。
- `target` 移除只保证浏览器请求在当前 browsing context 提交，不等于能凭代码保证所有 Coze iframe、浏览器策略或支付宝页面 CSP 都允许嵌入。必须在当前 Coze 预览实际点击验证；若平台阻止当前上下文导航，记录真实控制台/网络证据并列为平台阻断，不得静默改成新标签页、GET 跳转或宣称已在 iframe 内成功。

### 样式与构建

- 支付接入不需要时不修改字体或全局样式。确需修改 CSS 时，保持所有 `@import` 连续位于文件顶部和 `@custom-variant`、普通样式规则之前；保留项目既有 Tailwind 指令顺序。
- 每次样式或框架文件变更后运行项目已有类型检查和构建。出现 `@import rules must precede all rules` 时只修正导入顺序，不借机重写全局样式。

## 项目数据与框架边界

- 订单号、商品和应付金额由服务端按可信商品事实校验并落入持久化订单存储。客户端购物车、localStorage、请求金额和展示价格均不作为收款依据；无效价格不得兜底为 `0` 后继续下单。
- `globalThis`、模块级 `Map` 或内存对象不能作为跨路由、跨构建、跨实例可靠共享的生产订单库。它们最多用于明确标注的单进程非生产 demo；当前生产实现必须使用项目既有持久化数据层。
- CommonJS 编译目标项目不要在模块顶层 `await` 初始化 SDK 或托管凭证加载；应改为函数内惰性初始化或 Promise 记忆化，并保持沙箱读取链路与未来生产链路互不干扰。
- TypeScript 全局声明、Next.js `useSearchParams()` 的 `Suspense`、App Router bundle 行为等只在实际项目使用相应能力且类型检查或构建给出证据时处理，不作为所有 Coze 项目的预置改动。
- 不以框架猜测解释静默失败。先核对支付处理函数是否执行、form 是否存在、action/method 是否通过、节点是否已加入当前文档、是否发出网关 POST，以及预览 iframe/浏览器的实际阻断信息；仅当项目保留应用内确认 modal 时再核对其确认回调。

## 完成前证据

1. 项目既有类型检查、静态检查、构建和定向测试通过；无法运行的项目记录精确原因。
2. 静态确认不存在 `window.confirm/alert/prompt`、`window.open()`、`target="_blank"`、把支付 HTML 赋给 `location`、依赖内嵌脚本、`document.open/write/close` 或全屏白色遮罩。
3. 在 Coze 预览点击支付：应用内 loading 可见，当前 browsing context 发出固定网关 POST，没有浏览器原生对话框或新标签页；项目明确要求应用内确认 modal 时另行验证取消分支不发起支付。
4. 无实际浏览器证据时只能记“Coze 预览付款入口待人工验证”，不得声称预览内收银台已经可用或沙箱付款已完成。
