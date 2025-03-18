-- Users table
CREATE TABLE IF NOT EXISTS users (
    user_id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Login attempts table for rate limiting
CREATE TABLE IF NOT EXISTS login_attempts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(100) NOT NULL,
    attempt_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_email_time (email, attempt_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User activity log
CREATE TABLE IF NOT EXISTS user_activity_log (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    activity_type VARCHAR(50) NOT NULL,
    activity_details TEXT,
    ip_address VARCHAR(45),
    user_agent VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_user_activity (user_id, activity_type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    token VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    UNIQUE INDEX idx_token (token),
    INDEX idx_user_token (user_id, token, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create view for user status
CREATE OR REPLACE VIEW user_status_view AS
SELECT 
    u.user_id,
    u.username,
    u.email,
    u.status,
    COUNT(DISTINCT l.id) as failed_attempts,
    MAX(l.attempt_time) as last_attempt
FROM users u
LEFT JOIN login_attempts l ON l.email = u.email 
    AND l.attempt_time > DATE_SUB(NOW(), INTERVAL 15 MINUTE)
GROUP BY u.user_id;

-- Create stored procedure for user authentication
DELIMITER //
CREATE PROCEDURE authenticate_user(IN p_email VARCHAR(100))
BEGIN
    SELECT 
        u.user_id,
        u.username,
        u.email,
        u.full_name,
        u.password_hash,
        u.status,
        COUNT(l.id) as login_attempts
    FROM users u
    LEFT JOIN login_attempts l ON l.email = u.email 
        AND l.attempt_time > DATE_SUB(NOW(), INTERVAL 15 MINUTE)
    WHERE u.email = p_email
    GROUP BY u.user_id;
END //
DELIMITER ;

-- Create function to check if user is locked out
DELIMITER //
CREATE FUNCTION is_user_locked_out(p_email VARCHAR(100)) 
RETURNS BOOLEAN
DETERMINISTIC
BEGIN
    DECLARE attempt_count INT;
    
    SELECT COUNT(*) INTO attempt_count
    FROM login_attempts
    WHERE email = p_email
    AND attempt_time > DATE_SUB(NOW(), INTERVAL 15 MINUTE);
    
    RETURN attempt_count >= 5;
END //
DELIMITER ; 