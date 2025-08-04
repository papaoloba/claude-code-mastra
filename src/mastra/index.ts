
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { claudeCodeAgent } from './agents/claude-code-agent';
import { weatherWorkflow } from './workflows/weather-workflow';
import { weatherAgent } from './agents/weather-agent';
import { codeAssistant } from './agents/code-assistant';

export const mastra = new Mastra({
  workflows: { weatherWorkflow },
  agents: { 
    claudeCodeAgent,
    weatherAgent, 
    codeAssistant 
  },
  storage: new LibSQLStore({
    // stores telemetry, evals, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: ":memory:",
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
});
