import type { Metadata } from "next";
import { ScreenClient } from "@/components/screen/screen-client";

export const metadata: Metadata = {
  title: "数据大屏 - 校园报修系统",
};

export default function ScreenPage() {
  return <ScreenClient />;
}
