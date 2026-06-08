export function queryResult<T>(result: T) {
  const query: any = {
    select: () => query,
    eq: () => query,
    gte: () => query,
    in: () => query,
    single: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (value: T) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject)
  };
  return query;
}

export function sequenceSupabase(results: unknown[]) {
  const calls: string[] = [];
  return {
    calls,
    from(table: string) {
      calls.push(table);
      const result = results.shift();
      return queryResult(result);
    }
  };
}

