import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import type { RepairTicket } from "@/lib/constants";

// POST /api/tickets/[id]/reject - 驳回工单
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { reason } = body as { reason?: string };

    if (!reason?.trim()) {
      return NextResponse.json({ success: false, error: "请填写驳回原因" }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { data: ticket, error: tError } = await client
      .from("repair_tickets")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();
    if (tError) throw new Error(`查询工单失败: ${tError.message}`);
    if (!ticket) return NextResponse.json({ success: false, error: "工单不存在" }, { status: 404 });
    const t = ticket as Pick<RepairTicket, "id" | "status">;
    if (["closed", "rejected"].includes(t.status)) {
      return NextResponse.json({ success: false, error: "工单已关闭或驳回" }, { status: 400 });
    }

    const { error: uError } = await client
      .from("repair_tickets")
      .update({
        status: "rejected",
        reject_reason: reason.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (uError) throw new Error(`驳回工单失败: ${uError.message}`);

    const { error: lError } = await client.from("ticket_logs").insert({
      ticket_id: id,
      action: "rejected",
      content: `驳回原因：${reason.trim()}`,
      operator_name: "后勤管理员",
    });
    if (lError) throw new Error(`写入工单日志失败: ${lError.message}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "驳回工单失败";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
