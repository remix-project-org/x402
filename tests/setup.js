import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load test environment variables from .env.test
dotenv.config({ path: join(__dirname, '..', '.env.test'), quiet: true });

console.log('🧪 E2E Test Environment Loaded');
console.log(`📡 MCP Server URL: ${process.env.MCP_SERVER_URL || 'http://localhost:8000/mcp'}`);
console.log(`🌐 Network: ${process.env.NETWORK || 'base-sepolia'}`);
