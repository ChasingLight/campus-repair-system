import type { Metadata } from "next";
import { AdminClient } from "@/components/admin/admin-client";

export const metadata: Metadata = {
  title: "管理后台 - 校园报修系统",
};

export default function AdminPage() {
  return <AdminClient />;
}
