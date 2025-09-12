CREATE TABLE IF NOT EXISTS canteens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  site VARCHAR(100) NOT NULL,
  name VARCHAR(100) NOT NULL,
  UNIQUE KEY unique_site_canteen (site, name)
);
CREATE TABLE IF NOT EXISTS feedback (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  site VARCHAR(100) NOT NULL,
  canteen_id INT NOT NULL,
  question_id VARCHAR(100) NOT NULL,
  rating INT NOT NULL,
  name VARCHAR(100) DEFAULT NULL,
  username VARCHAR(100) DEFAULT NULL,
  timestamp BIGINT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (canteen_id) REFERENCES canteens(id)
);
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  site VARCHAR(100) NOT NULL,
  username VARCHAR(100) NOT NULL,
  password VARCHAR(255) NOT NULL,
  UNIQUE KEY unique_site_username (site, username)
);

CREATE TABLE IF NOT EXISTS questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  site VARCHAR(100) NOT NULL,
  question_text VARCHAR(500) NOT NULL,
  emoji VARCHAR(10) DEFAULT NULL
);

-- Seed static questions for all sites
INSERT INTO questions (site, question_text, emoji) VALUES
  ('Site A', 'How was the taste of the food?', '😀'),
  ('Site A', 'Was the food served hot and fresh?', '🙂'),
  ('Site A', 'How was the cleanliness of the dining area?', '😐'),
  ('Site A', 'Was the staff polite and helpful?', '😞'),
  ('Site A', 'Would you recommend our canteen to others?', '👍'),
  ('Site B', 'How was the taste of the food?', '😀'),
  ('Site B', 'Was the food served hot and fresh?', '🙂'),
  ('Site B', 'How was the cleanliness of the dining area?', '😐'),
  ('Site B', 'Was the staff polite and helpful?', '😞'),
  ('Site B', 'Would you recommend our canteen to others?', '👍'),
  ('Site C', 'How was the taste of the food?', '😀'),
  ('Site C', 'Was the food served hot and fresh?', '🙂'),
  ('Site C', 'How was the cleanliness of the dining area?', '😐'),
  ('Site C', 'Was the staff polite and helpful?', '😞'),
  ('Site C', 'Would you recommend our canteen to others?', '👍'),
  ('Site D', 'How was the taste of the food?', '😀'),
  ('Site D', 'Was the food served hot and fresh?', '🙂'),
  ('Site D', 'How was the cleanliness of the dining area?', '😐'),
  ('Site D', 'Was the staff polite and helpful?', '😞'),
  ('Site D', 'Would you recommend our canteen to others?', '👍'),
  ('Site E', 'How was the taste of the food?', '😀'),
  ('Site E', 'Was the food served hot and fresh?', '🙂'),
  ('Site E', 'How was the cleanliness of the dining area?', '😐'),
  ('Site E', 'Was the staff polite and helpful?', '😞'),
  ('Site E', 'Would you recommend our canteen to others?', '👍');
