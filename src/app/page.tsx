"use client";

import { useState } from "react";
import { RepairForm } from "@/components/student/repair-form";
import { MyTickets } from "@/components/student/my-tickets";
import { ClipboardList, FilePlus2, LayoutDashboard, Settings } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function StudentPage() {
  const [tab, setTab] = useState<"submit" | "mine">("submit");
  const [myPhone, setMyPhone] = useState("");

  return (
    <div className="min-h-screen bg-[#F5F6F8]">
      {/* 顶部 */}
      <header className="bg-gradient-to-br from-blue-600 to-blue-700 pb-14 pt-8 text-white">
        <div className="mx-auto max-w-md px-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">校园报修</h1>
              <p className="mt-1 text-sm text-blue-100">设施故障，一键报修，极速响应</p>
            </div>
            <div className="flex gap-2">
              <Link
                href="/admin"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 transition-colors hover:bg-white/25"
                aria-label="管理后台"
              >
                <Settings className="h-4 w-4" />
              </Link>
              <Link
                href="/screen"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 transition-colors hover:bg-white/25"
                aria-label="数据大屏"
              >
                <LayoutDashboard className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* 内容卡片 */}
      <main className="mx-auto -mt-8 max-w-md px-4 pb-24">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          {/* Tab 切换 */}
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
            <button
              type="button"
              onClick={() => setTab("submit")}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors",
                tab === "submit" ? "bg-white text-blue-600 shadow-sm" : "text-muted-foreground",
              )}
            >
              <FilePlus2 className="h-4 w-4" />
              提交报修
            </button>
            <button
              type="button"
              onClick={() => setTab("mine")}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors",
                tab === "mine" ? "bg-white text-blue-600 shadow-sm" : "text-muted-foreground",
              )}
            >
              <ClipboardList className="h-4 w-4" />
              我的报修
            </button>
          </div>

          {tab === "submit" ? (
            <RepairForm
              onSubmitted={(phone) => {
                setMyPhone(phone);
                setTab("mine");
              }}
            />
          ) : (
            <MyTickets key={myPhone} initialPhone={myPhone} />
          )}
        </div>
      </main>
    </div>
  );
}
