// Type declarations for bun:sqlite module
// This allows TypeScript to compile without @types/bun which conflicts with @types/node

declare module 'bun:sqlite' {
  export type SQLQueryBindings =
    | null
    | string
    | number
    | bigint
    | boolean
    | Uint8Array

  export interface Statement<T = unknown> {
    all(...params: SQLQueryBindings[]): T[]
    run(
      ...params: SQLQueryBindings[]
    ): { changes: number; lastInsertRowid: number | bigint }
    iterate(...params: SQLQueryBindings[]): IterableIterator<T>
    columnNames: string[]
  }

  export class Database {
    constructor(filename: string, options?: { readonly?: boolean })
    prepare<T = unknown>(sql: string): Statement<T>
    exec(sql: string): void
    close(): void
  }
}
