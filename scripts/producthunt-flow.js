/**
 * Product Hunt workflow runner using the MCP Streamable HTTP client.
 *
 * Steps performed:
 * 1. Create/reuse a Browserbase session and capture flowState.
 * 2. Navigate to Product Hunt.
 * 3. Deterministically fill the search bar with "Top AI products".
 * 4. Run the search, extract the first five AI product names, and paste them back.
 * 5. Close the session and attempt deterministic replay using the captured flowState.
 *
 * Run with:
 *   node scripts/producthunt-flow.js
 */

const path = require('path');

const MCP_URL = process.env.MCP_URL || 'https://browserbase-mcp-server.vercel.app/api/mcp';
const CACHE_KEY = `producthunt-flow-${Date.now()}`;

const sdkClientPath = path.resolve(__dirname, '../node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js');
const sdkTransportPath = path.resolve(__dirname, '../node_modules/@modelcontextprotocol/sdk/dist/cjs/client/streamableHttp.js');
// eslint-disable-next-line import/no-dynamic-require, global-require
const { Client } = require(sdkClientPath);
// eslint-disable-next-line import/no-dynamic-require, global-require
const { StreamableHTTPClientTransport } = require(sdkTransportPath);

function logSection(title) {
  console.log('\n' + '-'.repeat(80));
  console.log(title);
  console.log('-'.repeat(80));
}

function extractJsonBlock(text) {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function extractFlowState(content) {
  if (!Array.isArray(content)) return null;
  for (const item of content) {
    if (item.type === 'text' && item.text.includes('"actions"')) {
      const parsed = extractJsonBlock(item.text);
      if (parsed) {
        return parsed;
      }
    }
  }
  return null;
}

function extractObservations(content) {
  if (!Array.isArray(content)) return null;
  for (const item of content) {
    if (item.type === 'text' && item.text.includes('"selector"')) {
      const start = item.text.indexOf('[');
      const end = item.text.lastIndexOf(']');
      if (start !== -1 && end !== -1 && end > start) {
        try {
          const parsed = JSON.parse(item.text.slice(start, end + 1));
          if (Array.isArray(parsed)) return parsed;
        } catch {
          // ignore parse errors
        }
      }
    }
  }
  return null;
}

async function connectClient() {
  const client = new Client(
    {
      name: 'producthunt-flow-tester',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  const transport = new StreamableHTTPClientTransport(MCP_URL, {
    requestInit: {
      headers: {
        'User-Agent': 'producthunt-flow-tester/1.0',
      },
    },
  });

  transport.onerror = (error) => {
    console.error('[Transport] error', error);
  };

  client.onerror = (error) => {
    console.error('[Client] error', error);
  };

  await client.connect(transport);
  console.log('Connected to MCP server.');

  const tools = await client.listTools();
  console.log('Available tools:', tools.tools.map((tool) => tool.name).join(', '));

  return { client, transport };
}

async function callTool(client, name, args) {
  logSection(`Calling ${name}`);
  console.log('Arguments:', JSON.stringify(args, null, 2));
  const result = await client.callTool({
    name,
    arguments: args,
  });
  console.dir(result, { depth: null });
  const flowState = extractFlowState(result.content);
  if (flowState) {
    console.log('flowState snapshot:', JSON.stringify(flowState, null, 2));
  }
  return { result, flowState };
}

function parseProducts(content) {
  if (!Array.isArray(content)) return [];
  for (const item of content) {
    if (item.type === 'text') {
      const parsed = extractJsonBlock(item.text);
      if (parsed?.products && Array.isArray(parsed.products)) {
        return parsed.products;
      }
      if (parsed?.extraction) {
        try {
          const extractionJson = JSON.parse(parsed.extraction);
          if (Array.isArray(extractionJson.products)) {
            return extractionJson.products;
          }
        } catch {
          // ignore parse errors
        }
      }
    }
  }
  return [];
}

async function main() {
  const { client, transport } = await connectClient();
  let flowState = { cacheKey: CACHE_KEY };

  try {
    // Session create
    let response = await callTool(client, 'browserbase_session_create', { flowState });
    flowState = response.flowState || flowState;

    // Navigate
    response = await callTool(client, 'browserbase_stagehand_navigate', {
      url: 'https://www.producthunt.com/',
      flowState,
    });
    flowState = response.flowState || flowState;

    // Observe search box
    const searchObs = await callTool(client, 'browserbase_stagehand_observe', {
      instruction:
        'Find the main search input field (or search icon that reveals the input) near the top navigation bar. Return a deterministic selector ready for fill or click.',
      returnAction: true,
      flowState,
    });
    const observations = extractObservations(searchObs.result.content);
    if (observations && observations.length > 0) {
      observations[0].arguments = ['Top AI products'];
      response = await callTool(client, 'browserbase_stagehand_act', {
        observation: observations[0],
        flowState,
      });
      flowState = response.flowState || flowState;
    } else {
      console.warn('Search input observation not found. Falling back to natural-language action.');
      response = await callTool(client, 'browserbase_stagehand_act', {
        action: 'Open the search UI on Product Hunt, focus the search input, and type "Top AI products".',
        flowState,
      });
      flowState = response.flowState || flowState;
    }

    // Press Enter (natural language)
    response = await callTool(client, 'browserbase_stagehand_act', {
      action: 'Press Enter/Return to submit the search query.',
      flowState,
    });
    flowState = response.flowState || flowState;

    // Extract product names
    const extractResult = await callTool(client, 'browserbase_stagehand_extract', {
      instruction:
        'Read the page and respond with JSON {"products": ["name1", "name2", "name3", "name4", "name5"]} that lists the first five AI products currently visible.',
      flowState,
    });
    const products = parseProducts(extractResult.result.content);
    console.log('Extracted products:', products);

    // Paste names back into search field deterministically
    if (products.length > 0) {
      const pasteObs = await callTool(client, 'browserbase_stagehand_observe', {
        instruction: 'Re-select the search input field for deterministic filling.',
        returnAction: true,
        flowState,
      });
      const pasteObservations = extractObservations(pasteObs.result.content);
      if (pasteObservations && pasteObservations.length > 0) {
        pasteObservations[0].arguments = [products.join('\n')];
        response = await callTool(client, 'browserbase_stagehand_act', {
          observation: pasteObservations[0],
          flowState,
        });
        flowState = response.flowState || flowState;
      } else {
        console.warn('Unable to reselect search field for pasting product names.');
      }
    }

    // Close session
    await callTool(client, 'browserbase_session_close', {});

    // Replay deterministic flow if we have actions
    console.log('Final flowState:', JSON.stringify(flowState, null, 2));
    if (flowState.actions && flowState.actions.length > 0) {
      await callTool(client, 'browserbase_stagehand_act', {
        replayState: flowState,
      });
    } else {
      console.warn('FlowState has no actions; skipping replay.');
    }
  } finally {
    await client.close();
    if (transport.close) {
      transport.close();
    }
  }
}

main().catch((error) => {
  console.error('Workflow failed:', error);
  process.exit(1);
});

