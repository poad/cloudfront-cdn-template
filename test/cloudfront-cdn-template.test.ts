import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as CloudfrontCdnTemplateStackProps from '../lib/cloudfront-cdn-template-stack';
import { test } from 'vitest';

test('CloudFront Created', () => {
  const app = new cdk.App();
  // WHEN
  const stack = new CloudfrontCdnTemplateStackProps.CloudfrontCdnTemplateStack(
    app,
    'MyTestStack',
    {
      bucketName: 'test',
      cloudfront: {
        comment: '',
      },
    },
  );
  // THEN
  const template = Template.fromStack(stack);

  // console.log(JSON.stringify(template, null, 2));

  template.hasResourceProperties('AWS::S3::Bucket', {
    AccessControl: 'Private',
    BucketEncryption: {
      ServerSideEncryptionConfiguration: [
        {
          ServerSideEncryptionByDefault: {
            SSEAlgorithm: 'AES256',
          },
        },
      ],
    },
    BucketName: 'test',
    Tags: [
      {
        Key: 'aws-cdk:auto-delete-objects',
        Value: 'true',
      },
    ],
    WebsiteConfiguration: {
      IndexDocument: 'index.html',
    },
  });

  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: {
      Comment: '',
      DefaultCacheBehavior: {
        AllowedMethods: ['GET', 'HEAD'],
        CachedMethods: ['GET', 'HEAD'],
        Compress: true,
        DefaultTTL: 3600,
        ForwardedValues: {
          Cookies: {
            Forward: 'none',
          },
          QueryString: false,
        },
        FunctionAssociations: [],
        MaxTTL: 86400,
        MinTTL: 0,
        TargetOriginId: 'origin1',
        ViewerProtocolPolicy: 'redirect-to-https',
      },
      DefaultRootObject: 'index.html',
      Enabled: true,
      HttpVersion: 'http2and3',
      IPV6Enabled: true,
      Origins: [
        {
          ConnectionAttempts: 3,
          ConnectionTimeout: 10,
          DomainName: {
            'Fn::GetAtt': ['S3Bucket07682993', 'RegionalDomainName'],
          },
          Id: 'origin1',
          S3OriginConfig: {},
        },
      ],
      PriceClass: 'PriceClass_100',
      ViewerCertificate: {
        CloudFrontDefaultCertificate: true,
      },
    },
  });
});
