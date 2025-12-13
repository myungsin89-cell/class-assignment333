import sqlite3
import json
import os
import random
import sys

def run():
    # Locate DB
    db_paths = ['students.db', '../students.db']
    db_path = None
    for p in db_paths:
        if os.path.exists(p):
            db_path = p
            break
            
    if not db_path:
        print("Error: students.db not found.")
        sys.exit(1)

    print(f"Connecting to {os.path.abspath(db_path)}")
    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    try:
        # 1. Ensure School
        c.execute("SELECT id FROM schools WHERE name = ?", ('test',))
        row = c.fetchone()
        if row:
            school_id = row[0]
        else:
            c.execute("INSERT INTO schools (name, password) VALUES (?, ?)", ('test', 'test'))
            school_id = c.lastrowid
        print(f"School ID: {school_id}")

        # 2. Ensure Class (Grade 2, 3 Sections)
        grade = 2
        section_count = 3
        
        c.execute("SELECT id, section_count FROM classes WHERE school_id = ? AND grade = ?", (school_id, grade))
        row = c.fetchone()
        
        if row:
            class_id = row[0]
            # Update section count to 3 if different
            if row[1] != section_count:
                c.execute("UPDATE classes SET section_count = ? WHERE id = ?", (section_count, class_id))
        else:
            statuses = {str(i): 'in_progress' for i in range(1, section_count + 1)}
            c.execute("INSERT INTO classes (school_id, grade, section_count, section_statuses) VALUES (?, ?, ?, ?)", 
                      (school_id, grade, section_count, json.dumps(statuses)))
            class_id = c.lastrowid
        print(f"Class ID: {class_id}")

        # 3. Populate Students
        last_names = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권']
        first_names = ['민준', '서준', '도윤', '예준', '시우', '하준', '지호', '지유', '서윤', '서연', '민서', '지우', '하은', '지아', '서현', '지민', '수빈']
        
        c.execute("DELETE FROM students WHERE class_id = ?", (class_id,))
        print("Cleared existing students.")

        count = 0
        grouped_count = 0
        
        for section in range(1, section_count + 1):
            for i in range(1, 16): # 15 students
                last = random.choice(last_names)
                first = random.choice(first_names)
                name = last + first
                gender = 'M' if random.random() > 0.5 else 'F'
                
                is_problem = 1 if random.random() < 0.1 else 0
                is_special = 1 if random.random() < 0.05 else 0
                
                # Separation: Group1 (1-3), Group2 (13-15)
                group_name = ''
                if i <= 3: 
                    group_name = '그룹1'
                elif i >= 13: 
                    group_name = '그룹2'
                
                if group_name:
                    grouped_count += 1
                
                # Unique Rank across the class (1..45)
                # rank = (section - 1) * 15 + i
                # Or simply 'count + 1' since we loop sequentially
                rank = count + 1 
                
                c.execute("""
                    INSERT INTO students (class_id, section, name, gender, is_problem_student, is_special_class, is_underachiever, group_name, rank)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (class_id, section, name, gender, is_problem, is_special, 0, group_name, rank))
                count += 1
        
        print(f"Inserted {count} students. (Groups: {grouped_count})")

        # 4. Mark Completed
        statuses = {str(i): 'completed' for i in range(1, section_count + 1)}
        c.execute("UPDATE classes SET section_statuses = ? WHERE id = ?", (json.dumps(statuses), class_id))
        print("Marked sections as completed.")

        conn.commit()
        print("Success!")

    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
    finally:
        conn.close()

if __name__ == '__main__':
    run()
