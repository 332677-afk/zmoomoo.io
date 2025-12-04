import { pgTable, text, serial, integer, timestamp, varchar } from "drizzle-orm/pg-core";

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
    adminLevel: integer("admin_level").default(0).notNull(),
    balance: integer("balance").default(0).notNull(),
    kills: integer("kills").default(0).notNull(),
    deaths: integer("deaths").default(0).notNull(),
    playTime: integer("play_time").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    lastLogin: timestamp("last_login"),
    ipAddress: varchar("ip_address", { length: 45 }),
});
