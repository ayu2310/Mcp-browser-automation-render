/**
 * Inspect Browserbase Session
 * 
 * Fetches session details and logs from Browserbase API
 */

const https = require('https');

const BROWSERBASE_API_KEY = process.env.BROWSERBASE_API_KEY;
const BROWSERBASE_PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID;

if (!BROWSERBASE_API_KEY || !BROWSERBASE_PROJECT_ID) {
  console.error('❌ BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID must be set');
  process.exit(1);
}

async function fetchSession(sessionId) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.browserbase.com',
      path: `/v1/sessions/${sessionId}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${BROWSERBASE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    };

    https.get(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse response: ${e.message}`));
          }
        } else {
          reject(new Error(`API returned ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

async function fetchSessionLogs(sessionId) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.browserbase.com',
      path: `/v1/sessions/${sessionId}/logs`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${BROWSERBASE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    };

    https.get(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse response: ${e.message}`));
          }
        } else {
          reject(new Error(`API returned ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

async function main() {
  const sessionId = process.argv[2];
  
  if (!sessionId) {
    console.error('Usage: node inspect-browserbase-session.js <sessionId>');
    console.error('Example: node inspect-browserbase-session.js abc-123-def-456');
    process.exit(1);
  }
  
  console.log(`\n🔍 Inspecting Browserbase Session: ${sessionId}\n`);
  
  try {
    // Fetch session details
    console.log('📋 Fetching session details...');
    const session = await fetchSession(sessionId);
    console.log('✅ Session details:');
    console.log(JSON.stringify(session, null, 2));
    console.log();
    
    // Fetch session logs
    console.log('📋 Fetching session logs...');
    const logs = await fetchSessionLogs(sessionId);
    console.log('✅ Session logs:');
    console.log(JSON.stringify(logs, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('401') || error.message.includes('403')) {
      console.error('   Check your BROWSERBASE_API_KEY');
    }
  }
}

main().catch(console.error);




