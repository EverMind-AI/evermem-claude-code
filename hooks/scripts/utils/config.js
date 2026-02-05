/**
 * Configuration loader for EverMem plugin
 * Reads settings from environment variables
 */

const API_BASE_URL = 'https://api.evermind.ai';

/**
 * Get the EverMem API key from environment
 * @returns {string|null} API key or null if not set
 */
export function getApiKey() {
  return process.env.EVERMEM_API_KEY || null;
}

/**
 * Get the user ID for memory operations
 * Defaults to 'claude-code-user' if not set
 * @returns {string} User ID
 */
export function getUserId() {
  return process.env.EVERMEM_USER_ID || 'claude-code-user';
}

/**
 * Get the group ID for memory operations
 * Uses project working directory as default group
 * @returns {string} Group ID
 */
export function getGroupId() {
  if (process.env.EVERMEM_GROUP_ID) {
    return process.env.EVERMEM_GROUP_ID;
  }
  // Use EVERMEM_CWD (set from hook input) or fall back to process.cwd()
  const cwd = process.env.EVERMEM_CWD || process.cwd();
  return `claude-code:${cwd.replace(/[^a-zA-Z0-9-_/]/g, '_')}`;
}

/**
 * Get the API base URL
 * @returns {string} Base URL
 */
export function getApiBaseUrl() {
  return process.env.EVERMEM_API_URL || API_BASE_URL;
}

/**
 * Check if the plugin is properly configured
 * @returns {boolean} True if API key is set
 */
export function isConfigured() {
  return !!getApiKey();
}

/**
 * Get full configuration object
 * @returns {Object} Configuration
 */
export function getConfig() {
  return {
    apiKey: getApiKey(),
    userId: getUserId(),
    groupId: getGroupId(),
    apiBaseUrl: getApiBaseUrl(),
    isConfigured: isConfigured()
  };
}
