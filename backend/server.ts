import express from 'express';
import triggerWorkflowRun from './triggerWorkflowRun';
import approveStep from './approveStep';
import webhookTrigger from './webhookTrigger';
import scheduledRunner from './scheduledRunner';
import dbEventHandler from './dbEventHandler';

const app = express();
app.use(express.json());

function requireActionSecret(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.path.startsWith('/webhookTrigger')) return next();
  if (req.header('X-Hasura-Action-Secret') !== process.env.ACTIONS_SECRET) {
    return res.status(401).json({ message: 'bad action secret' });
  }
  next();
}
app.use(requireActionSecret);

app.post('/triggerWorkflowRun', triggerWorkflowRun);
app.post('/approveStep', approveStep);

app.post('/webhookTrigger/:triggerId', webhookTrigger);

app.post('/scheduledRunner', scheduledRunner);

app.post('/dbEventHandler', dbEventHandler);

app.get('/health', (_req, res) => res.json({ ok: true }));

const port = process.env.PORT ?? 4000;
app.listen(port, () => console.log(`Action handler listening on :${port}`));
