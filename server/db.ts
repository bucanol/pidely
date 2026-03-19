import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

// Configuramos el Pool para que acepte SSL de Neon
export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Esto permite la conexión segura con Neon
  }
});

export const db = drizzle(pool, { schema });