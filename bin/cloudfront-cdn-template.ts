#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import {
  CloudfrontCdnTemplateStack,
  Config,
} from '../lib/cloudfront-cdn-template-stack';

function validation(config: Config) {
  if (config.kms) {
    if (!config.cloudfront.originAccessControl) {
      // TODO error message
      throw new Error('');
    }
    if (!(config.kms.alias || config.kms.alias || config.kms.createKey)) {
      // TODO error message
      throw new Error('');
    }
  }
}

const app = new cdk.App();

const env = app.node.tryGetContext('env');
const config = app.node.tryGetContext(env ?? 'default');

validation(config);

const stack = new CloudfrontCdnTemplateStack(app, config.stackName, {
  ...config,
  environment: env,
  env: {
    account: app.account,
    region: app.region,
  },
});

if (config.tags && config.tags.length > 0) {
  config.tags.array.forEach(
    ({ name, value }: { name: string; value: string }) => {
      cdk.Tags.of(stack).add(name, value);
    },
  );
}
