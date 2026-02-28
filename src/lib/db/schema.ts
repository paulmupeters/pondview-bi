import { relations } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const chats = sqliteTable("chats", {
  id: text("id").primaryKey(),
  title: text("title"),
  userId: text("user_id"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  chatId: text("chat_id")
    .notNull()
    .references(() => chats.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  parts: text("parts"),
  createdAt: integer("created_at").notNull(),
});

export const chatsRelations = relations(chats, ({ many }) => ({
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  chat: one(chats, {
    fields: [messages.chatId],
    references: [chats.id],
  }),
}));

// Dashboards and Charts
export const dashboards = sqliteTable("dashboards", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const dashboardCharts = sqliteTable("dashboard_charts", {
  id: text("id").primaryKey(),
  dashboardId: text("dashboard_id")
    .notNull()
    .references(() => dashboards.id, { onDelete: "cascade" }),
  title: text("title"),
  description: text("description"),
  sql: text("sql").notNull(),
  dbIdentifier: text("db_identifier"),
  chartConfigJson: text("chart_config_json").notNull(),
  semanticQueryJson: text("semantic_query_json"),
  exploreName: text("explore_name"),
  position: integer("position").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const dashboardsRelations = relations(dashboards, ({ many }) => ({
  charts: many(dashboardCharts),
}));

export const dashboardChartsRelations = relations(
  dashboardCharts,
  ({ one }) => ({
    dashboard: one(dashboards, {
      fields: [dashboardCharts.dashboardId],
      references: [dashboards.id],
    }),
  }),
);

export const dashboardSlicers = sqliteTable("dashboard_slicers", {
  id: text("id").primaryKey(),
  dashboardId: text("dashboard_id")
    .notNull()
    .references(() => dashboards.id, { onDelete: "cascade" }),
  field: text("field").notNull(), // e.g., "orders.country"
  title: text("title"), // optional display override
  limit: integer("limit").notNull().default(50),
  position: integer("position").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const dashboardSlicersRelations = relations(
  dashboardSlicers,
  ({ one }) => ({
    dashboard: one(dashboards, {
      fields: [dashboardSlicers.dashboardId],
      references: [dashboards.id],
    }),
  }),
);

export const chartSlicers = sqliteTable("chart_slicers", {
  id: text("id").primaryKey(),
  chartId: text("chart_id")
    .notNull()
    .references(() => dashboardCharts.id, { onDelete: "cascade" }),
  field: text("field").notNull(), // e.g., "orders.country"
  title: text("title"), // optional display override
  limit: integer("limit").notNull().default(50),
  position: integer("position").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const chartSlicersRelations = relations(chartSlicers, ({ one }) => ({
  chart: one(dashboardCharts, {
    fields: [chartSlicers.chartId],
    references: [dashboardCharts.id],
  }),
}));
