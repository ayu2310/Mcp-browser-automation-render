/**
 * Complex workflow: ProductHunt → Extract Top 5 AI Products → Paste to OnlineNotepad
 * 
 * This script demonstrates a real-world complex workflow:
 * 1. Navigate to ProductHunt
 * 2. Find top 5 trending AI products
 * 3. Extract product names
 * 4. Navigate to onlinenotepad.io
 * 5. Paste the product names
 * 
 * Run with:
 *   node scripts/complex-workflow.js
 */

const path = require('path');

const MCP_URL = process.env.MCP_URL || 'https://browserbase-mcp-server.vercel.app/api/mcp';
const CACHE_KEY = `complex-workflow-${Date.now()}`;

const sdkClientPath = path.resolve(__dirname, '../node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js');
const sdkTransportPath = path.resolve(__dirname, '../node_modules/@modelcontextprotocol/sdk/dist/cjs/client/streamableHttp.js');
// eslint-disable-next-line import/no-dynamic-require, global-require
const { Client } = require(sdkClientPath);
// eslint-disable-next-line import/no-dynamic-require, global-require
const { StreamableHTTPClientTransport } = require(sdkTransportPath);

function logSection(title) {
  console.log('\n' + '='.repeat(80));
  console.log(title);
  console.log('='.repeat(80));
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
    if (item.type === 'text' && item.text.includes('flowState')) {
      const parsed = extractJsonBlock(item.text);
      if (parsed && (parsed.cacheKey || parsed.actions || parsed.browserbaseSessionId)) {
        return parsed;
      }
    }
  }
  return null;
}

function extractProductsFromExtract(text) {
  if (!text) return [];
  try {
    // Try to find JSON in the extraction text
    const jsonMatch = text.match(/\{"products":\s*\[.*?\]\}/s);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.products)) {
        return parsed.products.filter(p => p && typeof p === 'string');
      }
    }
    // Try alternative format
    const altMatch = text.match(/products["\s:]*\[(.*?)\]/s);
    if (altMatch) {
      const productsStr = altMatch[1];
      const products = productsStr.split(',').map(p => p.trim().replace(/^["']|["']$/g, ''));
      return products.filter(p => p);
    }
  } catch (e) {
    console.log('Failed to parse products:', e.message);
  }
  return [];
}

async function main() {
  let client;
  let flowState = { cacheKey: CACHE_KEY };

  try {
    logSection('Connecting to MCP Server');
    const transport = new StreamableHTTPClientTransport(MCP_URL);
    client = new Client({ name: 'complex-workflow-client', version: '1.0.0' });
    
    client.onerror = (error) => {
      console.error('[Client Error]:', error);
    };

    await client.connect(transport);
    console.log('Connected to MCP server.');

    const toolsResult = await client.listTools();
    console.log(`Available tools: ${toolsResult.tools.map(t => t.name).join(', ')}`);

    // Step 1: Create session
    logSection('Step 1: Creating Browserbase Session');
    const sessionResult = await client.callTool({
      name: 'browserbase_session_create',
      arguments: { flowState }
    });
    console.log('Session result:', JSON.stringify(sessionResult.content, null, 2));
    flowState = extractFlowState(sessionResult.content) || flowState;
    console.log('flowState after session:', JSON.stringify(flowState, null, 2));

    // Step 2: Navigate to ProductHunt
    logSection('Step 2: Navigating to ProductHunt');
    const navResult = await client.callTool({
      name: 'browserbase_stagehand_navigate',
      arguments: {
        url: 'https://www.producthunt.com/',
        flowState
      }
    });
    console.log('Navigation result:', JSON.stringify(navResult.content, null, 2));
    flowState = extractFlowState(navResult.content) || flowState;
    console.log('flowState after navigation:', JSON.stringify(flowState, null, 2));

    // Step 3: Search for AI products
    logSection('Step 3: Searching for AI Products');
    const searchAction = await client.callTool({
      name: 'browserbase_stagehand_act',
      arguments: {
        action: 'Click on the search icon or search bar, type "AI" and press Enter to search for AI products on Product Hunt',
        flowState
      }
    });
    console.log('Search action result:', JSON.stringify(searchAction.content, null, 2));
    flowState = extractFlowState(searchAction.content) || flowState;

    // Wait a bit for results to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 4: Extract top 5 trending AI products
    logSection('Step 4: Extracting Top 5 Trending AI Products');
    const extractResult = await client.callTool({
      name: 'browserbase_stagehand_extract',
      arguments: {
        instruction: 'Extract the names of the top 5 trending AI products currently visible on this Product Hunt page. Return JSON in this exact format: {"products": ["Product Name 1", "Product Name 2", "Product Name 3", "Product Name 4", "Product Name 5"]}. Only include product names, no descriptions or other text.'
      }
    });
    console.log('Extract result:', JSON.stringify(extractResult.content, null, 2));
    
    // Parse products from extraction
    const extractText = extractResult.content.find(c => c.type === 'text')?.text || '';
    const products = extractProductsFromExtract(extractText);
    console.log('Extracted products:', products);

    if (products.length === 0) {
      console.log('⚠️  No products extracted. Trying alternative extraction...');
      // Try a more detailed extraction
      const altExtract = await client.callTool({
        name: 'browserbase_stagehand_extract',
        arguments: {
          instruction: 'Look at the product cards on this Product Hunt page. Extract exactly 5 product names that are AI-related. Return them as a JSON array: ["name1", "name2", "name3", "name4", "name5"]'
        }
      });
      const altText = altExtract.content.find(c => c.type === 'text')?.text || '';
      const altProducts = extractProductsFromExtract(altText);
      if (altProducts.length > 0) {
        products.push(...altProducts.slice(0, 5));
      }
    }

    if (products.length === 0) {
      throw new Error('Failed to extract any products from Product Hunt');
    }

    // Take top 5
    const top5Products = products.slice(0, 5);
    console.log(`✅ Successfully extracted ${top5Products.length} products:`, top5Products);

    // Step 5: Navigate to OnlineNotepad
    logSection('Step 5: Navigating to OnlineNotepad');
    const notepadNavResult = await client.callTool({
      name: 'browserbase_stagehand_navigate',
      arguments: {
        url: 'https://www.onlinenotepad.io/',
        flowState
      }
    });
    console.log('Notepad navigation result:', JSON.stringify(notepadNavResult.content, null, 2));
    flowState = extractFlowState(notepadNavResult.content) || flowState;

    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 6: Paste product names
    logSection('Step 6: Pasting Product Names to OnlineNotepad');
    const productList = top5Products.map((p, i) => `${i + 1}. ${p}`).join('\n');
    const pasteAction = await client.callTool({
      name: 'browserbase_stagehand_act',
      arguments: {
        action: `Click on the main text area/editor on this page, then type or paste the following list of products:\n\n${productList}\n\nMake sure the text appears in the editor.`,
        flowState
      }
    });
    console.log('Paste action result:', JSON.stringify(pasteAction.content, null, 2));
    flowState = extractFlowState(pasteAction.content) || flowState;

    // Step 7: Verify the paste worked
    logSection('Step 7: Verifying Content');
    await new Promise(resolve => setTimeout(resolve, 2000));
    const verifyExtract = await client.callTool({
      name: 'browserbase_stagehand_extract',
      arguments: {
        instruction: 'Extract the text content from the main editor/text area on this page. Return it as plain text.'
      }
    });
    const verifiedText = verifyExtract.content.find(c => c.type === 'text')?.text || '';
    console.log('Verified content:', verifiedText.substring(0, 500));

    // Final flowState
    logSection('Final FlowState');
    console.log(JSON.stringify(flowState, null, 2));

    logSection('✅ Workflow Completed Successfully!');
    console.log(`Extracted ${top5Products.length} products:`);
    top5Products.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
    console.log('\nProducts have been pasted to onlinenotepad.io');

  } catch (error) {
    console.error('\n❌ Workflow failed:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    if (client) {
      try {
        await client.close();
      } catch (e) {
        // Ignore close errors
      }
    }
  }
}

main().catch(console.error);


