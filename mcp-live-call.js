/**
 * Minimal live MCP caller for manual terminal workflows.
 * - Persists latest flowState in .flowstate-live.json
 * - Prints raw responses and extracted session info
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const sdkClientPath = path.resolve(__dirname, 'node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js');
const sdkTransportPath = path.resolve(__dirname, 'node_modules/@modelcontextprotocol/sdk/dist/cjs/client/streamableHttp.js');
const { Client } = require(sdkClientPath);
const { StreamableHTTPClientTransport } = require(sdkTransportPath);

const MCP_URL = process.env.MCP_URL || process.env.LOCAL_MCP_URL || 'http://localhost:3000/api/mcp';
const FLOWSTATE_PATH = path.resolve(__dirname, '.flowstate-live.json');

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help')) {
  console.log('Usage: node mcp-live-call.js <toolName> [--args="{...}"] [--reset] [--show-flow]');
  console.log('Env: MCP_URL or LOCAL_MCP_URL to point at server (default http://localhost:3000/api/mcp)');
  process.exit(0);
}

const showFlow = args.includes('--show-flow');
const reset = args.includes('--reset');

function loadFlowState() {
  if (!fs.existsSync(FLOWSTATE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(FLOWSTATE_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function saveFlowState(flowState) {
  fs.writeFileSync(FLOWSTATE_PATH, JSON.stringify(flowState, null, 2));
}

function extractFlowState(content) {
  if (!Array.isArray(content)) return null;
  for (const item of content) {
    if (item.type === 'text' && item.text) {
      const match = item.text.match(/flowState\s*\(persist externally\):\s*(\{[\s\S]*\})/);
      if (match) {
        try {
          return JSON.parse(match[1]);
        } catch {
          continue;
        }
      }
    }
  }
  return null;
}

if (reset && fs.existsSync(FLOWSTATE_PATH)) {
  fs.unlinkSync(FLOWSTATE_PATH);
  console.log('🧹 Cleared saved flowState');
  if (args.length === 1) process.exit(0);
}

const currentFlowState = loadFlowState();

if (showFlow) {
  console.log('📄 Current flowState:', currentFlowState || '(none)');
  process.exit(0);
}

const toolName = args[0];
let argString = args.find((arg) => arg.startsWith('--args='))?.split('=')[1];
if (argString && ((argString.startsWith('"') && argString.endsWith('"')) || (argString.startsWith("'") && argString.endsWith("'")))) {
  argString = argString.slice(1, -1);
}

let toolArgs = {};
if (argString) {
  try {
    toolArgs = JSON.parse(argString);
  } catch (error) {
    console.error('❌ Failed to parse --args JSON:', error.message);
    process.exit(1);
  }
}

const kvArgs = args
  .filter((arg) => arg.startsWith('--kv='))
  .map((arg) => {
    let val = arg.replace(/^--kv=/, '');
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    return val;
  });

for (const kv of kvArgs) {
  const [key, ...rest] = kv.split('=');
  if (!key) continue;
  const value = rest.join('=') || '';
  if (value === 'true') {
    toolArgs[key] = true;
  } else if (value === 'false') {
    toolArgs[key] = false;
  } else if (!Number.isNaN(Number(value)) && value.trim() !== '') {
    toolArgs[key] = Number(value);
  } else {
    toolArgs[key] = value;
  }
}

if (currentFlowState && toolName !== 'browserbase_session_create' && toolName !== 'browserbase_session_close') {
  toolArgs.flowState = toolArgs.flowState || currentFlowState;
}

(async () => {
  let client;
  try {
    console.log(`🔌 MCP URL: ${MCP_URL}`);
    console.log(`🛠  Tool: ${toolName}`);
    console.log(`📤 Arguments: ${JSON.stringify(toolArgs, null, 2)}\n`);

    const transport = new StreamableHTTPClientTransport(MCP_URL);
    client = new Client({ name: 'mcp-live-terminal', version: '1.0.0' });
    await client.connect(transport);

    const result = await client.callTool({ name: toolName, arguments: toolArgs });

    console.log('📥 Raw Response:');
    console.dir(result, { depth: 5, colors: true });

    const newFlow = extractFlowState(result.content);
    if (newFlow) {
      console.log('\n💾 Updated flowState stored to .flowstate-live.json');
      saveFlowState(newFlow);
      if (newFlow.browserbaseSessionId) {
        console.log('🛰  Session Inspector: https://www.browserbase.com/sessions/' + newFlow.browserbaseSessionId);
      }
    } else if (currentFlowState) {
      console.log('\nℹ️  No flowState found in response; keeping existing snapshot.');
    }
  } catch (error) {
    console.error('\n❌ MCP call failed:', error.message);
    process.exit(1);
  } finally {
    if (client) {
      try {
        await client.close();
      } catch {
        // ignore
      }
    }
  }
})(); 

