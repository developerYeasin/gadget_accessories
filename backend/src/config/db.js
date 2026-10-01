import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

export const dbConfig = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
};

const pool = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: 10,
  // The remote MySQL server drops idle sockets; keep them alive and recycle idle ones early
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  maxIdle: 5,
  idleTimeout: 60000,
  connectTimeout: 15000,
  decimalNumbers: true,
  dateStrings: true,
});

const RETRYABLE = new Set(['ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'EPIPE', 'ETIMEDOUT', 'ECONNREFUSED']);
export const isConnectionError = (err) => RETRYABLE.has(err?.code) || err?.fatal === true;

// Retry a pool query once when the server killed the socket it picked
const rawQuery = pool.query.bind(pool);
pool.query = async (...args) => {
  try {
    return await rawQuery(...args);
  } catch (err) {
    if (!isConnectionError(err)) throw err;
    return rawQuery(...args);
  }
};

// Transactions use getConnection(); hand out a connection that's verified alive
const rawGetConnection = pool.getConnection.bind(pool);
pool.getConnection = async () => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const conn = await rawGetConnection();
    try {
      await conn.ping();
      return conn;
    } catch (err) {
      conn.destroy();
      if (!isConnectionError(err) || attempt === 2) throw err;
    }
  }
  throw new Error('Could not get a database connection');
};

export default pool;
