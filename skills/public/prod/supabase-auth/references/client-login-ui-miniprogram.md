# 小程序端生成登录模块UI规范

根据 Supabase Auth 配置生成或修改小程序端用户登录模块。集成登录能力后，必须执行相关检查清单！

***

## 强制工作流程

1. 执行 `npx coze-coding-ai supabase auth get-config-v2` 获取当前配置
2. 根据配置决定开启的登录方式：
   - `email_config.external_email_enabled = true` → 包含邮箱密码登录
   - `phone_config.external_phone_enabled = true` → 包含手机号验证码登录
   - `icon_url` → 应用图标
   - `name` → 应用名称
3. 检查项目是否已有登录页面，**有则做增量修改，无则新建，做增量修改时按照原来的UI风格**
   1. 若登录页没有显示应用图标，则在最上方水平居中显示 icon\_url 的图标（必须用得到的 icon\_url 这个值作为静态资源显示在登录页）
   2. 若登录页没有显示应用名称，则在 icon\_url 下水平居中显示应用名称
4. 优先展示手机号登录方式选择 tab（如果都有的话），手机号、邮箱
5. 选了手机号登录，就没有单独的注册入口
6. 选了邮箱登录，必须独立的注册入口

***

## 小程序环境适配要点

### Supabase SDK 在小程序中的使用

小程序环境没有浏览器的 `window`、`localStorage`、`XMLHttpRequest` 等 API，需要适配：

- **网络请求适配**：Supabase JS SDK 默认使用 `fetch`，小程序需要用 `wx.request`（微信）/ `tt.request`（抖音）/ `my.request`（支付宝）进行封装适配
- **存储适配**：用 `wx.setStorageSync` / `wx.getStorageSync` 替代 `localStorage`，需要自定义 storage 传入 `createClient`
- **URL 处理适配**：如果 SDK 内部依赖 `URL` 对象，需要 polyfill

```typescript
import { createClient } from '@supabase/supabase-js';

// 自定义 storage 适配小程序
const customStorage = {
  getItem: (key: string) => {
    try {
      return wx.getStorageSync(key) || null;
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      wx.setStorageSync(key, value);
    } catch {}
  },
  removeItem: (key: string) => {
    try {
      wx.removeStorageSync(key);
    } catch {}
  },
};

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: customStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // 小程序没有 URL 变化
  },
});
```

> ⚠️ **重要**：小程序中 supabase url 和 anonKey 的获取方式与 Web/App 端一致，必须通过后端接口获取，不要硬编码在前端代码中。

### 网络域名配置

- 小程序需要在管理后台配置合法请求域名，将 Supabase 项目的 URL 添加到 `request` 合法域名中
- 应用图标的域名也需要添加到 `downloadFile` 和 `image` 合法域名中
- 开发调试阶段可以在小程序开发工具中勾选「不校验合法域名」

***

## 登录页面生成规范

### 整体布局规范

- 全屏展示登录页面，使用小程序页面容器，内容区域垂直居中，左右留出适当边距（建议左右各 32rpx）
- 从上到下依次是应用图标、应用名称、登录方式选择区域
- 展示应用图标（`config.icon_url`）和应用名称（`config.name`），应用图标展示在整体 UI 的上面水平居中，应用名称在图标下面水平居中
- 应用图标建议尺寸 144rpx × 144rpx，圆角显示（border-radius: 32rpx）
- 图标和应用名称：若已有登录页但缺少此信息，补充上去，始终与 Auth 配置保持一致
- 如果有多种登录方式，手机号登录方式的 tab 需要在邮箱登录方式 tab 之前，优先显示手机号登录方式 tab
- 输入框高度建议不低于 88rpx，保证小程序端易于点击
- 按钮宽度建议撑满内容区域（左右边距内全宽），高度不低于 88rpx
- 所有可点击元素间距建议不低于 24rpx，防止误触
- 使用 rpx 作为尺寸单位以适配不同屏幕

### 手机号验证码登录规范

> ⚠️ **区号限制**：只能使用 `+86`（火山短信服务仅支持中国大陆）

- 如果选择了手机号验证码登录，首先能看到的是手机号输入框，**必须显示区号 `+86`**，区号不可修改（写死 `+86`），区号展示在手机号输入框左侧
- 发送验证码时手机号拼接区号：`+86${phone}`
- 手机号输入框类型设置为数字键盘（`type="number"`）
- 在手机号输入框下方，展示发送验证码按钮，发送验证码成功后跳转到验证码输入页面，该页面展示验证码输入框和重新发送验证码按钮（注意：不需要再展示邮箱登录和手机号登录的 tab），其中重新发送验证码按钮先展示倒计时，60 秒后文字变为"重新发送"，再次重新发送验证码后重新倒计时 60 秒
- 首次跳转到验证码页面时，输入焦点自动聚焦到验证码输入框上（`focus="{{true}}"`），一旦用户输入 >= 6 位验证码，就自动提交验证码尝试登录
  - 或者用 6 个输入框分别输入验证码，当前一个输入框输入完成后自动聚焦到下一个输入框，如果用户粘贴验证码，需要自动将每个数字分别填入对应输入框，6 位填满自动尝试登录
  - 验证码校验失败错误处理【重要】：如果验证码校验失败，需要根据具体错误信息提示用户，比如"验证码错误或已过期，请重试或重新获取"，同时清除已输入的验证码，并重新聚焦到第一个输入框
- 验证码输入框类型设置为数字键盘（`type="number"`）
- **登录注册不区分**（同一个界面，验证码正确即登录或自动注册）
- 前端调用：
  ```typescript
  // 发送验证码（手机号必须带区号）
  await supabase.auth.signInWithOtp({ phone: '+86' + phoneNumber })

  // 验证验证码
  await supabase.auth.verifyOtp({
    phone: '+86' + phoneNumber,
    token: otpCode,
    type: 'sms'
  })
  ```

### 邮箱密码登录规范

- **注册和登录必须分开**（两个独立页面）
- 注册页：邮箱 + 密码 + 确认密码
  - 注册入口在邮箱的登录页面的登录按钮下方再加一个字符串（如"还没有账号？去注册"）形式的跳转，注册页面中在注册按钮下方再加一个字符串（如"已有账号？去登录"）形式的跳转
  - 如果 Auth 配置 mailer_auto_confirm: true，邮箱注册是自动确认的，不需要验证邮件。注册成功后应该直接登录跳转到首页
- 登录页：邮箱 + 密码
- 密码输入框使用 `password="{{true}}"` 属性，并提供显示/隐藏密码的切换按钮（眼睛图标）
- 登录失败的错误处理【重要】：如果登录失败，需要根据具体错误信息提示用户，比如"邮箱或密码错误"等
- 前端调用：
  - 注册：`supabase.auth.signUp({ email, password })`
  - 登录：`supabase.auth.signInWithPassword({ email, password })`

### 对已有登录页的增量修改规范

- **邮箱、手机号登录方式只检查开关**：`external_email_enabled` / `external_phone_enabled`，不改变已有 UI 风格
- **图标和应用名称**：若已有登录页缺少，补充上去；若已有但不同，更新为 Auth 配置中的最新值
- **尽量保持已有 UI 的视觉风格**，做最小化改动

***

## 小程序适配要点

- **键盘遮挡处理**：输入框获得焦点时，小程序会自动上推页面，但需要确保验证码输入框和发送按钮不被遮挡。可使用 `adjust-position="{{true}}"` 或将输入区域放在 `scroll-view` 中手动控制滚动
- **发送验证码**：发送验证码成功后，不需要弹出发送成功的提示，直接进入倒计时
- **安全区域**：登录页面底部内容需要避开小程序底部安全区域，使用 `padding-bottom: env(safe-area-inset-bottom)` 适配
- **加载状态**：登录/注册/发送验证码等操作需要显示加载状态（如按钮内显示 loading），防止用户重复点击。可使用小程序按钮的 `loading` 属性
- **错误提示**：使用 `wx.showToast` / `tt.showToast` 显示错误提示，`icon: 'none'` 模式展示文字信息，避免使用 `wx.showModal` 弹窗
- **页面导航**：小程序使用 `wx.navigateTo` / `wx.redirectTo` / `wx.reLaunch` 进行页面跳转，登出后建议使用 `wx.reLaunch` 跳转到登录页以清除页面栈
- **倒计时实现**：使用 `setInterval` 或小程序框架的响应式数据实现倒计时，注意页面 `onHide` 时清除定时器，`onShow` 时恢复，避免后台定时器堆积

***

## 登录后能力

### 用户信息页

用户登录后，应提供用户信息的查看与编辑功能：

- **展示信息**：用户名（`user_metadata.full_name`）、Email（`user.email`）、手机号（`user.phone`）
- **修改 Email**：需要 SMTP 已配置，改邮箱会发送确认邮件（这个功能先不主动对用户透出）
  ```typescript
  await supabase.auth.updateUser({ email: 'new@example.com' })
  ```
- **修改密码**：（这个功能先不主动对用户透出）
  ```typescript
  await supabase.auth.updateUser({ password: 'new_password' })
  ```
- **修改用户名等元数据**：（这个功能先不主动对用户透出）
  ```typescript
  await supabase.auth.updateUser({ data: { full_name: 'New Name' } })
  ```

### 登出能力

- 登录后的小程序页面**必须提供登出入口**（如个人中心页、设置页等）
- 登出时需要弹窗二次确认（使用 `wx.showModal`）才能执行登出操作，登出后使用 `wx.reLaunch` 跳转到登录页，清除所有登录状态（包括小程序本地存储中的 session 信息），登出成功不需要 toast 提示
- 前端调用：
  ```typescript
  await supabase.auth.signOut()
  // 登出后跳转到登录页并清除页面栈
  wx.reLaunch({ url: '/pages/login/login' })
  ```

***

## 检查清单（每次生成完登录模块时，进行检查）

- 根据以上代码示例生成的代码，必须进行自检确保代码能正常运行
- 检查 Supabase SDK 的小程序适配是否正确（storage、fetch、URL polyfill 等）
- 检查小程序管理后台是否需要配置合法请求域名（Supabase URL + 图标域名）
- 检查登出后是否成功清除所有登录状态（包括小程序本地存储）并跳转到登录页
- 检查应用图标是否正确显示
- 检查输入框的键盘类型是否正确（手机号-数字键盘、验证码-数字键盘）
- 集成了登录模块能力后，检查一下现有的接口是否需要身份认证，如果需要的话根据 verify-session.md 接入身份认证能力
- 检查登录成功后是否正确跳转到首页，而不是停留在登录页
  - 小程序中常见问题：登录成功后 session 状态更新是异步的，在 verifyOtp、signInWithPassword 成功后，需要立即手动更新本地 session 状态，再执行页面跳转，避免路由守卫因读取到旧状态而重定向回登录页
- 检查退出登录后是否跳转到登录页，并且清除了客户端身份信息
- 登出成功不需要 toast 提示
- 如果有手机号验证码登录，检查验证码输入的 6 个框对粘贴操作是否会自动填充
- 检查倒计时功能是否会导致页面不必要的重渲染，影响输入框状态
- 检查页面 `onHide`/`onShow` 生命周期中定时器的清除和恢复
