import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { signImageKeys } from "@/lib/server-utils";
import type { RepairTicket, TicketLog, Engineer } from "@/lib/constants";

// GET /api/tickets/[id] - 工单详情（含流转日志、工程师信息）
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const client = getSupabaseClient();

    const { data: ticket, error } = await client
      .from("repair_tickets")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`查询工单失败: ${error.message}`);
    if (!ticket) return NextResponse.json({ success: false, error: "工单不存在" }, { status: 404 });

    const t = ticket as RepairTicket;

    // 查询流转日志
    const { data: logs, error: logError } = await client
      .from("ticket_logs")
      .select("*")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true });
    if (logError) throw new Error(`查询工单日志失败: ${logError.message}`);

    // 查询派发工程师
    let engineer: Engineer | null = null;
    if (t.assignee_id) {
      const { data: eng, error: engError } = await client
        .from("engineers")
        .select("*")
        .eq("id", t.assignee_id)
        .maybeSingle();
      if (engError) throw new Error(`查询工程师失败: ${engError.message}`);
      engineer = eng as Engineer | null;
    }

    // 图片签名 URL
    const keys = t.images ?? [];
    const urlMap = keys.length > 0 ? await signImageKeys(keys) : {};

    return NextResponse.json({
      success: true,
      data: {
        ...t,
        image_urls: keys.map((k) => urlMap[k]).filter(Boolean),
        logs: (logs ?? []) as TicketLog[],
        engineer,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "查询工单详情失败";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
