/**
 * Client-Side Replay Manager
 * 
 * Tracks actions and replays them deterministically
 */

class ReplayManager {
  constructor() {
    this.replayState = {
      sessionId: null,
      url: null,
      actions: [],
      metadata: {
        createdAt: Date.now(),
        lastUpdated: Date.now()
      }
    };
  }
  
  /**
   * Set the session ID
   */
  setSessionId(sessionId) {
    this.replayState.sessionId = sessionId;
    this.replayState.metadata.lastUpdated = Date.now();
  }
  
  /**
   * Set the starting URL
   */
  setUrl(url) {
    this.replayState.url = url;
    this.replayState.metadata.lastUpdated = Date.now();
  }
  
  /**
   * Track a navigation action
   */
  trackNavigate(url) {
    this.replayState.actions.push({
      type: 'navigate',
      url,
      timestamp: Date.now()
    });
    this.replayState.metadata.lastUpdated = Date.now();
  }
  
  /**
   * Track an observe action
   */
  trackObserve(instruction, returnAction = true) {
    this.replayState.actions.push({
      type: 'observe',
      instruction,
      returnAction,
      timestamp: Date.now()
    });
    this.replayState.metadata.lastUpdated = Date.now();
  }
  
  /**
   * Track an act action (natural language)
   */
  trackAct(action) {
    this.replayState.actions.push({
      type: 'act',
      action,
      timestamp: Date.now()
    });
    this.replayState.metadata.lastUpdated = Date.now();
  }
  
  /**
   * Track an act action (deterministic observation)
   */
  trackActObservation(observation) {
    this.replayState.actions.push({
      type: 'act_observation',
      observation,
      timestamp: Date.now()
    });
    this.replayState.metadata.lastUpdated = Date.now();
  }
  
  /**
   * Get current replay state
   */
  getState() {
    return { ...this.replayState };
  }
  
  /**
   * Save replay state to JSON string
   */
  save() {
    return JSON.stringify(this.replayState, null, 2);
  }
  
  /**
   * Load replay state from JSON string
   */
  load(json) {
    try {
      this.replayState = JSON.parse(json);
      return true;
    } catch (error) {
      console.error('Failed to load replay state:', error);
      return false;
    }
  }
  
  /**
   * Clear all tracked actions
   */
  clear() {
    this.replayState.actions = [];
    this.replayState.metadata.lastUpdated = Date.now();
  }
  
  /**
   * Replay all tracked actions
   * 
   * @param {Client} client - MCP client instance
   * @param {Object} options - Replay options
   * @param {number} options.delay - Delay between actions (ms), default 500
   * @param {boolean} options.createNewSession - Create new session for replay, default false
   * @param {Function} options.onAction - Callback before each action
   * @param {Function} options.onError - Callback on error
   */
  async replay(client, options = {}) {
    const {
      delay = 500,
      createNewSession = false,
      onAction = null,
      onError = null
    } = options;
    
    const { sessionId, url, actions } = this.replayState;
    
    if (!sessionId) {
      throw new Error('No sessionId in replay state. Call setSessionId() first or set createNewSession=true');
    }
    
    if (!url) {
      throw new Error('No URL in replay state. Call setUrl() first');
    }
    
    let currentSessionId = sessionId;
    
    // Create new session if requested
    if (createNewSession) {
      console.log('🔄 Creating new session for replay...');
      const createResult = await client.callTool({
        name: 'browserbase_session_create',
        arguments: {}
      });
      
      // Extract new session ID
      const sessionIdMatch = createResult.content
        .find(item => item.type === 'text' && item.text)
        ?.text?.match(/sessions\/([a-f0-9-]+)/i);
      
      if (sessionIdMatch) {
        currentSessionId = sessionIdMatch[1];
        console.log(`✅ New session created: ${currentSessionId}`);
      } else {
        throw new Error('Failed to extract session ID from create response');
      }
    }
    
    // Navigate to starting URL
    console.log(`🌐 Navigating to: ${url}`);
    if (onAction) await onAction('navigate', { url });
    
    await client.callTool({
      name: 'browserbase_stagehand_navigate',
      arguments: { url, sessionId: currentSessionId }
    });
    
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Replay each action
    console.log(`🔄 Replaying ${actions.length} actions...`);
    
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      
      try {
        if (onAction) await onAction(action.type, action);
        
        switch (action.type) {
          case 'navigate':
            console.log(`  [${i + 1}/${actions.length}] Navigate: ${action.url}`);
            await client.callTool({
              name: 'browserbase_stagehand_navigate',
              arguments: { url: action.url, sessionId: currentSessionId }
            });
            await new Promise(resolve => setTimeout(resolve, 2000));
            break;
            
          case 'observe':
            console.log(`  [${i + 1}/${actions.length}] Observe: ${action.instruction.substring(0, 50)}...`);
            await client.callTool({
              name: 'browserbase_stagehand_observe',
              arguments: {
                instruction: action.instruction,
                returnAction: action.returnAction !== undefined ? action.returnAction : true,
                sessionId: currentSessionId
              }
            });
            break;
            
          case 'act':
            console.log(`  [${i + 1}/${actions.length}] Act: ${action.action.substring(0, 50)}...`);
            await client.callTool({
              name: 'browserbase_stagehand_act',
              arguments: {
                action: action.action,
                sessionId: currentSessionId
              }
            });
            break;
            
          case 'act_observation':
            console.log(`  [${i + 1}/${actions.length}] Act (deterministic): ${action.observation.method || 'action'}`);
            await client.callTool({
              name: 'browserbase_stagehand_act',
              arguments: {
                observation: action.observation,
                sessionId: currentSessionId
              }
            });
            break;
            
          default:
            console.warn(`  [${i + 1}/${actions.length}] Unknown action type: ${action.type}`);
        }
        
        // Delay between actions
        if (i < actions.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
      } catch (error) {
        console.error(`  ❌ Error replaying action ${i + 1}:`, error.message);
        if (onError) {
          const shouldContinue = await onError(error, action, i);
          if (!shouldContinue) {
            throw error;
          }
        } else {
          throw error;
        }
      }
    }
    
    console.log(`✅ Replay completed successfully`);
    
    return {
      sessionId: currentSessionId,
      actionsReplayed: actions.length
    };
  }
}

module.exports = { ReplayManager };

