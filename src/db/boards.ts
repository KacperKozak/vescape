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
}

function rowToBoard(row: {
  id: string
  name: string
  description: string | null
  bleId: string | null
  isStarred: boolean
  createdAt: number
}): Board {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    bleId: row.bleId,
    isStarred: row.isStarred,
    createdAt: row.createdAt,
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
    })
    .where(eq(boardsTable.id, board.id))
    .run()
}

export function deleteBoard(id: string): void {
  db.delete(boardsTable).where(eq(boardsTable.id, id)).run()
}
