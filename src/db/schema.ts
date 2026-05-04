import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const boardsTable = sqliteTable('boards', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  bleId: text('ble_id'),
  isStarred: integer('is_starred', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
  /** Empty-pack voltage (0% battery). Null = unknown, hide battery %. */
  minVoltage: real('min_voltage'),
  /** Full-pack voltage (100% battery). Null = unknown, hide battery %. */
  maxVoltage: real('max_voltage'),
})

export type BoardRow = typeof boardsTable.$inferSelect
export type NewBoardRow = typeof boardsTable.$inferInsert
