const serverlessExpress = require('@vendia/serverless-express');

let serverlessExpressInstance;

async function setup() {
  // Dynamically import the ES module
  const { app } = await import('../app.js');
  serverlessExpressInstance = serverlessExpress({ app });
  return serverlessExpressInstance;
}

exports.handler = async (event, context) => {
  if (!serverlessExpressInstance) {
    serverlessExpressInstance = await setup();
  }
  return serverlessExpressInstance(event, context);
};