import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const boardsTable = sqliteTable('boards', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  bleId: text('ble_id'),
  isStarred: integer('is_starred', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
})

export type BoardRow = typeof boardsTable.$inferSelect
export type NewBoardRow = typeof boardsTable.$inferInsert
