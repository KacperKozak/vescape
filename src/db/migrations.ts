import type { SQLiteDatabase } from 'expo-sqlite'

type Migration = {
  version: number
  statements: string[]
}

const migrations: Migration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS boards (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        ble_id TEXT,
        is_starred INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      )`,
    ],
  },
  {
    version: 2,
    statements: [
      `ALTER TABLE boards ADD COLUMN min_voltage REAL`,
      `ALTER TABLE boards ADD COLUMN max_voltage REAL`,
    ],
  },
]

export function runMigrations(db: SQLiteDatabase): void {
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version')
  const currentVersion = row?.user_version ?? 0

  for (const migration of migrations) {
    if (migration.version <= currentVersion) {
      continue
    }

    db.withTransactionSync(() => {
      for (const statement of migration.statements) {
        db.execSync(statement)
      }
      db.execSync(`PRAGMA user_version = ${migration.version}`)
    })
  }
}
