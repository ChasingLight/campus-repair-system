import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import type { RepairTicket } from "@/lib/constants";

// POST /api/tickets/[id]/follow-up - 添加跟进记录（状态流转为处理中）
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { content } = body as { content?: string };

    if (!content?.trim()) {
      return NextResponse.json({ success: false, error: "请填写跟进内容" }, { status: 400 });
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
      return NextResponse.json({ success: false, error: "工单已关闭或驳回，无法跟进" }, { status: 400 });
    }

    // 已派发状态跟进后自动流转为"处理中"
    if (t.status === "dispatched") {
      const { error: uError } = await client
        .from("repair_tickets")
        .update({ status: "processing", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (uError) throw new Error(`更新工单状态失败: ${uError.message}`);
    } else {
      const { error: uError } = await client
        .from("repair_tickets")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", id);
      if (uError) throw new Error(`更新工单失败: ${uError.message}`);
    }

    const { error: lError } = await client.from("ticket_logs").insert({
      ticket_id: id,
      action: "followed_up",
      content: content.trim(),
      operator_name: "后勤管理员",
    });
    if (lError) throw new Error(`写入跟进记录失败: ${lError.message}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "添加跟进失败";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
