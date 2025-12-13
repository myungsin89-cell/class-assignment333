import psycopg2
import sys

# Database connection string
conn_string = "postgresql://neondb_owner:npg_46DdWTayGtEn@ep-odd-paper-a1kj7j8u-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"

try:
    # Connect to the database
    conn = psycopg2.connect(conn_string)
    cur = conn.cursor()

    # Get all tables
    cur.execute("""
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name;
    """)

    tables = cur.fetchall()

    print("=== Database Tables ===")
    for table in tables:
        table_name = table[0]
        print(f"\n--- Table: {table_name} ---")

        # Get table structure
        cur.execute(f"""
            SELECT column_name, data_type, character_maximum_length
            FROM information_schema.columns
            WHERE table_name = '{table_name}'
            ORDER BY ordinal_position;
        """)

        columns = cur.fetchall()
        print("Columns:")
        for col in columns:
            col_name, data_type, max_length = col
            length_info = f"({max_length})" if max_length else ""
            print(f"  - {col_name}: {data_type}{length_info}")

        # Get row count
        cur.execute(f"SELECT COUNT(*) FROM {table_name};")
        count = cur.fetchone()[0]
        print(f"Row count: {count}")

        # Get sample data (first 10 rows)
        if count > 0:
            cur.execute(f"SELECT * FROM {table_name} LIMIT 10;")
            rows = cur.fetchall()
            col_names = [desc[0] for desc in cur.description]

            print("\nSample data (first 10 rows):")
            print(" | ".join(col_names))
            print("-" * 80)
            for row in rows:
                print(" | ".join(str(val) for val in row))

    # Create SQL dump
    print("\n\n=== Creating SQL Dump ===")
    with open('database_dump.sql', 'w', encoding='utf-8') as f:
        for table in tables:
            table_name = table[0]

            # Get CREATE TABLE statement
            cur.execute(f"""
                SELECT 'CREATE TABLE ' || table_name || ' (' ||
                string_agg(column_name || ' ' || data_type ||
                    CASE WHEN character_maximum_length IS NOT NULL
                    THEN '(' || character_maximum_length || ')'
                    ELSE '' END, ', ') || ');'
                FROM information_schema.columns
                WHERE table_name = '{table_name}'
                GROUP BY table_name;
            """)

            # Write table data
            cur.execute(f"SELECT * FROM {table_name};")
            rows = cur.fetchall()
            col_names = [desc[0] for desc in cur.description]

            f.write(f"\n-- Table: {table_name}\n")
            f.write(f"DROP TABLE IF EXISTS {table_name} CASCADE;\n")

            # Get actual CREATE TABLE statement
            if rows:
                # Write INSERT statements
                for row in rows:
                    values = []
                    for val in row:
                        if val is None:
                            values.append('NULL')
                        elif isinstance(val, str):
                            escaped_val = val.replace("'", "''")
                            values.append(f"'{escaped_val}'")
                        else:
                            values.append(str(val))

                    f.write(f"INSERT INTO {table_name} ({', '.join(col_names)}) VALUES ({', '.join(values)});\n")

            f.write("\n")

    print("SQL dump saved to database_dump.sql")

    cur.close()
    conn.close()

except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
