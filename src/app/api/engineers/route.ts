import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// GET /api/engineers - 工程师列表
export async function GET() {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("engineers")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`查询工程师失败: ${error.message}`);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "查询工程师失败";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/engineers - 新增工程师
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, phone, specialty } = body as {
      name?: string;
      phone?: string;
      specialty?: string;
    };

    if (!name?.trim()) return NextResponse.json({ success: false, error: "请填写工程师姓名" }, { status: 400 });
    if (!phone?.trim() || !/^1\d{10}$/.test(phone.trim())) {
      return NextResponse.json({ success: false, error: "请填写正确的手机号" }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { data, error } = await client
      .from("engineers")
      .insert({
        name: name.trim(),
        phone: phone.trim(),
        specialty: specialty?.trim() || "综合维修",
      })
      .select()
      .single();
    if (error) throw new Error(`新增工程师失败: ${error.message}`);

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "新增工程师失败";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
