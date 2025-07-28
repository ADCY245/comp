<?php
/**
 * MongoDB Database Configuration
 * This file handles the connection to MongoDB for PHP authentication
 */

require_once __DIR__ . '/../vendor/autoload.php';

class DatabaseConfig {
    private static $instance = null;
    private $client;
    private $database;
    
    private function __construct() {
        try {
            // Get MongoDB URI from environment or use default
            $mongoUri = $_ENV['MONGO_URI'] ?? 'mongodb://localhost:27017';
            $dbName = $_ENV['DB_NAME'] ?? 'moneda_db';
            
            // Create MongoDB client
            $this->client = new MongoDB\Client($mongoUri, [
                'serverSelectionTryOnce' => false,
                'serverSelectionTimeoutMS' => 5000,
                'connectTimeoutMS' => 10000,
                'socketTimeoutMS' => 10000,
            ]);
            
            // Select database
            $this->database = $this->client->selectDatabase($dbName);
            
            // Test connection
            $this->client->selectDatabase('admin')->command(['ping' => 1]);
            
        } catch (Exception $e) {
            error_log("MongoDB connection failed: " . $e->getMessage());
            throw new Exception("Database connection failed");
        }
    }
    
    public static function getInstance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    public function getDatabase() {
        return $this->database;
    }
    
    public function getUsersCollection() {
        return $this->database->selectCollection('users');
    }
    
    public function getCompaniesCollection() {
        return $this->database->selectCollection('companies');
    }
    
    public function getQuotationsCollection() {
        return $this->database->selectCollection('quotations');
    }
}

// Load environment variables
if (file_exists(__DIR__ . '/../../.env')) {
    $lines = file(__DIR__ . '/../../.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos($line, '=') !== false && strpos($line, '#') !== 0) {
            list($key, $value) = explode('=', $line, 2);
            $_ENV[trim($key)] = trim($value);
        }
    }
}
?>
