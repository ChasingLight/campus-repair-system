import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import type { RepairTicket } from "@/lib/constants";

// POST /api/tickets/[id]/close - 关闭工单（维修完成）
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { note } = body as { note?: string };

    const client = getSupabaseClient();
    const { data: ticket, error: tError } = await client
      .from("repair_tickets")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();
    if (tError) throw new Error(`查询工单失败: ${tError.message}`);
    if (!ticket) return NextResponse.json({ success: false, error: "工单不存在" }, { status: 404 });
    const t = ticket as Pick<RepairTicket, "id" | "status">;
    if (t.status === "closed") {
      return NextResponse.json({ success: false, error: "工单已关闭" }, { status: 400 });
    }
    if (t.status === "rejected") {
      return NextResponse.json({ success: false, error: "工单已驳回，无法关闭" }, { status: 400 });
    }

    const { error: uError } = await client
      .from("repair_tickets")
      .update({
        status: "closed",
        close_note: note?.trim() || null,
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (uError) throw new Error(`关闭工单失败: ${uError.message}`);

    const { error: lError } = await client.from("ticket_logs").insert({
      ticket_id: id,
      action: "closed",
      content: `维修完成，工单关闭${note?.trim() ? `：${note.trim()}` : ""}`,
      operator_name: "后勤管理员",
    });
    if (lError) throw new Error(`写入工单日志失败: ${lError.message}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "关闭工单失败";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
