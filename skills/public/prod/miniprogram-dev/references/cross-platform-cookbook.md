# 跨端疑难 Cookbook（H5 / 小程序）

> **何时读本文**：命中 H5 与小程序的具体跨端兼容问题（Text 白屏、Input/Button 样式失效、Fixed+Flex、TabBar 重叠等），或要实现录音、文件/图片上传、相机等原生能力时。
> 主 skill 的《跨端速查表》给的是"症状 → 对策"索引；本文给可直接套用的代码模板与原生能力适配细节。两者配合：先在速查表定位问题，再来这里取模板。
>
> 不变量（端口、`Network` 封装、平台检测优先直接判断而非 `useState+useEffect`）以主 skill 为准，本文只补实现层。

## 1. 跨端代码模板

对应主 skill《跨端速查表》各条目的可套用实现。

```tsx
// Text 换行：垂直排列的 Text 加 block
<Text className="block text-lg font-semibold">标题</Text>

// Input/Textarea：View 包裹，样式放外层
<View className="bg-gray-50 rounded-xl px-4 py-3">
  <Input className="w-full bg-transparent" placeholder="请输入内容" />
</View>

// Input + Button Flex：flex 放 View，Input 用 width:100%
<View style={{ display: 'flex', flexDirection: 'row', gap: '8px', padding: '12px' }}>
  <View style={{ flex: 1, backgroundColor: '#f5f5f5', borderRadius: '20px', padding: '8px 12px' }}>
    <Input style={{ width: '100%', fontSize: '14px' }} placeholder="输入消息..." />
  </View>
  <View style={{ flexShrink: 0 }}><Button size="mini" type="primary">发送</Button></View>
</View>

// Fixed + Flex：inline style + bottom:50 避开 TabBar
<View style={{ position: 'fixed', bottom: 50, left: 0, right: 0, display: 'flex', flexDirection: 'row', gap: '12px', padding: '12px', backgroundColor: '#fff', borderTop: '1px solid #e5e5e5', zIndex: 100 }}>
  <View style={{ flex: 1 }}><Button>取消</Button></View>
  <View style={{ flex: 1 }}><Button>确认</Button></View>
</View>

// 原生组件平台检测 + H5 降级
{[Taro.ENV_TYPE.WEAPP, Taro.ENV_TYPE.TT].includes(Taro.getEnv()) ? (
  <Camera className="w-full h-96" devicePosition="back" />
) : (
  <View className="flex items-center justify-center h-96 bg-gray-100 rounded-lg">
    <Text className="block text-gray-500 text-center">相机功能仅在小程序中可用{'\n'}请在小程序中打开体验</Text>
  </View>
)}
```

## 2. 原生能力跨端适配

### 2.1 录音（RecorderManager）
- 必须用 `Taro.getEnv()` 检测平台（`WEAPP` 微信，`TT` 抖音），判断是否在小程序环境。
- 必须在 `useEffect` 中初始化 `RecorderManager`，不得在组件顶层直接调用。
- 必须为 H5 端提供降级提示，不得直接调用录音 API。
- 必须在按钮点击等交互前再次检测平台（防御性编程）。

### 2.2 文件 / 图片上传
- 涉及"文件上传""图片上传""uploadFile"时，按平台集成能力规范实现存储与跨端上传（对象存储能力 + 跨端上传规范，见主 skill《集成服务》），不要只接一半导致跨端兼容问题。
- 前端用 `Network.uploadFile(tempFilePath)`，不要手动 readFile。
- 不要手动设置 `Content-Type`（会导致 400 Boundary not found），让 Taro 自动处理。
- 后端 Multer 同时支持 `file.path`（小程序）和 `file.buffer`（H5）。
- H5 上传图片偶发裂开：平台 SW 可能拦截 blob fetch → H5 端取原始 File 对象手动构建 FormData 上传，绕过 Taro uploadFile。
