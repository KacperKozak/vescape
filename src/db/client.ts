import { drizzle } from 'drizzle-orm/expo-sqlite'
import * as SQLite from 'expo-sqlite'

import { runMigrations } from './migrations'
import * as schema from './schema'

const sqlite = SQLite.openDatabaseSync('app.db')

runMigrations(sqlite)

export const db = drizzle(sqlite, { schema })
