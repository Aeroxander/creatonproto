import {
  CompiledQuery,
  DatabaseConnection,
  DatabaseIntrospector,
  Dialect,
  DialectAdapter,
  Driver,
  Kysely,
  QueryCompiler,
  QueryResult,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from 'kysely'
import { Database, type SQLQueryBindings } from 'bun:sqlite'

export interface BunSqliteDialectConfig {
  database: Database
  onCreateConnection?: (connection: DatabaseConnection) => Promise<void>
}

export class BunSqliteDialect implements Dialect {
  readonly #config: BunSqliteDialectConfig

  constructor(config: BunSqliteDialectConfig) {
    this.#config = { ...config }
  }

  createDriver(): Driver {
    return new BunSqliteDriver(this.#config)
  }

  createQueryCompiler(): QueryCompiler {
    return new SqliteQueryCompiler()
  }

  createAdapter(): DialectAdapter {
    return new SqliteAdapter()
  }

  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return new SqliteIntrospector(db)
  }
}

class BunSqliteDriver implements Driver {
  readonly #config: BunSqliteDialectConfig
  readonly #connectionMutex = new ConnectionMutex()

  #db?: Database
  #connection?: DatabaseConnection

  constructor(config: BunSqliteDialectConfig) {
    this.#config = { ...config }
  }

  async init(): Promise<void> {
    this.#db = this.#config.database
    this.#connection = new BunSqliteConnection(this.#db)

    if (this.#config.onCreateConnection) {
      await this.#config.onCreateConnection(this.#connection)
    }
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    await this.#connectionMutex.lock()
    return this.#connection!
  }

  async beginTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('begin'))
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('commit'))
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('rollback'))
  }

  async releaseConnection(): Promise<void> {
    this.#connectionMutex.unlock()
  }

  async destroy(): Promise<void> {
    this.#db?.close()
  }
}

class BunSqliteConnection implements DatabaseConnection {
  readonly #db: Database

  constructor(db: Database) {
    this.#db = db
  }

  executeQuery<O>(compiledQuery: CompiledQuery): Promise<QueryResult<O>> {
    const { sql, parameters } = compiledQuery
    const stmt = this.#db.prepare(sql)

    // bun:sqlite uses columnNames.length > 0 to detect SELECT queries
    // (better-sqlite3 uses stmt.reader)
    if (stmt.columnNames.length > 0) {
      return Promise.resolve({
        rows: stmt.all(...(parameters as SQLQueryBindings[])) as O[],
      })
    }

    const results = stmt.run(...(parameters as SQLQueryBindings[]))

    return Promise.resolve({
      insertId: BigInt(results.lastInsertRowid),
      numAffectedRows: BigInt(results.changes),
      rows: [],
    })
  }

  async *streamQuery<R>(
    compiledQuery: CompiledQuery,
  ): AsyncIterableIterator<QueryResult<R>> {
    const { sql, parameters } = compiledQuery
    const stmt = this.#db.prepare(sql)

    for (const row of stmt.iterate(...(parameters as SQLQueryBindings[]))) {
      yield { rows: [row as R] }
    }
  }
}

class ConnectionMutex {
  #promise?: Promise<void>
  #resolve?: () => void

  async lock(): Promise<void> {
    while (this.#promise) {
      await this.#promise
    }

    this.#promise = new Promise((resolve) => {
      this.#resolve = resolve
    })
  }

  unlock(): void {
    const resolve = this.#resolve

    this.#promise = undefined
    this.#resolve = undefined

    resolve?.()
  }
}
