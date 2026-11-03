import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import type { RepairTicket, Engineer } from "@/lib/constants";

// POST /api/tickets/[id]/dispatch - 派发工单给工程师
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { engineer_id, note } = body as { engineer_id?: string; note?: string };

    if (!engineer_id) {
      return NextResponse.json({ success: false, error: "请选择维修工程师" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 校验工单存在且状态允许派发
    const { data: ticket, error: tError } = await client
      .from("repair_tickets")
      .select("id, status, title")
      .eq("id", id)
      .maybeSingle();
    if (tError) throw new Error(`查询工单失败: ${tError.message}`);
    if (!ticket) return NextResponse.json({ success: false, error: "工单不存在" }, { status: 404 });
    const t = ticket as Pick<RepairTicket, "id" | "status" | "title">;
    if (["closed", "rejected"].includes(t.status)) {
      return NextResponse.json({ success: false, error: "工单已关闭或驳回，无法派发" }, { status: 400 });
    }

    // 校验工程师
    const { data: engineer, error: eError } = await client
      .from("engineers")
      .select("id, name")
      .eq("id", engineer_id)
      .eq("is_active", true)
      .maybeSingle();
    if (eError) throw new Error(`查询工程师失败: ${eError.message}`);
    if (!engineer) return NextResponse.json({ success: false, error: "工程师不存在或已停用" }, { status: 400 });
    const eng = engineer as Pick<Engineer, "id" | "name">;

    const { error: uError } = await client
      .from("repair_tickets")
      .update({
        status: "dispatched",
        assignee_id: engineer_id,
        dispatch_note: note?.trim() || null,
        dispatched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (uError) throw new Error(`派发工单失败: ${uError.message}`);

    const { error: lError } = await client.from("ticket_logs").insert({
      ticket_id: id,
      action: "dispatched",
      content: `派发给工程师「${eng.name}」${note?.trim() ? `，备注：${note.trim()}` : ""}`,
      operator_name: "后勤管理员",
    });
    if (lError) throw new Error(`写入工单日志失败: ${lError.message}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "派发工单失败";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
