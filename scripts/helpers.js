/**
 * Shared Helper Functions
 * 
 * Common utilities for MCP client scripts
 */

/**
 * Extract session ID from MCP response
 */
function extractSessionId(content) {
  if (!Array.isArray(content)) return null;
  for (const item of content) {
    if (item.type === 'text' && item.text) {
      const match = item.text.match(/sessions\/([a-f0-9-]+)/i);
      if (match) {
        return match[1];
      }
    }
  }
  return null;
}

/**
 * Extract observations from observe response
 * Handles the format: "Observations: [{\"description\":...}]"
 */
function extractObservations(content) {
  if (!Array.isArray(content)) return [];
  for (const item of content) {
    if (item.type === 'text' && item.text) {
      // Find "Observations: " and extract the array
      const observationsMatch = item.text.match(/Observations:\s*(.+)/);
      if (observationsMatch) {
        try {
          // The matched string is a JSON array (might be escaped)
          const jsonStr = observationsMatch[1];
          const observations = JSON.parse(jsonStr);
          if (Array.isArray(observations)) {
            return observations;
          }
        } catch (e) {
          // If direct parse fails, try extracting array manually
          try {
            const arrayStart = item.text.indexOf('[');
            const arrayEnd = item.text.lastIndexOf(']');
            if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
              const arrayStr = item.text.substring(arrayStart, arrayEnd + 1);
              // Unescape if needed
              const unescaped = arrayStr.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
              const observations = JSON.parse(unescaped);
              if (Array.isArray(observations)) {
                return observations;
              }
            }
          } catch (e2) {
            // Continue
          }
        }
      }
      
      // Also try direct JSON array pattern
      const arrayMatch = item.text.match(/\[[\s\S]*?\]/);
      if (arrayMatch) {
        try {
          const arrayStr = arrayMatch[0];
          const unescaped = arrayStr.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
          const observations = JSON.parse(unescaped);
          if (Array.isArray(observations)) {
            return observations;
          }
        } catch (e) {
          // Continue
        }
      }
    }
  }
  return [];
}

/**
 * Extract JSON data from extract response
 */
function extractJsonData(content) {
  if (!Array.isArray(content)) return null;
  for (const item of content) {
    if (item.type === 'text' && item.text) {
      // Try to find JSON object
      const jsonMatch = item.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (e) {
          // Continue
        }
      }
    }
  }
  return null;
}

module.exports = {
  extractSessionId,
  extractObservations,
  extractJsonData
};

