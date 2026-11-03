"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/status-badge";
import { TicketDetailView, type TicketDetail } from "@/components/ticket-detail";
import type { RepairTicket } from "@/lib/constants";
import { ChevronRight, Loader2, MapPin, Search } from "lucide-react";

interface TicketListItem extends RepairTicket {
  image_urls: string[];
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MyTickets({ initialPhone }: { initialPhone: string }) {
  const [phone, setPhone] = useState(initialPhone);
  const [tickets, setTickets] = useState<TicketListItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const query = useCallback(async (targetPhone?: string) => {
    const p = (initialPhone && !phone ? initialPhone : phone).trim();
    if (!/^1\d{10}$/.test(p)) {
      toast.error("请填写正确的手机号");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/tickets?phone=${encodeURIComponent(p)}&pageSize=50`);
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error || "查询失败");
        return;
      }
      setTickets(json.data as TicketListItem[]);
    } catch {
      toast.error("网络异常，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, [phone, initialPhone]);

  const openDetail = async (id: string) => {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/tickets/${id}`);
      const json = await res.json();
      if (json.success) {
        setDetail(json.data as TicketDetail);
      } else {
        toast.error(json.error || "查询详情失败");
      }
    } catch {
      toast.error("网络异常");
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 手机号查询 */}
      <div className="flex gap-2">
        <Input
          type="tel"
          placeholder="输入报修时填写的手机号"
          value={phone}
          maxLength={11}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && query()}
        />
        <Button onClick={() => query()} disabled={loading} className="shrink-0">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          <span className="ml-1">查询</span>
        </Button>
      </div>

      {/* 工单列表 */}
      {tickets === null ? (
        <p className="py-14 text-center text-sm text-muted-foreground">输入手机号查询你的报修记录</p>
      ) : tickets.length === 0 ? (
        <p className="py-14 text-center text-sm text-muted-foreground">该手机号暂无报修记录</p>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => openDetail(t.id)}
              className="w-full rounded-xl border bg-white p-3.5 text-left shadow-sm transition-shadow hover:shadow"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="line-clamp-1 flex-1 font-medium">{t.title}</p>
                <StatusBadge status={t.status} />
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                <span className="line-clamp-1">{t.location}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {t.ticket_no} · {formatTime(t.created_at)}
                </span>
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 详情弹窗 */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>工单详情</DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : detail ? (
            <TicketDetailView ticket={detail} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
