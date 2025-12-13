
-- Table: classes
DROP TABLE IF EXISTS classes CASCADE;
INSERT INTO classes (id, school_id, grade, section_count, is_distributed, parent_class_id, section_statuses, created_at) VALUES (1, 1, 4, 5, False, NULL, '{}', 2025-12-08 11:49:16.085342);
INSERT INTO classes (id, school_id, grade, section_count, is_distributed, parent_class_id, section_statuses, created_at) VALUES (2, 2, 3, 15, False, NULL, '{}', 2025-12-08 11:52:47.571931);


-- Table: schools
DROP TABLE IF EXISTS schools CASCADE;
INSERT INTO schools (id, name, password, created_at) VALUES (1, '이음초등학', '$2b$10$AY9gGuPggCfrc55Gvf0KMezpgPG45WU309Pj5Ew6Erm70afPA/Pl6', 2025-12-08 11:48:56.102929);
INSERT INTO schools (id, name, password, created_at) VALUES (2, '이음초', '$2b$10$3rfMI1d6bC1M2h.FtBQcXud8lAgM3NLsmKFUhyhFmytoBXb2r7iDS', 2025-12-08 11:52:33.849370);


-- Table: students
DROP TABLE IF EXISTS students CASCADE;

