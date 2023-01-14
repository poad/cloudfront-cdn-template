#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CloudfrontCdnTemplateStack, CloudfrontCdnTemplateStackProps } from '../lib/cloudfront-cdn-template-stack';
import { compileBundles } from '../lib/process/setup';

const app = new cdk.App();
const config = app.node.tryGetContext('config');

const env = app.node.tryGetContext('env');

if ((config as CloudfrontCdnTemplateStackProps).cloudfront.functionConfig) {
  compileBundles();
}

const stackName = env ? `${env}-${config.stackName}` : config.stackName;

const stack = new CloudfrontCdnTemplateStack(app, stackName, {
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
