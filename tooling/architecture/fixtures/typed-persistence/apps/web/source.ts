import { Pool } from "pg";

const pool = new Pool();
const client = pool;

void pool.query("select * from users");
void client.query(`delete from users`);
