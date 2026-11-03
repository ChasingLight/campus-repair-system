import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { genTicketNo, signImageKeys } from "@/lib/server-utils";
import { CATEGORIES, type RepairTicket } from "@/lib/constants";

// GET /api/tickets - 工单列表（支持 status / category / phone / keyword / 分页）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const category = searchParams.get("category");
    const phone = searchParams.get("phone");
    const keyword = searchParams.get("keyword");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10)));

    const client = getSupabaseClient();
    let query = client
      .from("repair_tickets")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (status) query = query.eq("status", status);
    if (category) query = query.eq("category", category);
    if (phone) query = query.eq("reporter_phone", phone);
    if (keyword) {
      query = query.or(`title.ilike.%${keyword}%,location.ilike.%${keyword}%,ticket_no.ilike.%${keyword}%`);
    }

    const { data, error, count } = await query;
    if (error) throw new Error(`查询工单失败: ${error.message}`);

    const tickets = (data ?? []) as RepairTicket[];
    // 为本页工单图片生成签名 URL
    const allKeys = tickets.flatMap((t) => t.images ?? []);
    const urlMap = allKeys.length > 0 ? await signImageKeys(allKeys) : {};
    const list = tickets.map((t) => ({
      ...t,
      image_urls: (t.images ?? []).map((k) => urlMap[k]).filter(Boolean),
    }));

    return NextResponse.json({ success: true, data: list, total: count ?? 0, page, pageSize });
  } catch (err) {
    const message = err instanceof Error ? err.message : "查询工单失败";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/tickets - 学生提交报修
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, category, location, description, images, reporter_name, reporter_phone, urgency } = body as {
      title?: string;
      category?: string;
      location?: string;
      description?: string;
      images?: string[];
      reporter_name?: string;
      reporter_phone?: string;
      urgency?: string;
    };

    // 参数校验
    if (!title?.trim()) return NextResponse.json({ success: false, error: "请填写报修标题" }, { status: 400 });
    if (!category || !CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
      return NextResponse.json({ success: false, error: "请选择有效的报修类型" }, { status: 400 });
    }
    if (!location?.trim()) return NextResponse.json({ success: false, error: "请填写报修位置" }, { status: 400 });
    if (!description?.trim()) return NextResponse.json({ success: false, error: "请填写问题描述" }, { status: 400 });
    if (!reporter_name?.trim()) return NextResponse.json({ success: false, error: "请填写联系人姓名" }, { status: 400 });
    if (!reporter_phone?.trim() || !/^1\d{10}$/.test(reporter_phone.trim())) {
      return NextResponse.json({ success: false, error: "请填写正确的手机号" }, { status: 400 });
    }
    const imageKeys = Array.isArray(images) ? images.slice(0, 6) : [];
    const urgencyVal = urgency === "urgent" ? "urgent" : "normal";

    const client = getSupabaseClient();
    const ticketNo = genTicketNo();
    const { data, error } = await client
      .from("repair_tickets")
      .insert({
        ticket_no: ticketNo,
        title: title.trim(),
        category,
        location: location.trim(),
        description: description.trim(),
        images: imageKeys,
        reporter_name: reporter_name.trim(),
        reporter_phone: reporter_phone.trim(),
        urgency: urgencyVal,
        status: "pending",
      })
      .select()
      .single();
    if (error) throw new Error(`创建工单失败: ${error.message}`);

    // 写入创建日志
    const { error: logError } = await client.from("ticket_logs").insert({
      ticket_id: data.id,
      action: "created",
      content: `提交了报修：${title.trim()}`,
      operator_name: reporter_name.trim(),
    });
    if (logError) throw new Error(`写入工单日志失败: ${logError.message}`);

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "提交报修失败";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
