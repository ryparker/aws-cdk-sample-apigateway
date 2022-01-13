import { App } from '@aws-cdk/core';
import { DocumentConverterApiGWStack } from './DocumentConverterApiGWStack'

const app = new App();
const stack = new DocumentConverterApiGWStack(app, 'DocumentConverterApiGWStack', {
  env: {
    region: 'us-east-1',
    account: '123456789012',
  },
});
