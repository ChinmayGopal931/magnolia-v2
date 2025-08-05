import serverlessExpress from '@vendia/serverless-express';
import { app } from '../app.js';

let serverlessExpressInstance;

async function setup() {
  serverlessExpressInstance = serverlessExpress({ app });
  return serverlessExpressInstance;
}

export const handler = async (event, context) => {
  if (!serverlessExpressInstance) {
    serverlessExpressInstance = await setup();
  }
  return serverlessExpressInstance(event, context);
};