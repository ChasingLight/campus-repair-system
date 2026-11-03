"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORIES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { ImagePlus, Loader2, X, Zap } from "lucide-react";

interface FormState {
  title: string;
  category: string;
  location: string;
  description: string;
  reporter_name: string;
  reporter_phone: string;
  urgent: boolean;
}

const initialForm: FormState = {
  title: "",
  category: "",
  location: "",
  description: "",
  reporter_name: "",
  reporter_phone: "",
  urgent: false,
};

export function RepairForm({ onSubmitted }: { onSubmitted: (phone: string) => void }) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [imageKeys, setImageKeys] = useState<string[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = (key: keyof FormState, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handlePickImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    if (imageKeys.length + files.length > 6) {
      toast.error("最多上传 6 张图片");
      return;
    }
    setUploading(true);
    try {
      for (const file of files) {
        // 本地预览
        const previewUrl = URL.createObjectURL(file);
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const json = await res.json();
        if (!json.success) {
          URL.revokeObjectURL(previewUrl);
          toast.error(json.error || "图片上传失败");
          continue;
        }
        setImageKeys((prev) => [...prev, json.data.key]);
        setPreviews((prev) => [...prev, previewUrl]);
      }
    } catch {
      toast.error("图片上传失败，请重试");
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (index: number) => {
    URL.revokeObjectURL(previews[index]);
    setPreviews((prev) => prev.filter((_, i) => i !== index));
    setImageKeys((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) return toast.error("请填写报修标题");
    if (!form.category) return toast.error("请选择报修类型");
    if (!form.location.trim()) return toast.error("请填写报修位置");
    if (!form.description.trim()) return toast.error("请填写问题描述");
    if (!form.reporter_name.trim()) return toast.error("请填写联系人姓名");
    if (!/^1\d{10}$/.test(form.reporter_phone.trim())) return toast.error("请填写正确的手机号");

    setSubmitting(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          category: form.category,
          location: form.location,
          description: form.description,
          images: imageKeys,
          reporter_name: form.reporter_name,
          reporter_phone: form.reporter_phone,
          urgency: form.urgent ? "urgent" : "normal",
        }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error || "提交失败，请重试");
        return;
      }
      toast.success(`报修提交成功！工单号：${json.data.ticket_no}`);
      const phone = form.reporter_phone;
      previews.forEach((u) => URL.revokeObjectURL(u));
      setForm(initialForm);
      setImageKeys([]);
      setPreviews([]);
      onSubmitted(phone);
    } catch {
      toast.error("网络异常，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* 报修类型 */}
      <div>
        <Label className="mb-2 block text-sm font-medium">
          报修类型 <span className="text-red-500">*</span>
        </Label>
        <div className="grid grid-cols-3 gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => set("category", c)}
              className={cn(
                "rounded-lg border px-2 py-2.5 text-sm transition-colors",
                form.category === c
                  ? "border-blue-600 bg-blue-50 font-medium text-blue-700"
                  : "border-border bg-white text-muted-foreground",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* 标题 */}
      <div>
        <Label htmlFor="title" className="mb-2 block text-sm font-medium">
          报修标题 <span className="text-red-500">*</span>
        </Label>
        <Input
          id="title"
          placeholder="例：宿舍卫生间水龙头漏水"
          value={form.title}
          maxLength={50}
          onChange={(e) => set("title", e.target.value)}
        />
      </div>

      {/* 位置 */}
      <div>
        <Label htmlFor="location" className="mb-2 block text-sm font-medium">
          报修位置 <span className="text-red-500">*</span>
        </Label>
        <Input
          id="location"
          placeholder="例：3号宿舍楼 502 室"
          value={form.location}
          maxLength={100}
          onChange={(e) => set("location", e.target.value)}
        />
      </div>

      {/* 描述 */}
      <div>
        <Label htmlFor="description" className="mb-2 block text-sm font-medium">
          问题描述 <span className="text-red-500">*</span>
        </Label>
        <Textarea
          id="description"
          placeholder="请描述故障现象、发生时间等，方便师傅快速定位问题"
          rows={4}
          value={form.description}
          maxLength={500}
          onChange={(e) => set("description", e.target.value)}
        />
      </div>

      {/* 图片上传 */}
      <div>
        <Label className="mb-2 block text-sm font-medium">现场照片（选填，最多 6 张）</Label>
        <div className="grid grid-cols-4 gap-2">
          {previews.map((url, i) => (
            <div key={i} className="relative aspect-square">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`照片 ${i + 1}`} className="h-full w-full rounded-lg border object-cover" />
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-white"
                aria-label="删除照片"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {previews.length < 6 && (
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-muted-foreground transition-colors hover:border-blue-400 hover:text-blue-500"
            >
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
              <span className="text-xs">{uploading ? "上传中" : "添加照片"}</span>
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={handlePickImages}
        />
      </div>

      {/* 联系人 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="reporter_name" className="mb-2 block text-sm font-medium">
            姓名 <span className="text-red-500">*</span>
          </Label>
          <Input
            id="reporter_name"
            placeholder="姓名"
            value={form.reporter_name}
            maxLength={20}
            onChange={(e) => set("reporter_name", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="reporter_phone" className="mb-2 block text-sm font-medium">
            手机号 <span className="text-red-500">*</span>
          </Label>
          <Input
            id="reporter_phone"
            type="tel"
            placeholder="用于接收进度"
            value={form.reporter_phone}
            maxLength={11}
            onChange={(e) => set("reporter_phone", e.target.value.replace(/\D/g, ""))}
          />
        </div>
      </div>

      {/* 紧急开关 */}
      <button
        type="button"
        onClick={() => set("urgent", !form.urgent)}
        className={cn(
          "flex w-full items-center justify-between rounded-lg border p-3 transition-colors",
          form.urgent ? "border-red-300 bg-red-50" : "border-border bg-white",
        )}
      >
        <div className="flex items-center gap-2">
          <Zap className={cn("h-4 w-4", form.urgent ? "text-red-500" : "text-muted-foreground")} />
          <span className={cn("text-sm", form.urgent ? "font-medium text-red-600" : "text-muted-foreground")}>
            标记为紧急（如漏水、断电等）
          </span>
        </div>
        <span
          className={cn(
            "h-5 w-9 rounded-full p-0.5 transition-colors",
            form.urgent ? "bg-red-500" : "bg-gray-300",
          )}
        >
          <span
            className={cn(
              "block h-4 w-4 rounded-full bg-white transition-transform",
              form.urgent && "translate-x-4",
            )}
          />
        </span>
      </button>

      <Button
        className="h-12 w-full rounded-xl text-base"
        disabled={submitting || uploading}
        onClick={handleSubmit}
      >
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        提交报修
      </Button>
    </div>
  );
}
