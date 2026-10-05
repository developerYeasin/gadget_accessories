import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import pool, { dbConfig } from '../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const { database, ...serverConfig } = dbConfig;
  const conn = await mysql.createConnection({ ...serverConfig, multipleStatements: true });
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } catch (err) {
    console.warn('Could not create database (may already exist):', err.message);
  }
  await conn.query(`USE \`${database}\``);
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await conn.query(sql);

  // Columns added after the first release — add only when missing
  const ensureColumn = async (table, column, definition) => {
    const [rows] = await conn.query(
      'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      [database, table, column]
    );
    if (!rows.length) await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  };
  await ensureColumn('users', 'is_blocked', 'TINYINT(1) NOT NULL DEFAULT 0');
  await ensureColumn('users', 'token_version', 'INT NOT NULL DEFAULT 0');
  await ensureColumn('users', 'password_changed_at', 'DATETIME NULL');
  await ensureColumn('users', 'last_login_at', 'DATETIME NULL');
  await ensureColumn('users', 'avatar', 'VARCHAR(500) NULL');
  await ensureColumn('orders', 'discount', 'DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER delivery_charge');
  await ensureColumn('orders', 'coupon_code', 'VARCHAR(40) NULL AFTER discount');
  await ensureColumn('orders', 'payment_status', "ENUM('unpaid','paid','refunded') NOT NULL DEFAULT 'unpaid' AFTER payment_method");
  await ensureColumn('orders', 'admin_note', 'VARCHAR(1000) NULL');
  await ensureColumn('orders', 'updated_at', 'TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
  await ensureColumn('reviews', 'is_approved', 'TINYINT(1) NOT NULL DEFAULT 1');
  await ensureColumn('products', 'options', 'JSON NULL');
  await ensureColumn('products', 'weight', 'INT NOT NULL DEFAULT 0');
  await ensureColumn('order_items', 'variant_id', 'INT NULL AFTER product_id');
  await ensureColumn('order_items', 'variant_name', 'VARCHAR(200) NULL AFTER product_name');
  await ensureColumn('orders', 'payment_ref', 'VARCHAR(100) NULL AFTER payment_status');
  await ensureColumn('orders', 'courier', 'VARCHAR(30) NULL');
  await ensureColumn('orders', 'courier_tracking_code', 'VARCHAR(80) NULL');
  await ensureColumn('orders', 'courier_consignment_id', 'VARCHAR(80) NULL');
  await ensureColumn('orders', 'courier_status', 'VARCHAR(60) NULL');
  await ensureColumn('orders', 'courier_booked_at', 'DATETIME NULL');
  await ensureColumn('products', 'free_delivery', 'TINYINT(1) NOT NULL DEFAULT 0');
  console.log('✔ Tables created / verified in', database);
  await conn.end();
}

migrate()
  .catch((err) => {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  })
  // db.js opens a keep-alive pool on import; close it so the script exits
  .finally(() => pool.end());
