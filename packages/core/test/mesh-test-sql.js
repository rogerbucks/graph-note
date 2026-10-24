// sql.js as the mesh index's SQLite engine, for the tests: one statement, its parameters, and its rows.
import initSqlJs from 'sql.js';

/** A new, empty SQLite database in the process, and the engine the index runs it through. */
export async function sqlEngine() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  return {
    db,
    run(sql, params = []) {
      const st = db.prepare(sql);
      try {
        st.bind(params);
        const rows = [];
        while (st.step()) rows.push(st.getAsObject());
        return rows;
      } finally {
        st.free();
      }
    },
  };
}
