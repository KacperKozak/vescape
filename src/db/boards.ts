import { asc, desc, eq } from 'drizzle-orm'

import { db } from './client'
import { boardsTable } from './schema'

export interface Board {
  id: string
  name: string
  description: string | null
  bleId: string | null
  isStarred: boolean
  createdAt: number
  /** Empty-pack voltage (0% battery). Null = unknown. */
  minVoltage: number | null
  /** Full-pack voltage (100% battery). Null = unknown. */
  maxVoltage: number | null
}

function rowToBoard(row: {
  id: string
  name: string
  description: string | null
  bleId: string | null
  isStarred: boolean
  createdAt: number
  minVoltage: number | null
  maxVoltage: number | null
}): Board {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    bleId: row.bleId,
    isStarred: row.isStarred,
    createdAt: row.createdAt,
    minVoltage: row.minVoltage,
    maxVoltage: row.maxVoltage,
  }
}

export function getBoards(): Board[] {
  return db
    .select()
    .from(boardsTable)
    .orderBy(desc(boardsTable.isStarred), asc(boardsTable.createdAt))
    .all()
    .map(rowToBoard)
}

export function insertBoard(board: Board): void {
  db.insert(boardsTable)
    .values({
      id: board.id,
      name: board.name,
      description: board.description,
      bleId: board.bleId,
      isStarred: board.isStarred,
      createdAt: board.createdAt,
      minVoltage: board.minVoltage,
      maxVoltage: board.maxVoltage,
    })
    .run()
}

export function updateBoard(board: Board): void {
  db.update(boardsTable)
    .set({
      name: board.name,
      description: board.description,
      bleId: board.bleId,
      isStarred: board.isStarred,
      minVoltage: board.minVoltage,
      maxVoltage: board.maxVoltage,
    })
    .where(eq(boardsTable.id, board.id))
    .run()
}

export function deleteBoard(id: string): void {
  db.delete(boardsTable).where(eq(boardsTable.id, id)).run()
}
