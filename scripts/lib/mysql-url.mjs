/**
 * Parse a mysql:// connection URL into mysql2 connection options.
 */

export function parseMysqlUrl(url) {
  const parsed = new URL(url);
  const database = parsed.pathname.replace(/^\//, '');
  if (!database) {
    throw new Error('MYSQL_URL must include a database path, e.g. mysql://user@host:3306/common_thread');
  }

  return {
    database,
    config: {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 3306,
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
    },
  };
}
