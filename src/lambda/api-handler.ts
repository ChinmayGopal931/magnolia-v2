import { APIGatewayProxyHandler } from 'aws-lambda';
import serverlessExpress from '@vendia/serverless-express';
import { app } from '../app';

let serverlessExpressInstance: any;

async function setup() {
  serverlessExpressInstance = serverlessExpress({ app });
  return serverlessExpressInstance;
}

export const handler: APIGatewayProxyHandler = async (event, context) => {
  if (!serverlessExpressInstance) {
    serverlessExpressInstance = await setup();
  }
  return serverlessExpressInstance(event, context);
};