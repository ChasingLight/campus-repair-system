import { sql } from "drizzle-orm";
import {
	pgTable,
	serial,
	varchar,
	text,
	timestamp,
	integer,
	boolean,
	jsonb,
	index,
} from "drizzle-orm/pg-core";

// 系统表（勿删）
export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow(),
});

// 维修工程师表
export const engineers = pgTable(
	"engineers",
	{
		id: varchar("id", { length: 36 })
			.primaryKey()
			.default(sql`gen_random_uuid()`),
		name: varchar("name", { length: 64 }).notNull(),
		phone: varchar("phone", { length: 32 }).notNull(),
		specialty: varchar("specialty", { length: 32 }).notNull().default("综合维修"), // 擅长领域
		is_active: boolean("is_active").notNull().default(true),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [index("engineers_is_active_idx").on(table.is_active)],
);

// 报修工单表
export const repairTickets = pgTable(
	"repair_tickets",
	{
		id: varchar("id", { length: 36 })
			.primaryKey()
			.default(sql`gen_random_uuid()`),
		ticket_no: varchar("ticket_no", { length: 32 }).notNull().unique(), // 工单编号 BX20251103-xxxx
		title: varchar("title", { length: 128 }).notNull(),
		category: varchar("category", { length: 32 }).notNull(), // 水电维修/门窗家具/网络设备/空调电器/其他
		location: varchar("location", { length: 255 }).notNull(), // 报修位置
		description: text("description").notNull(),
		images: jsonb("images").$type<string[]>().default([]), // 图片URL数组
		reporter_name: varchar("reporter_name", { length: 64 }).notNull(),
		reporter_phone: varchar("reporter_phone", { length: 32 }).notNull(),
		urgency: varchar("urgency", { length: 10 }).notNull().default("normal"), // normal / urgent
		// pending待处理 / dispatched已派发 / processing处理中 / closed已关闭 / rejected已驳回
		status: varchar("status", { length: 20 }).notNull().default("pending"),
		assignee_id: varchar("assignee_id", { length: 36 }).references(() => engineers.id),
		dispatch_note: text("dispatch_note"), // 派发备注
		reject_reason: text("reject_reason"), // 驳回原因
		close_note: text("close_note"), // 关闭说明
		dispatched_at: timestamp("dispatched_at", { withTimezone: true }),
		closed_at: timestamp("closed_at", { withTimezone: true }),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("repair_tickets_status_idx").on(table.status),
		index("repair_tickets_category_idx").on(table.category),
		index("repair_tickets_assignee_id_idx").on(table.assignee_id),
		index("repair_tickets_created_at_idx").on(table.created_at),
		index("repair_tickets_status_created_idx").on(table.status, table.created_at),
		index("repair_tickets_reporter_phone_idx").on(table.reporter_phone),
	],
);

// 工单流转/跟进记录表
export const ticketLogs = pgTable(
	"ticket_logs",
	{
		id: varchar("id", { length: 36 })
			.primaryKey()
			.default(sql`gen_random_uuid()`),
		ticket_id: varchar("ticket_id", { length: 36 })
			.notNull()
			.references(() => repairTickets.id, { onDelete: "cascade" }),
		// created创建 / dispatched派发 / followed_up跟进 / closed关闭 / rejected驳回
		action: varchar("action", { length: 20 }).notNull(),
		content: text("content").notNull(),
		operator_name: varchar("operator_name", { length: 64 }).notNull(),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("ticket_logs_ticket_id_idx").on(table.ticket_id),
		index("ticket_logs_created_at_idx").on(table.created_at),
	],
);

export type Engineer = typeof engineers.$inferSelect;
export type RepairTicket = typeof repairTickets.$inferSelect;
export type TicketLog = typeof ticketLogs.$inferSelect;
