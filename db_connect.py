import psycopg2
import sys

# Database connection string
conn_string = "postgresql://neondb_owner:npg_46DdWTayGtEn@ep-odd-paper-a1kj7j8u-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"

print("Connecting to Neon database...")

try:
    # Connect to the database
    conn = psycopg2.connect(conn_string)
    conn.autocommit = True
    cur = conn.cursor()

    print("✓ Connected successfully!")
    print("\nEnter SQL queries (type 'exit' or 'quit' to exit, '\\dt' to list tables):")
    print("-" * 80)

    while True:
        try:
            query = input("\nSQL> ").strip()

            if query.lower() in ['exit', 'quit', 'q']:
                print("Disconnecting...")
                break

            if not query:
                continue

            # Handle psql-style commands
            if query == '\\dt':
                query = """
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                    ORDER BY table_name;
                """
            elif query == '\\l':
                query = "SELECT datname FROM pg_database;"
            elif query.startswith('\\d '):
                table_name = query.split()[1]
                query = f"""
                    SELECT column_name, data_type, character_maximum_length, is_nullable
                    FROM information_schema.columns
                    WHERE table_name = '{table_name}'
                    ORDER BY ordinal_position;
                """

            # Execute query
            cur.execute(query)

            # Check if query returns results
            if cur.description:
                rows = cur.fetchall()

                # Print column names
                col_names = [desc[0] for desc in cur.description]
                print("\n" + " | ".join(col_names))
                print("-" * 80)

                # Print rows
                if rows:
                    for row in rows:
                        print(" | ".join(str(val) if val is not None else 'NULL' for val in row))
                    print(f"\n({len(rows)} rows)")
                else:
                    print("(0 rows)")
            else:
                print("Query executed successfully")

        except psycopg2.Error as e:
            print(f"Error: {e}")
        except KeyboardInterrupt:
            print("\nUse 'exit' or 'quit' to disconnect")
        except EOFError:
            print("\nDisconnecting...")
            break

    cur.close()
    conn.close()
    print("✓ Disconnected")

except Exception as e:
    print(f"Connection error: {e}", file=sys.stderr)
    sys.exit(1)
