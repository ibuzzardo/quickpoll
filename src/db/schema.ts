import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const polls = pgTable("polls", {
  id: uuid("id").defaultRandom().primaryKey(),
  question: text("question").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const options = pgTable("options", {
  id: uuid("id").defaultRandom().primaryKey(),
  pollId: uuid("poll_id")
    .references(() => polls.id)
    .notNull(),
  text: text("text").notNull(),
});

export const votes = pgTable("votes", {
  id: uuid("id").defaultRandom().primaryKey(),
  optionId: uuid("option_id")
    .references(() => options.id)
    .notNull(),
  voterIp: text("voter_ip"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
