
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { csvQuestionAgent } from './agents/csv-question-agent';
import { csvSummarizationAgent } from './agents/csv-summarization-agent';
import { textQuestionAgent } from './agents/text-question-agent';
import { csvToQuestionsWorkflow } from './workflows/csv-to-questions-workflow';

export const mastra = new Mastra({
  agents: { 
    csvQuestionAgent,
    csvSummarizationAgent,
    textQuestionAgent,
  },
  workflows: {
    csvToQuestionsWorkflow,
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
