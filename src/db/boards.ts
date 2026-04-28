import * as SQLite from 'expo-sqlite'

export interface Board {
  id: string
  name: string
  description: string | null
  bleId: string | null
  isStarred: boolean
  createdAt: number
}

const db = SQLite.openDatabaseSync('app.db')

db.execSync(`
  CREATE TABLE IF NOT EXISTS boards (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    ble_id TEXT,
    is_starred INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )
`)

type BoardRow = {
  id: string
  name: string
  description: string | null
  ble_id: string | null
  is_starred: number
  created_at: number
}

function rowToBoard(row: BoardRow): Board {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    bleId: row.ble_id,
    isStarred: row.is_starred === 1,
    createdAt: row.created_at,
  }
}

export function getBoards(): Board[] {
  return db
    .getAllSync<BoardRow>('SELECT * FROM boards ORDER BY is_starred DESC, created_at ASC')
    .map(rowToBoard)
}

export function insertBoard(board: Board): void {
  db.runSync(
    'INSERT INTO boards (id, name, description, ble_id, is_starred, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [
      board.id,
      board.name,
      board.description,
      board.bleId,
      board.isStarred ? 1 : 0,
      board.createdAt,
    ],
  )
}

export function updateBoard(board: Board): void {
  db.runSync(
    'UPDATE boards SET name = ?, description = ?, ble_id = ?, is_starred = ? WHERE id = ?',
    [board.name, board.description, board.bleId, board.isStarred ? 1 : 0, board.id],
  )
}

export function deleteBoard(id: string): void {
  db.runSync('DELETE FROM boards WHERE id = ?', [id])
}
