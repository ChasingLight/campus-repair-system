"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/status-badge";
import { TicketDetailView, type TicketDetail } from "@/components/ticket-detail";
import {
  CATEGORIES,
  TICKET_STATUS,
  type Engineer,
  type RepairTicket,
  type TicketStatus,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  LayoutDashboard,
  Loader2,
  MessageSquarePlus,
  RefreshCw,
  Search,
  Send,
  UserPlus,
  Wrench,
  XCircle,
} from "lucide-react";

interface TicketListItem extends RepairTicket {
  image_urls: string[];
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type ActionType = "dispatch" | "follow" | "close" | "reject" | null;

export function AdminClient() {
  // 列表状态
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // 工程师
  const [engineers, setEngineers] = useState<Engineer[]>([]);

  // 详情抽屉
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  // 操作弹窗
  const [action, setAction] = useState<ActionType>(null);
  const [actionText, setActionText] = useState("");
  const [dispatchEngineer, setDispatchEngineer] = useState("");
  const [actionSubmitting, setActionSubmitting] = useState(false);

  // 新增工程师
  const [engDialogOpen, setEngDialogOpen] = useState(false);
  const [engForm, setEngForm] = useState({ name: "", phone: "", specialty: "" });
  const [engSubmitting, setEngSubmitting] = useState(false);

  const loadEngineers = useCallback(async () => {
    try {
      const res = await fetch("/api/engineers");
      const json = await res.json();
      if (json.success) setEngineers(json.data as Engineer[]);
    } catch {
      // 静默，工程师列表为空时提示
    }
  }, []);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (keyword.trim()) params.set("keyword", keyword.trim());
      const res = await fetch(`/api/tickets?${params.toString()}`);
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error || "查询工单失败");
        return;
      }
      setTickets(json.data as TicketListItem[]);
      setTotal(json.total as number);
    } catch {
      toast.error("网络异常");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, categoryFilter, keyword]);

  useEffect(() => {
    loadEngineers();
  }, [loadEngineers]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const openDetail = async (id: string) => {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/tickets/${id}`);
      const json = await res.json();
      if (json.success) setDetail(json.data as TicketDetail);
      else toast.error(json.error || "查询详情失败");
    } catch {
      toast.error("网络异常");
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshDetail = async () => {
    if (!detail) return;
    await openDetail(detail.id);
    await loadTickets();
  };

  const submitAction = async () => {
    if (!detail || !action) return;
    let url = "";
    let body: Record<string, string> = {};
    if (action === "dispatch") {
      if (!dispatchEngineer) return toast.error("请选择维修工程师");
      url = `/api/tickets/${detail.id}/dispatch`;
      body = { engineer_id: dispatchEngineer, note: actionText };
    } else if (action === "follow") {
      if (!actionText.trim()) return toast.error("请填写跟进内容");
      url = `/api/tickets/${detail.id}/follow-up`;
      body = { content: actionText };
    } else if (action === "close") {
      url = `/api/tickets/${detail.id}/close`;
      body = { note: actionText };
    } else if (action === "reject") {
      if (!actionText.trim()) return toast.error("请填写驳回原因");
      url = `/api/tickets/${detail.id}/reject`;
      body = { reason: actionText };
    }

    setActionSubmitting(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error || "操作失败");
        return;
      }
      toast.success("操作成功");
      setAction(null);
      setActionText("");
      setDispatchEngineer("");
      await refreshDetail();
    } catch {
      toast.error("网络异常");
    } finally {
      setActionSubmitting(false);
    }
  };

  const addEngineer = async () => {
    if (!engForm.name.trim()) return toast.error("请填写工程师姓名");
    if (!/^1\d{10}$/.test(engForm.phone.trim())) return toast.error("请填写正确的手机号");
    setEngSubmitting(true);
    try {
      const res = await fetch("/api/engineers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(engForm),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error || "添加失败");
        return;
      }
      toast.success("工程师添加成功");
      setEngDialogOpen(false);
      setEngForm({ name: "", phone: "", specialty: "" });
      await loadEngineers();
    } catch {
      toast.error("网络异常");
    } finally {
      setEngSubmitting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canOperate = detail && !["closed", "rejected"].includes(detail.status);

  const actionTitle =
    action === "dispatch" ? "派发工单" : action === "follow" ? "添加跟进" : action === "close" ? "关闭工单" : "驳回工单";

  return (
    <div className="min-h-screen bg-[#F5F6F8]">
      {/* 顶部导航 */}
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
              <Wrench className="h-5 w-5 text-white" />
            </span>
            <div>
              <h1 className="text-base font-bold">后勤报修管理后台</h1>
              <p className="text-xs text-muted-foreground">工单派发 · 跟进 · 关闭 · 驳回</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEngDialogOpen(true)}>
              <UserPlus className="mr-1.5 h-4 w-4" />
              工程师管理
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/screen">
                <LayoutDashboard className="mr-1.5 h-4 w-4" />
                数据大屏
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/">学生端</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5">
        {/* 状态筛选 Tab */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(["all", ...Object.keys(TICKET_STATUS)] as string[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setStatusFilter(s);
                setPage(1);
              }}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                statusFilter === s
                  ? "border-blue-600 bg-blue-600 font-medium text-white"
                  : "border-border bg-white text-muted-foreground hover:border-blue-300",
              )}
            >
              {s === "all" ? "全部" : TICKET_STATUS[s as TicketStatus]}
            </button>
          ))}
        </div>

        {/* 筛选栏 */}
        <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-xl border bg-white p-3">
          <Select
            value={categoryFilter}
            onValueChange={(v) => {
              setCategoryFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder="报修类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类型</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative min-w-52 flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="搜索标题 / 位置 / 工单号，回车查询"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setPage(1);
                  loadTickets();
                }
              }}
            />
          </div>
          <Button variant="outline" size="icon" onClick={loadTickets} aria-label="刷新">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>

        {/* 工单列表 */}
        <div className="overflow-hidden rounded-xl border bg-white">
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : tickets.length === 0 ? (
            <p className="py-20 text-center text-sm text-muted-foreground">暂无符合条件的工单</p>
          ) : (
            <div className="divide-y">
              {tickets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => openDetail(t.id)}
                  className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-muted/40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{t.title}</p>
                      {t.urgency === "urgent" && (
                        <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-600">
                          紧急
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {t.ticket_no} · {t.category} · {t.location} · {t.reporter_name} {t.reporter_phone}
                    </p>
                  </div>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                    {formatTime(t.created_at)}
                  </span>
                  <StatusBadge status={t.status} className="shrink-0" />
                </button>
              ))}
            </div>
          )}

          {/* 分页 */}
          {total > pageSize && (
            <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
              <span>共 {total} 条</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  上一页
                </Button>
                <span>
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  下一页
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 工单详情抽屉 */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>工单详情</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            {detailLoading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : detail ? (
              <>
                {/* 操作按钮 */}
                {canOperate && (
                  <div className="mb-5 grid grid-cols-4 gap-2">
                    <Button size="sm" onClick={() => setAction("dispatch")}>
                      <Send className="mr-1 h-3.5 w-3.5" />
                      派发
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setAction("follow")}>
                      <MessageSquarePlus className="mr-1 h-3.5 w-3.5" />
                      跟进
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                      onClick={() => setAction("close")}
                    >
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                      关闭
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-200 text-red-600 hover:bg-red-50"
                      onClick={() => setAction("reject")}
                    >
                      <XCircle className="mr-1 h-3.5 w-3.5" />
                      驳回
                    </Button>
                  </div>
                )}
                <TicketDetailView ticket={detail} />
              </>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      {/* 操作弹窗 */}
      <Dialog open={action !== null} onOpenChange={(open) => !open && setAction(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{actionTitle}</DialogTitle>
            <DialogDescription>
              {detail ? `工单：${detail.ticket_no} — ${detail.title}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {action === "dispatch" && (
              <div>
                <Label className="mb-1.5 block text-sm">选择维修工程师 *</Label>
                <Select value={dispatchEngineer} onValueChange={setDispatchEngineer}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择工程师" />
                  </SelectTrigger>
                  <SelectContent>
                    {engineers.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}（{e.specialty} · {e.phone}）
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="mb-1.5 block text-sm">
                {action === "dispatch" && "派发备注（选填）"}
                {action === "follow" && "跟进内容 *"}
                {action === "close" && "关闭说明（选填）"}
                {action === "reject" && "驳回原因 *"}
              </Label>
              <Textarea
                rows={3}
                value={actionText}
                maxLength={300}
                onChange={(e) => setActionText(e.target.value)}
                placeholder={
                  action === "dispatch"
                    ? "例：请今天下午到场处理"
                    : action === "follow"
                      ? "例：已到场检查，需更换水龙头配件，明天到货"
                      : action === "close"
                        ? "例：已修复并验收"
                        : "例：经核实非公共设施故障，请联系物业处理"
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(null)} disabled={actionSubmitting}>
              取消
            </Button>
            <Button
              onClick={submitAction}
              disabled={actionSubmitting}
              variant={action === "reject" ? "destructive" : "default"}
            >
              {actionSubmitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              确认{actionTitle}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 工程师管理弹窗 */}
      <Dialog open={engDialogOpen} onOpenChange={setEngDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>工程师管理</DialogTitle>
            <DialogDescription>现有工程师 {engineers.length} 人，可新增维修工程师</DialogDescription>
          </DialogHeader>
          <div className="max-h-52 space-y-2 overflow-y-auto">
            {engineers.map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                <span className="font-medium">{e.name}</span>
                <span className="text-muted-foreground">
                  {e.specialty} · {e.phone}
                </span>
              </div>
            ))}
          </div>
          <div className="space-y-2.5 border-t pt-3">
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="姓名 *"
                value={engForm.name}
                maxLength={20}
                onChange={(e) => setEngForm((p) => ({ ...p, name: e.target.value }))}
              />
              <Input
                placeholder="手机号 *"
                type="tel"
                value={engForm.phone}
                maxLength={11}
                onChange={(e) => setEngForm((p) => ({ ...p, phone: e.target.value.replace(/\D/g, "") }))}
              />
            </div>
            <Input
              placeholder="擅长领域，如：水电维修"
              value={engForm.specialty}
              maxLength={20}
              onChange={(e) => setEngForm((p) => ({ ...p, specialty: e.target.value }))}
            />
          </div>
          <DialogFooter>
            <Button onClick={addEngineer} disabled={engSubmitting}>
              {engSubmitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              添加工程师
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
