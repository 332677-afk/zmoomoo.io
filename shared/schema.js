import { pgTable, text, serial, integer, bigint, timestamp, varchar } from "drizzle-orm/pg-core";

export const AdminLevel = {
    None: 0,
    Helper: 1,
    Moderator: 2,
    Staff: 3,
    Admin: 4,
    Owner: 5,
    Zahre: 6
};

export const accounts = pgTable("accounts", {
    id: serial("id").primaryKey(),
    accountId: varchar("account_id", { length: 16 }).unique().notNull(),
    username: varchar("username", { length: 16 }).unique().notNull(),
    displayName: varchar("display_name", { length: 30 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    email: varchar("email", { length: 255 }).unique().notNull(),
    resetToken: varchar("reset_token", { length: 255 }),
    resetTokenExpiresAt: timestamp("reset_token_expires_at"),
    adminLevel: integer("admin_level").default(0).notNull(),
    balance: integer("balance").default(0).notNull(),
    kills: integer("kills").default(0).notNull(),
    deaths: integer("deaths").default(0).notNull(),
    playTime: bigint("play_time", { mode: "number" }).default(0).notNull(),
    score: integer("score").default(0).notNull(),
    highestScore: integer("highest_score").default(0).notNull(),
    tribesCreated: integer("tribes_created").default(0).notNull(),
    currentTribe: varchar("current_tribe", { length: 30 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    lastLogin: timestamp("last_login"),
    ipAddress: varchar("ip_address", { length: 45 }),
});
