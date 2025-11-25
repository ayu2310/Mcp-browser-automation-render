/**
 * MCP Client Executor - Direct MCP Server Execution
 * 
 * This script provides multiple functions to execute complex tasks using the
 * Browserbase MCP Server deployed on Vercel, WITHOUT using an LLM.
 * 
 * Uses: https://browserbase-mcp-server-iub9cl6kc-ayus-projects-56bd70c3.vercel.app/api/mcp
 * 
 * Run with:
 *   node scripts/mcp-client-executor.js
 */

const path = require('path');
const fs = require('fs').promises;

// MCP Server URL from MCP_SERVER_GUIDE.md
const MCP_URL = 'https://browserbase-mcp-server-iub9cl6kc-ayus-projects-56bd70c3.vercel.app/api/mcp';

// Load MCP SDK
const sdkClientPath = path.resolve(__dirname, '../node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js');
const sdkTransportPath = path.resolve(__dirname, '../node_modules/@modelcontextprotocol/sdk/dist/cjs/client/streamableHttp.js');
const { Client } = require(sdkClientPath);
const { StreamableHTTPClientTransport } = require(sdkTransportPath);

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

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

function extractObservations(content) {
  if (!Array.isArray(content)) return [];
  const observations = [];
  for (const item of content) {
    if (item.type === 'text') {
      try {
        // Try to parse JSON array of observations
        const jsonMatch = item.text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed)) {
            observations.push(...parsed);
          }
        }
      } catch (e) {
        // Try extracting single observation
        const single = extractJsonBlock(item.text);
        if (single && single.method) {
          observations.push(single);
        }
      }
    }
  }
  return observations;
}

async function saveFlowState(flowState, filename) {
  const outputDir = path.join(__dirname, '../test-results');
  await fs.mkdir(outputDir, { recursive: true });
  const filepath = path.join(outputDir, filename);
  await fs.writeFile(filepath, JSON.stringify(flowState, null, 2));
  console.log(`💾 FlowState saved to: ${filepath}`);
  return filepath;
}

// ============================================================================
// MCP CLIENT CLASS
// ============================================================================

class MCPClientExecutor {
  constructor(mcpUrl = MCP_URL) {
    this.mcpUrl = mcpUrl;
    this.client = null;
    this.transport = null;
    this.flowState = null;
  }

  async connect() {
    logSection('Connecting to MCP Server');
    this.transport = new StreamableHTTPClientTransport(this.mcpUrl);
    this.client = new Client({ 
      name: 'mcp-executor-client', 
      version: '1.0.0' 
    });
    
    this.client.onerror = (error) => {
      console.error('[Client Error]:', error.message || error);
    };

    await this.client.connect(this.transport);
    console.log(`✅ Connected to MCP server: ${this.mcpUrl}`);
    
    // List available tools
    const toolsResult = await this.client.listTools();
    console.log(`📋 Available tools: ${toolsResult.tools.map(t => t.name).join(', ')}`);
    
    return true;
  }

  async createSession(cacheKey = null) {
    if (!this.client) throw new Error('Not connected. Call connect() first.');
    
    logSection('Creating Browserbase Session');
    const sessionKey = cacheKey || `mcp-session-${Date.now()}`;
    this.flowState = { cacheKey: sessionKey };
    
    const result = await this.client.callTool({
      name: 'browserbase_session_create',
      arguments: { flowState: this.flowState }
    });
    
    this.flowState = extractFlowState(result.content) || this.flowState;
    console.log(`✅ Session created: ${this.flowState.browserbaseSessionId || 'pending'}`);
    console.log(`   Cache key: ${this.flowState.cacheKey}`);
    
    return this.flowState;
  }

  async navigate(url) {
    if (!this.client) throw new Error('Not connected. Call connect() first.');
    if (!this.flowState) throw new Error('No session. Call createSession() first.');
    
    logSection(`Navigating to: ${url}`);
    
    const result = await this.client.callTool({
      name: 'browserbase_stagehand_navigate',
      arguments: {
        url: url,
        flowState: this.flowState
      }
    });
    
    this.flowState = extractFlowState(result.content) || this.flowState;
    console.log(`✅ Navigated successfully`);
    
    return result;
  }

  async act(action, isObservation = false) {
    if (!this.client) throw new Error('Not connected. Call connect() first.');
    if (!this.flowState) throw new Error('No session. Call createSession() first.');
    
    logSection(`Executing Action: ${isObservation ? 'Observation' : 'Natural Language'}`);
    console.log(`Action: ${typeof action === 'string' ? action.substring(0, 100) : JSON.stringify(action).substring(0, 100)}...`);
    
    const args = { flowState: this.flowState };
    if (isObservation) {
      args.observation = action;
    } else {
      args.action = action;
    }
    
    const result = await this.client.callTool({
      name: 'browserbase_stagehand_act',
      arguments: args
    });
    
    this.flowState = extractFlowState(result.content) || this.flowState;
    console.log(`✅ Action executed. Total actions: ${this.flowState.actions?.length || 0}`);
    
    return result;
  }

  async observe(instruction, returnAction = true) {
    if (!this.client) throw new Error('Not connected. Call connect() first.');
    if (!this.flowState) throw new Error('No session. Call createSession() first.');
    
    logSection(`Observing: ${instruction}`);
    
    const result = await this.client.callTool({
      name: 'browserbase_stagehand_observe',
      arguments: {
        instruction: instruction,
        returnAction: returnAction,
        flowState: this.flowState
      }
    });
    
    const observations = extractObservations(result.content);
    console.log(`✅ Found ${observations.length} observation(s)`);
    
    return { result, observations };
  }

  async extract(instruction) {
    if (!this.client) throw new Error('Not connected. Call connect() first.');
    
    logSection(`Extracting: ${instruction}`);
    
    const result = await this.client.callTool({
      name: 'browserbase_stagehand_extract',
      arguments: {
        instruction: instruction
      }
    });
    
    const text = result.content.find(c => c.type === 'text')?.text || '';
    console.log(`✅ Extraction completed`);
    
    return { result, text };
  }

  async screenshot(filename = null) {
    if (!this.client) throw new Error('Not connected. Call connect() first.');
    if (!this.flowState) throw new Error('No session. Call createSession() first.');
    
    logSection('Capturing Screenshot');
    
    const result = await this.client.callTool({
      name: 'browserbase_screenshot',
      arguments: {
        flowState: this.flowState
      }
    });
    
    // Save screenshot if filename provided
    if (filename && result.content) {
      const imageItem = result.content.find(c => c.type === 'image');
      if (imageItem && imageItem.data) {
        const outputDir = path.join(__dirname, '../test-results');
        await fs.mkdir(outputDir, { recursive: true });
        const filepath = path.join(outputDir, filename);
        await fs.writeFile(filepath, Buffer.from(imageItem.data, 'base64'));
        console.log(`💾 Screenshot saved to: ${filepath}`);
      }
    }
    
    console.log(`✅ Screenshot captured`);
    return result;
  }

  async getUrl() {
    if (!this.client) throw new Error('Not connected. Call connect() first.');
    if (!this.flowState) throw new Error('No session. Call createSession() first.');
    
    const result = await this.client.callTool({
      name: 'browserbase_stagehand_get_url',
      arguments: {
        flowState: this.flowState
      }
    });
    
    const url = result.content.find(c => c.type === 'text')?.text || '';
    console.log(`📍 Current URL: ${url}`);
    
    return url;
  }

  async replay(savedFlowState) {
    if (!this.client) throw new Error('Not connected. Call connect() first.');
    
    logSection('Replaying FlowState');
    console.log(`Replaying ${savedFlowState.actions?.length || 0} actions...`);
    
    const result = await this.client.callTool({
      name: 'browserbase_stagehand_act',
      arguments: {
        replayState: savedFlowState
      }
    });
    
    this.flowState = extractFlowState(result.content) || savedFlowState;
    console.log(`✅ Replay completed`);
    
    return result;
  }

  async close() {
    if (this.client) {
      try {
        await this.client.close();
        console.log('✅ Client closed');
      } catch (e) {
        console.error('Error closing client:', e.message);
      }
    }
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// COMPLEX TASK FUNCTIONS
// ============================================================================

/**
 * Task 1: Search Wikipedia and Extract Article Summary
 */
async function task1_SearchAndExtract(mcp) {
  logSection('TASK 1: Search Wikipedia and Extract Article Summary');
  
  await mcp.createSession('task1-wikipedia-search');
  await mcp.navigate('https://en.wikipedia.org/wiki/Main_Page');
  await mcp.sleep(2000);
  
  // Search for "Artificial Intelligence"
  await mcp.act('Click on the search box, type "Artificial Intelligence" and press Enter to search');
  await mcp.sleep(3000);
  
  // Extract article summary
  const { text } = await mcp.extract('Extract the first paragraph of the article summary. Return only the text, no formatting.');
  console.log('\n📄 Article Summary:');
  console.log(text.substring(0, 500) + '...');
  
  // Capture screenshot
  await mcp.screenshot('task1-wikipedia-result.png');
  
  return { summary: text };
}

/**
 * Task 2: Multi-Step Form Filling (Demo Form)
 */
async function task2_MultiStepForm(mcp) {
  logSection('TASK 2: Multi-Step Form Filling');
  
  await mcp.createSession('task2-form-filling');
  
  // Navigate to a demo form site
  await mcp.navigate('https://the-internet.herokuapp.com/login');
  await mcp.sleep(2000);
  
  // Fill username using observation (deterministic)
  const { observations: usernameObs } = await mcp.observe('Find the username input field', true);
  if (usernameObs.length > 0) {
    const usernameAction = {
      ...usernameObs[0],
      arguments: ['tomsmith']
    };
    await mcp.act(usernameAction, true);
  }
  
  // Fill password using observation
  const { observations: passwordObs } = await mcp.observe('Find the password input field', true);
  if (passwordObs.length > 0) {
    const passwordAction = {
      ...passwordObs[0],
      arguments: ['SuperSecretPassword!']
    };
    await mcp.act(passwordAction, true);
  }
  
  // Click login button
  await mcp.act('Click the login button');
  await mcp.sleep(2000);
  
  // Verify login success
  const { text: successText } = await mcp.extract('Check if login was successful. Extract any success or error message.');
  console.log('\n🔐 Login Result:', successText.substring(0, 200));
  
  await mcp.screenshot('task2-form-completed.png');
  
  return { success: successText.includes('success') || successText.includes('logged in') };
}

/**
 * Task 3: Navigate Multiple Pages and Collect Data
 */
async function task3_MultiPageNavigation(mcp) {
  logSection('TASK 3: Multi-Page Navigation and Data Collection');
  
  await mcp.createSession('task3-multi-page');
  
  const collectedData = [];
  
  // Page 1: Navigate and extract
  await mcp.navigate('https://example.com');
  await mcp.sleep(2000);
  const { text: page1Data } = await mcp.extract('Extract the main heading and first paragraph from this page');
  collectedData.push({ page: 'example.com', data: page1Data.substring(0, 200) });
  console.log('📄 Page 1 data collected');
  
  // Page 2: Navigate and extract
  await mcp.navigate('https://httpbin.org/html');
  await mcp.sleep(2000);
  const { text: page2Data } = await mcp.extract('Extract the main heading from this HTML page');
  collectedData.push({ page: 'httpbin.org/html', data: page2Data.substring(0, 200) });
  console.log('📄 Page 2 data collected');
  
  // Page 3: Navigate and get URL
  await mcp.navigate('https://www.w3.org/');
  await mcp.sleep(2000);
  const currentUrl = await mcp.getUrl();
  collectedData.push({ page: currentUrl, data: 'URL verified' });
  console.log('📄 Page 3 URL collected');
  
  await mcp.screenshot('task3-final-page.png');
  
  return collectedData;
}

/**
 * Task 4: Complex Workflow - Search, Extract, and Document
 */
async function task4_ComplexWorkflow(mcp) {
  logSection('TASK 4: Complex Workflow - Search, Extract, Document');
  
  await mcp.createSession('task4-complex-workflow');
  
  // Step 1: Navigate to DuckDuckGo
  await mcp.navigate('https://duckduckgo.com');
  await mcp.sleep(2000);
  await mcp.screenshot('task4-step1-homepage.png');
  
  // Step 2: Search for something
  await mcp.act('Click on the search box, type "Model Context Protocol" and press Enter');
  await mcp.sleep(3000);
  await mcp.screenshot('task4-step2-search-results.png');
  
  // Step 3: Extract search results
  const { text: results } = await mcp.extract('Extract the titles and URLs of the top 5 search results. Format as: Title - URL');
  console.log('\n🔍 Search Results:');
  console.log(results.substring(0, 1000));
  
  // Step 4: Click on first result
  await mcp.act('Click on the first search result link');
  await mcp.sleep(3000);
  
  // Step 5: Extract page content
  const currentUrl = await mcp.getUrl();
  const { text: pageContent } = await mcp.extract('Extract the main heading and first two paragraphs from this page');
  
  console.log('\n📄 First Result Page:');
  console.log(`URL: ${currentUrl}`);
  console.log(`Content: ${pageContent.substring(0, 500)}...`);
  
  await mcp.screenshot('task4-step5-final-page.png');
  
  // Save flowState for replay
  const flowStateFile = await saveFlowState(mcp.flowState, 'task4-complex-workflow-flowstate.json');
  
  return {
    searchQuery: 'Model Context Protocol',
    results: results,
    firstResultUrl: currentUrl,
    firstResultContent: pageContent,
    flowStateFile: flowStateFile
  };
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  const mcp = new MCPClientExecutor();
  
  try {
    // Connect to MCP server
    await mcp.connect();
    
    // Execute complex tasks
    console.log('\n🚀 Starting Complex Task Execution\n');
    
    // Task 1: Wikipedia search and extract
    const result1 = await task1_SearchAndExtract(mcp);
    await mcp.sleep(1000);
    
    // Task 2: Form filling
    await mcp.close();
    await mcp.connect();
    const result2 = await task2_MultiStepForm(mcp);
    await mcp.sleep(1000);
    
    // Task 3: Multi-page navigation
    await mcp.close();
    await mcp.connect();
    const result3 = await task3_MultiPageNavigation(mcp);
    await mcp.sleep(1000);
    
    // Task 4: Complex workflow
    await mcp.close();
    await mcp.connect();
    const result4 = await task4_ComplexWorkflow(mcp);
    
    // Final summary
    logSection('✅ ALL TASKS COMPLETED');
    console.log('\n📊 Execution Summary:');
    console.log(`Task 1: Wikipedia search - ${result1.summary ? 'Success' : 'Failed'}`);
    console.log(`Task 2: Form filling - ${result2.success ? 'Success' : 'Failed'}`);
    console.log(`Task 3: Multi-page navigation - ${result3.length} pages collected`);
    console.log(`Task 4: Complex workflow - FlowState saved to: ${result4.flowStateFile}`);
    
    // Save final flowState
    await saveFlowState(mcp.flowState, 'final-workflow-flowstate.json');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    await mcp.close();
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

// Export for use as module
module.exports = {
  MCPClientExecutor,
  task1_SearchAndExtract,
  task2_MultiStepForm,
  task3_MultiPageNavigation,
  task4_ComplexWorkflow
};

