import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  SessionManager, 
  validateOptions, 
  formatError, 
  createTimeoutPromise, 
  sleep 
} from './utils.js';
import type { ClaudeCodeAgentOptions } from './types.js';

describe('SessionManager', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager();
  });

  describe('createSession', () => {
    it('should create a new session with unique ID', () => {
      const session1 = sessionManager.createSession();
      const session2 = sessionManager.createSession();

      expect(session1.sessionId).toBeDefined();
      expect(session2.sessionId).toBeDefined();
      expect(session1.sessionId).not.toBe(session2.sessionId);

      expect(session1.isActive).toBe(true);
      expect(session1.totalCost).toBe(0);
      expect(session1.totalTurns).toBe(0);
      expect(session1.startTime).toBeTypeOf('number');
    });

    it('should generate session IDs with expected format', () => {
      const session = sessionManager.createSession();
      
      expect(session.sessionId).toMatch(/^session_\d+_[a-z0-9]{9}$/);
    });
  });

  describe('getSession', () => {
    it('should retrieve existing session by ID', () => {
      const createdSession = sessionManager.createSession();
      const retrievedSession = sessionManager.getSession(createdSession.sessionId);

      expect(retrievedSession).toEqual(createdSession);
    });

    it('should return undefined for non-existent session', () => {
      const session = sessionManager.getSession('non-existent-id');
      
      expect(session).toBeUndefined();
    });
  });

  describe('updateSession', () => {
    it('should update existing session properties', () => {
      const session = sessionManager.createSession();
      
      sessionManager.updateSession(session.sessionId, {
        totalCost: 0.05,
        totalTurns: 3,
        isError: true
      });

      const updatedSession = sessionManager.getSession(session.sessionId);
      
      expect(updatedSession?.totalCost).toBe(0.05);
      expect(updatedSession?.totalTurns).toBe(3);
      expect(updatedSession?.isError).toBe(true);
      expect(updatedSession?.sessionId).toBe(session.sessionId); // unchanged
      expect(updatedSession?.startTime).toBe(session.startTime); // unchanged
    });

    it('should not affect non-existent session', () => {
      sessionManager.updateSession('non-existent', { totalCost: 100 });
      
      // Should not throw error, just silently ignore
      expect(sessionManager.getSession('non-existent')).toBeUndefined();
    });
  });

  describe('endSession', () => {
    it('should mark session as inactive', () => {
      const session = sessionManager.createSession();
      expect(session.isActive).toBe(true);

      sessionManager.endSession(session.sessionId);
      
      const endedSession = sessionManager.getSession(session.sessionId);
      expect(endedSession?.isActive).toBe(false);
    });

    it('should handle non-existent session gracefully', () => {
      sessionManager.endSession('non-existent');
      // Should not throw error
    });
  });

  describe('cleanupSession', () => {
    it('should remove session from storage', () => {
      const session = sessionManager.createSession();
      expect(sessionManager.getSession(session.sessionId)).toBeDefined();

      sessionManager.cleanupSession(session.sessionId);
      
      expect(sessionManager.getSession(session.sessionId)).toBeUndefined();
    });
  });
});

describe('validateOptions', () => {
  it('should return default options when no input provided', () => {
    const options = validateOptions();

    expect(options.maxTurns).toBe(10);
    expect(options.allowedTools).toEqual([]);
    expect(options.disallowedTools).toEqual([]);
    expect(options.permissionMode).toBe('default');
    expect(options.cwd).toBe(process.cwd());
    expect(options.timeout).toBe(300000);
    expect(options.model).toBe('claude-3-5-sonnet-20241022');
    expect(options.fallbackModel).toBe('claude-3-5-haiku-20241022');
  });

  it('should merge provided options with defaults', () => {
    const input: ClaudeCodeAgentOptions = {
      maxTurns: 5,
      allowedTools: ['Edit', 'Read'],
      permissionMode: 'acceptEdits',
      timeout: 60000
    };

    const options = validateOptions(input);

    expect(options.maxTurns).toBe(5);
    expect(options.allowedTools).toEqual(['Edit', 'Read']);
    expect(options.permissionMode).toBe('acceptEdits');
    expect(options.timeout).toBe(60000);
    expect(options.cwd).toBe(process.cwd()); // default value
  });

  it('should validate maxTurns range', () => {
    expect(() => validateOptions({ maxTurns: 0 })).toThrow('maxTurns must be a number between 1 and 100');
    expect(() => validateOptions({ maxTurns: 101 })).toThrow('maxTurns must be a number between 1 and 100');
    expect(() => validateOptions({ maxTurns: -5 })).toThrow('maxTurns must be a number between 1 and 100');
  });

  it('should validate permissionMode values', () => {
    expect(() => validateOptions({ permissionMode: 'invalid' as any })).toThrow('permissionMode must be one of: default, acceptEdits, bypassPermissions, plan');
    
    // Valid values should not throw
    expect(() => validateOptions({ permissionMode: 'default' })).not.toThrow();
    expect(() => validateOptions({ permissionMode: 'acceptEdits' })).not.toThrow();
    expect(() => validateOptions({ permissionMode: 'bypassPermissions' })).not.toThrow();
    expect(() => validateOptions({ permissionMode: 'plan' })).not.toThrow();
  });

  it('should validate timeout range', () => {
    expect(() => validateOptions({ timeout: 500 })).toThrow('timeout must be a number between 1000ms (1s) and 3600000ms (1h)');
    expect(() => validateOptions({ timeout: 4000000 })).toThrow('timeout must be a number between 1000ms (1s) and 3600000ms (1h)');
    
    // Valid values should not throw
    expect(() => validateOptions({ timeout: 1000 })).not.toThrow();
    expect(() => validateOptions({ timeout: 3600000 })).not.toThrow();
  });

  it('should filter non-string tools', () => {
    const input: ClaudeCodeAgentOptions = {
      allowedTools: ['Edit', 123 as any, 'Read', null as any, 'Write'],
      disallowedTools: ['Tool1', undefined as any, 'Tool2']
    };

    const options = validateOptions(input);

    expect(options.allowedTools).toEqual(['Edit', 'Read', 'Write']);
    expect(options.disallowedTools).toEqual(['Tool1', 'Tool2']);
  });

  it('should validate working directory type', () => {
    expect(() => validateOptions({ cwd: 123 as any })).toThrow('workingDirectory must be a string');
    
    // Valid string should not throw
    expect(() => validateOptions({ cwd: '/valid/path' })).not.toThrow();
  });
});

describe('formatError', () => {
  it('should format Error objects', () => {
    const error = new Error('Test error message');
    
    const formatted = formatError(error);
    
    expect(formatted).toBe('Test error message');
  });

  it('should format string errors', () => {
    const formatted = formatError('Simple error string');
    
    expect(formatted).toBe('Simple error string');
  });

  it('should handle unknown error types', () => {
    const formatted = formatError({ custom: 'object' });
    
    expect(formatted).toBe('Unknown error occurred');
  });

  it('should handle null and undefined', () => {
    expect(formatError(null)).toBe('Unknown error occurred');
    expect(formatError(undefined)).toBe('Unknown error occurred');
  });
});

describe('createTimeoutPromise', () => {
  it('should resolve when promise resolves before timeout', async () => {
    const quickPromise = new Promise(resolve => {
      setTimeout(() => resolve('success'), 10);
    });

    const result = await createTimeoutPromise(quickPromise, 100);
    
    expect(result).toBe('success');
  });

  it('should reject when timeout occurs first', async () => {
    const slowPromise = new Promise(resolve => {
      setTimeout(() => resolve('too late'), 200);
    });

    await expect(createTimeoutPromise(slowPromise, 50))
      .rejects.toThrow('Operation timed out after 50ms');
  });

  it('should reject when original promise rejects', async () => {
    const rejectingPromise = Promise.reject(new Error('Original error'));

    await expect(createTimeoutPromise(rejectingPromise, 100))
      .rejects.toThrow('Original error');
  });
});

describe('sleep', () => {
  it('should resolve after specified time', async () => {
    const start = Date.now();
    
    await sleep(50);
    
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(45); // Allow some tolerance
    expect(elapsed).toBeLessThan(100); // But not too much
  });

  it('should handle zero delay', async () => {
    const start = Date.now();
    
    await sleep(0);
    
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(10); // Should be very quick
  });
});

describe('integration tests for utils', () => {
  it('should handle complete session lifecycle', () => {
    const manager = new SessionManager();
    
    // Create session
    const session = manager.createSession();
    expect(session.isActive).toBe(true);
    
    // Update session
    manager.updateSession(session.sessionId, {
      totalCost: 0.1,
      totalTurns: 2
    });
    
    const updated = manager.getSession(session.sessionId);
    expect(updated?.totalCost).toBe(0.1);
    expect(updated?.totalTurns).toBe(2);
    
    // End session
    manager.endSession(session.sessionId);
    const ended = manager.getSession(session.sessionId);
    expect(ended?.isActive).toBe(false);
    
    // Cleanup session
    manager.cleanupSession(session.sessionId);
    const cleaned = manager.getSession(session.sessionId);
    expect(cleaned).toBeUndefined();
  });

  it('should validate complex option combinations', () => {
    const complexOptions: ClaudeCodeAgentOptions = {
      maxTurns: 15,
      allowedTools: ['Edit', 'Read', 'Write', 'Bash'],
      disallowedTools: ['Delete'],
      permissionMode: 'bypassPermissions',
      cwd: '/custom/directory',
      timeout: 120000,
      model: 'claude-3-opus-20240229',
      fallbackModel: 'claude-3-sonnet-20240229',
      appendSystemPrompt: 'Additional instructions',
      customSystemPrompt: 'Custom system message',
      maxThinkingTokens: 1000
    };

    const validated = validateOptions(complexOptions);

    expect(validated.maxTurns).toBe(15);
    expect(validated.allowedTools).toEqual(['Edit', 'Read', 'Write', 'Bash']);
    expect(validated.disallowedTools).toEqual(['Delete']);
    expect(validated.permissionMode).toBe('bypassPermissions');
    expect(validated.cwd).toBe('/custom/directory');
    expect(validated.timeout).toBe(120000);
    expect(validated.model).toBe('claude-3-opus-20240229');
    expect(validated.fallbackModel).toBe('claude-3-sonnet-20240229');
    expect(validated.appendSystemPrompt).toBe('Additional instructions');
    expect(validated.customSystemPrompt).toBe('Custom system message');
    expect(validated.maxThinkingTokens).toBe(1000);
  });
});