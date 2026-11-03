import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { CATEGORIES, TICKET_STATUS, type TicketStatus, type RepairTicket, type Engineer } from "@/lib/constants";

// GET /api/stats - 数据大屏统计
export async function GET() {
  try {
    const client = getSupabaseClient();

    // 拉取全部工单的关键字段（校园场景量级可控）
    const { data: tickets, error } = await client
      .from("repair_tickets")
      .select("id, status, category, urgency, assignee_id, created_at, closed_at");
    if (error) throw new Error(`查询工单统计失败: ${error.message}`);
    const list = (tickets ?? []) as Pick<
      RepairTicket,
      "id" | "status" | "category" | "urgency" | "assignee_id" | "created_at" | "closed_at"
    >[];

    // 工程师列表
    const { data: engineers, error: eError } = await client
      .from("engineers")
      .select("id, name, specialty, is_active");
    if (eError) throw new Error(`查询工程师失败: ${eError.message}`);
    const engineerList = (engineers ?? []) as Pick<Engineer, "id" | "name" | "specialty" | "is_active">[];

    // 总览
    const total = list.length;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayNew = list.filter((t) => t.created_at >= todayStart).length;
    const pendingCount = list.filter((t) => t.status === "pending").length;
    const processingCount = list.filter((t) => t.status === "dispatched" || t.status === "processing").length;
    const closedCount = list.filter((t) => t.status === "closed").length;
    const urgentPending = list.filter((t) => t.urgency === "urgent" && !["closed", "rejected"].includes(t.status)).length;

    // 平均解决时长（小时）
    const closedTickets = list.filter((t) => t.status === "closed" && t.closed_at);
    const avgResolveHours =
      closedTickets.length > 0
        ? closedTickets.reduce((sum, t) => {
            const diff = new Date(t.closed_at!).getTime() - new Date(t.created_at).getTime();
            return sum + diff / 3600000;
          }, 0) / closedTickets.length
        : 0;

    // 状态分布
    const statusDistribution = (Object.keys(TICKET_STATUS) as TicketStatus[]).map((s) => ({
      status: s,
      name: TICKET_STATUS[s],
      value: list.filter((t) => t.status === s).length,
    }));

    // 类型分布
    const categoryDistribution = CATEGORIES.map((c) => ({
      category: c,
      value: list.filter((t) => t.category === c).length,
    }));

    // 近7天趋势（新增 vs 完成）
    const trend: { date: string; created: number; closed: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dayStr = `${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      const start = day.getTime();
      const end = start + 86400000;
      trend.push({
        date: dayStr,
        created: list.filter((t) => {
          const ts = new Date(t.created_at).getTime();
          return ts >= start && ts < end;
        }).length,
        closed: list.filter((t) => {
          if (!t.closed_at) return false;
          const ts = new Date(t.closed_at).getTime();
          return ts >= start && ts < end;
        }).length,
      });
    }

    // 工程师解决排行
    const engineerStats = engineerList.map((e) => {
      const assigned = list.filter((t) => t.assignee_id === e.id);
      const solved = assigned.filter((t) => t.status === "closed");
      return {
        id: e.id,
        name: e.name,
        specialty: e.specialty,
        assigned: assigned.length,
        solved: solved.length,
        processing: assigned.filter((t) => ["dispatched", "processing"].includes(t.status)).length,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        overview: {
          total,
          todayNew,
          pendingCount,
          processingCount,
          closedCount,
          urgentPending,
          avgResolveHours: Math.round(avgResolveHours * 10) / 10,
          closeRate: total > 0 ? Math.round((closedCount / total) * 1000) / 10 : 0,
        },
        statusDistribution,
        categoryDistribution,
        trend,
        engineerStats,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "查询统计数据失败";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
