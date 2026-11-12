/** Brings calls that everyone has left up to date (server side). */
export interface CallSettler {
  /** Ends any of these calls whose room has closed; returns when each one ended. */
  settle(callIds: readonly number[]): Promise<ReadonlyMap<number, string>>;
}
