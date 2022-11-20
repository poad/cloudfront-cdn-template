#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CloudfrontCdnTemplateStack } from '../lib/cloudfront-cdn-template-stack';
import { compileBundles } from '../lib/process/setup';

compileBundles();

const app = new cdk.App();
const config = app.node.tryGetContext('config');
const stack = new CloudfrontCdnTemplateStack(app, config.stackName, {
  ...config,
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
