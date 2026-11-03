"use client";

import { StatusBadge } from "@/components/status-badge";
import { LOG_ACTIONS, type LogAction, type RepairTicket, type TicketLog, type Engineer } from "@/lib/constants";
import { MapPin, Phone, User, Clock, Wrench } from "lucide-react";

export interface TicketDetail extends RepairTicket {
  image_urls: string[];
  logs: TicketLog[];
  engineer: Engineer | null;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const ACTION_COLORS: Record<LogAction, string> = {
  created: "#3B82F6",
  dispatched: "#8B5CF6",
  followed_up: "#F59E0B",
  closed: "#10B981",
  rejected: "#EF4444",
};

/** 工单详情（只读部分，学生端与管理端共用） */
export function TicketDetailView({ ticket }: { ticket: TicketDetail }) {
  return (
    <div className="space-y-5">
      {/* 基础信息 */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold leading-snug">{ticket.title}</h3>
          <StatusBadge status={ticket.status} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">工单编号：{ticket.ticket_no}</p>
      </div>

      <div className="grid grid-cols-1 gap-2.5 rounded-lg bg-muted/50 p-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Wrench className="h-3.5 w-3.5 shrink-0" />
          <span>{ticket.category}</span>
          {ticket.urgency === "urgent" && (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-600">紧急</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span>{ticket.location}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <User className="h-3.5 w-3.5 shrink-0" />
          <span>{ticket.reporter_name}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Phone className="h-3.5 w-3.5 shrink-0" />
          <span>{ticket.reporter_phone}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>{formatTime(ticket.created_at)}</span>
        </div>
      </div>

      {/* 问题描述 */}
      <div>
        <p className="mb-1.5 text-sm font-medium">问题描述</p>
        <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm leading-relaxed text-muted-foreground">
          {ticket.description}
        </p>
      </div>

      {/* 图片 */}
      {ticket.image_urls.length > 0 && (
        <div>
          <p className="mb-1.5 text-sm font-medium">现场照片</p>
          <div className="grid grid-cols-3 gap-2">
            {ticket.image_urls.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={url}
                alt={`现场照片 ${i + 1}`}
                className="aspect-square w-full cursor-zoom-in rounded-lg border object-cover"
                onClick={() => window.open(url, "_blank")}
              />
            ))}
          </div>
        </div>
      )}

      {/* 派发工程师 */}
      {ticket.engineer && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm">
          <p className="font-medium text-blue-900">
            维修工程师：{ticket.engineer.name}（{ticket.engineer.specialty}）
          </p>
          <p className="mt-0.5 text-blue-700">联系电话：{ticket.engineer.phone}</p>
        </div>
      )}

      {/* 驳回/关闭说明 */}
      {ticket.status === "rejected" && ticket.reject_reason && (
        <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          驳回原因：{ticket.reject_reason}
        </div>
      )}
      {ticket.status === "closed" && ticket.close_note && (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-700">
          关闭说明：{ticket.close_note}
        </div>
      )}

      {/* 流转时间线 */}
      <div>
        <p className="mb-2 text-sm font-medium">处理进度</p>
        <div className="space-y-0">
          {ticket.logs.map((log, idx) => (
            <div key={log.id} className="relative flex gap-3 pb-4 last:pb-0">
              {/* 时间线 */}
              <div className="flex flex-col items-center">
                <span
                  className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: ACTION_COLORS[log.action] ?? "#9CA3AF" }}
                />
                {idx < ticket.logs.length - 1 && <span className="w-px flex-1 bg-border" />}
              </div>
              <div className="flex-1 pb-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {LOG_ACTIONS[log.action] ?? log.action}
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">{log.operator_name}</span>
                  </p>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatTime(log.created_at)}</span>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">{log.content}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
