# 校园报修系统

## 项目概览
校园后勤报修平台，三端一体：
- **学生移动端** `/`：提交报修（类型/位置/描述/照片/紧急标记）+ 手机号查询我的报修
- **管理后台** `/admin`：工单筛选、派发工程师、跟进、关闭、驳回、工程师管理
- **数据大屏** `/screen`：工单总览、状态/类型分布、7 天趋势、工程师解决排行（30s 轮询）

## 技术栈
- Next.js 16 (App Router) + React 19 + TypeScript 5
- shadcn/ui + Tailwind CSS 4
- Supabase（Postgres）：表结构用 Drizzle 定义于 `src/storage/database/shared/schema.ts`，数据操作用 `@/storage/database/supabase-client` 的 `getSupabaseClient()`
- 对象存储：`coze-coding-dev-sdk` 的 `S3Storage`，报修照片存 key 到 `repair_tickets.images`（jsonb），读取时用 `signImageKeys`（`src/lib/server-utils.ts`）生成签名 URL
- 图表：recharts

## 数据模型
- `repair_tickets`：工单（ticket_no 编号、status: pending/dispatched/processing/closed/rejected、category、assignee_id 等）
- `engineers`：维修工程师
- `ticket_logs`：流转记录（created/dispatched/followed_up/closed/rejected）
- RLS 已启用（场景 A），后端 service_role_key 绕过，无需 policy
- 表结构变更流程：改 schema.ts → `coze-coding-ai db upgrade`

## API 一览（`src/app/api/`）
| 路由 | 方法 | 说明 |
|---|---|---|
| `/api/tickets` | GET/POST | 工单列表（status/category/phone/keyword/分页）、创建工单 |
| `/api/tickets/[id]` | GET | 详情（含 logs、engineer、image_urls） |
| `/api/tickets/[id]/dispatch` | POST | 派发 `{engineer_id, note?}` |
| `/api/tickets/[id]/follow-up` | POST | 跟进 `{content}`，dispatched→processing |
| `/api/tickets/[id]/close` | POST | 关闭 `{note?}` |
| `/api/tickets/[id]/reject` | POST | 驳回 `{reason}` |
| `/api/engineers` | GET/POST | 工程师列表、新增 `{name, phone, specialty?}` |
| `/api/stats` | GET | 大屏统计数据 |
| `/api/upload` | POST | 图片上传（FormData file，≤5MB），返回 `{key}` |

## 关键约定
- 共享常量/类型集中在 `src/lib/constants.ts`（CATEGORIES、TICKET_STATUS、STATUS_COLORS 等），前后端共用
- 所有 API 返回 `{success, data?, error?}`；Supabase 每次调用必须检查 error 并 throw
- 状态流转约束：closed/rejected 为终态，不可再操作（后端强制校验）
- 共享只读详情组件：`src/components/ticket-detail.tsx`（学生端弹窗 + 管理端抽屉复用）
- 视觉规范见 `DESIGN.md`（状态色、大屏深色 #0B1530 等）

## 常用命令
- `pnpm dev` / `pnpm ts-check` / `pnpm lint`
- 端口读取 `process.env.DEPLOY_RUN_PORT`（主仓 5000）
