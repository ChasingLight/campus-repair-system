"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { STATUS_COLORS, type TicketStatus } from "@/lib/constants";
import { ArrowLeft, Loader2 } from "lucide-react";

interface StatsData {
  overview: {
    total: number;
    todayNew: number;
    pendingCount: number;
    processingCount: number;
    closedCount: number;
    urgentPending: number;
    avgResolveHours: number;
    closeRate: number;
  };
  statusDistribution: { status: TicketStatus; name: string; value: number }[];
  categoryDistribution: { category: string; value: number }[];
  trend: { date: string; created: number; closed: number }[];
  engineerStats: {
    id: string;
    name: string;
    specialty: string;
    assigned: number;
    solved: number;
    processing: number;
  }[];
}

const CATEGORY_COLORS = ["#3B82F6", "#22D3EE", "#8B5CF6", "#F59E0B", "#10B981"];

export function ScreenClient() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/stats");
      const json = await res.json();
      if (json.success) setStats(json.data as StatsData);
    } catch {
      // 静默重试下一轮
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    setNow(new Date());
    const timer = setInterval(load, 30000);
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearInterval(timer);
      clearInterval(clock);
    };
  }, [load]);

  const cardClass =
    "rounded-xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm shadow-[0_0_24px_rgba(34,211,238,0.06)]";

  if (loading && !stats) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B1530]">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  const o = stats?.overview;
  const engineers = [...(stats?.engineerStats ?? [])].sort((a, b) => b.solved - a.solved);

  return (
    <div className="min-h-screen bg-[#0B1530] px-6 py-5 text-white">
      {/* 标题栏 */}
      <header className="relative mb-5 flex items-center justify-center">
        <Link
          href="/admin"
          className="absolute left-0 flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/70 transition-colors hover:bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" />
          管理后台
        </Link>
        <div className="text-center">
          <h1 className="bg-gradient-to-r from-cyan-300 via-blue-400 to-cyan-300 bg-clip-text text-2xl font-bold tracking-widest text-transparent">
            校园后勤报修数据大屏
          </h1>
          <p className="mt-1 text-xs tracking-wider text-white/40" suppressHydrationWarning>
            {now
              ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`
              : ""}
            （每 30 秒自动刷新）
          </p>
        </div>
      </header>

      {/* 核心指标 */}
      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {[
          { label: "累计工单", value: o?.total ?? 0, color: "#3B82F6" },
          { label: "今日新增", value: o?.todayNew ?? 0, color: "#22D3EE" },
          { label: "待处理", value: o?.pendingCount ?? 0, color: "#F59E0B" },
          { label: "处理中", value: o?.processingCount ?? 0, color: "#8B5CF6" },
          { label: "已关闭", value: o?.closedCount ?? 0, color: "#10B981" },
          { label: "紧急待办", value: o?.urgentPending ?? 0, color: "#EF4444" },
        ].map((item) => (
          <div key={item.label} className={cardClass}>
            <p className="text-sm text-white/50">{item.label}</p>
            <p
              className="mt-1.5 text-3xl font-bold tabular-nums"
              style={{ color: item.color, textShadow: `0 0 18px ${item.color}55` }}
            >
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {/* 图表区 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 近7天趋势 */}
        <div className={cardClass}>
          <p className="mb-3 text-sm font-medium text-white/70">近 7 天工单趋势</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats?.trend ?? []}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" stroke="rgba(255,255,255,0.35)" fontSize={11} tickLine={false} />
                <YAxis stroke="rgba(255,255,255,0.35)" fontSize={11} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0F1D42",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 8,
                    color: "#fff",
                  }}
                />
                <Line type="monotone" dataKey="created" name="新增" stroke="#22D3EE" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="closed" name="完成" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex justify-center gap-5 text-xs text-white/60">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-cyan-400" />
              新增工单
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              完成工单
            </span>
          </div>
        </div>

        {/* 类型分布 */}
        <div className={cardClass}>
          <p className="mb-3 text-sm font-medium text-white/70">报修类型分布</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats?.categoryDistribution ?? []}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="category" stroke="rgba(255,255,255,0.35)" fontSize={11} tickLine={false} />
                <YAxis stroke="rgba(255,255,255,0.35)" fontSize={11} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0F1D42",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 8,
                    color: "#fff",
                  }}
                />
                <Bar dataKey="value" name="工单数" radius={[4, 4, 0, 0]}>
                  {(stats?.categoryDistribution ?? []).map((_, i) => (
                    <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 状态分布 */}
        <div className={cardClass}>
          <p className="mb-3 text-sm font-medium text-white/70">工单状态分布</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats?.statusDistribution ?? []}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="52%"
                  outerRadius="80%"
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {(stats?.statusDistribution ?? []).map((s) => (
                    <Cell key={s.status} fill={STATUS_COLORS[s.status] ?? "#6B7280"} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0F1D42",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 8,
                    color: "#fff",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs text-white/60">
            {(stats?.statusDistribution ?? []).map((s) => (
              <span key={s.status} className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS[s.status] ?? "#6B7280" }}
                />
                {s.name} {s.value}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 底部：效率指标 + 工程师排行 */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className={cardClass}>
          <p className="mb-3 text-sm font-medium text-white/70">服务效率</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-white/[0.04] p-4 text-center">
              <p className="text-3xl font-bold tabular-nums text-cyan-300">{o?.closeRate ?? 0}%</p>
              <p className="mt-1 text-xs text-white/50">工单完结率</p>
            </div>
            <div className="rounded-lg bg-white/[0.04] p-4 text-center">
              <p className="text-3xl font-bold tabular-nums text-blue-400">{o?.avgResolveHours ?? 0}</p>
              <p className="mt-1 text-xs text-white/50">平均解决时长（小时）</p>
            </div>
          </div>
        </div>

        {/* 工程师排行榜 */}
        <div className={`${cardClass} lg:col-span-2`}>
          <p className="mb-3 text-sm font-medium text-white/70">工程师解决排行</p>
          <div className="space-y-2.5">
            {engineers.length === 0 && <p className="py-6 text-center text-sm text-white/40">暂无工程师数据</p>}
            {engineers.map((e, i) => {
              const maxSolved = Math.max(1, ...engineers.map((x) => x.solved));
              return (
                <div key={e.id} className="flex items-center gap-3">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-bold ${
                      i === 0
                        ? "bg-amber-400/20 text-amber-300"
                        : i === 1
                          ? "bg-slate-300/20 text-slate-300"
                          : i === 2
                            ? "bg-orange-400/20 text-orange-300"
                            : "bg-white/10 text-white/50"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="w-16 shrink-0 truncate text-sm">{e.name}</span>
                  <span className="hidden w-20 shrink-0 truncate text-xs text-white/40 sm:block">{e.specialty}</span>
                  <div className="h-4 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-700"
                      style={{ width: `${Math.max(4, (e.solved / maxSolved) * 100)}%` }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right text-xs tabular-nums text-white/60">
                    解决 <span className="text-sm font-bold text-cyan-300">{e.solved}</span>
                    <span className="text-white/35"> / 派单 {e.assigned}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
