// 报修类别
export const CATEGORIES = [
  "水电维修",
  "门窗家具",
  "网络设备",
  "空调电器",
  "其他",
] as const;
export type Category = (typeof CATEGORIES)[number];

// 工单状态
export const TICKET_STATUS = {
  pending: "待处理",
  dispatched: "已派发",
  processing: "处理中",
  closed: "已关闭",
  rejected: "已驳回",
} as const;
export type TicketStatus = keyof typeof TICKET_STATUS;

// 状态颜色（与 DESIGN.md 一致）
export const STATUS_COLORS: Record<TicketStatus, string> = {
  pending: "#F59E0B",
  dispatched: "#3B82F6",
  processing: "#8B5CF6",
  closed: "#10B981",
  rejected: "#EF4444",
};

// 紧急程度
export const URGENCY = {
  normal: "普通",
  urgent: "紧急",
} as const;
export type Urgency = keyof typeof URGENCY;

// 工单流转动作
export const LOG_ACTIONS = {
  created: "创建工单",
  dispatched: "派发工单",
  followed_up: "跟进记录",
  closed: "关闭工单",
  rejected: "驳回工单",
} as const;
export type LogAction = keyof typeof LOG_ACTIONS;

export interface Engineer {
  id: string;
  name: string;
  phone: string;
  specialty: string;
  is_active: boolean;
  created_at: string;
}

export interface RepairTicket {
  id: string;
  ticket_no: string;
  title: string;
  category: string;
  location: string;
  description: string;
  images: string[]; // 存储对象存储 key
  reporter_name: string;
  reporter_phone: string;
  urgency: string;
  status: TicketStatus;
  assignee_id: string | null;
  dispatch_note: string | null;
  reject_reason: string | null;
  close_note: string | null;
  dispatched_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketLog {
  id: string;
  ticket_id: string;
  action: LogAction;
  content: string;
  operator_name: string;
  created_at: string;
}
