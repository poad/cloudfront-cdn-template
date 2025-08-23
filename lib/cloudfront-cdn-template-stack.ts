import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import { compileBundles } from './process/setup';

export interface Config extends cdk.StackProps {
  bucketName: string;
  cloudfront: {
    comment: string;
    originAccessControl: {
      functionConfig: {
        name: string;
        arn?: string;
      };
      name: string;
    };
  };
  kms?: {
    arn?: string;
    alias?: string;
    createKey?: boolean;
  };
}

interface CloudfrontCdnTemplateStackProps extends Config {
  environment?: string;
}

function resolveEncryption(stack: cdk.Stack, kmsConfig?: {
  arn?: string;
  alias?: string;
  createKey?: boolean;
}): {
  encryption: cdk.aws_s3.BucketEncryption;
  encryptionKey?: cdk.aws_kms.IKey;
} {
  if (kmsConfig) {
    if (kmsConfig.arn || kmsConfig.alias || kmsConfig.createKey) {
      const encryption = {
        encryption: s3.BucketEncryption.KMS,
        bucketKeyEnabled: true,
      };
      if (kmsConfig.arn) {
        const encryptionKey = kms.Key.fromKeyArn(
          stack,
          'KMSKey',
          kmsConfig.arn,
        );
        return { ...encryption, encryptionKey };
      }
      if (kmsConfig.createKey) {
        const encryptionKey = new kms.Key(stack, 'KMSKey', {
          alias: kmsConfig.alias,
          enableKeyRotation: true,
          description: `Created by ${stack.stackName}`,
          policy: new iam.PolicyDocument({
            statements: [
              new iam.PolicyStatement({
                sid: 'defaultPolicy',
                principals: [new iam.AccountRootPrincipal()],
                effect: iam.Effect.ALLOW,
                actions: ['kms:*'],
                resources: ['*'],
              }),
            ],
          }),
        });
        return { ...encryption, encryptionKey };
      }
      if (kmsConfig.alias) {
        const alias = kms.Alias.fromAliasName(
          stack,
          'KMSKeyAlias',
          kmsConfig.alias,
        );
        const encryptionKey = kms.Key.fromKeyArn(
          stack,
          'KMSKey',
          alias.keyArn,
        );

        return { ...encryption, encryptionKey };
      }

      return encryption;
    }
  }
  return { encryption: s3.BucketEncryption.S3_MANAGED };
};

function websiteIndexPageForwardFunctionResolver(stack: cdk.Stack, functionConfig: {
  name: string;
  arn?: string;
}, functionName: string) {
  if (functionConfig.arn) {
    return cloudfront.Function.fromFunctionAttributes(
      stack,
      'WebsiteIndexPageForwardFunction',
      {
        functionName,
        functionArn: functionConfig.arn,
      },
    );
  }
  return new cloudfront.Function(stack, 'WebsiteIndexPageForwardFunction', {
    functionName,
    code: cloudfront.FunctionCode.fromFile({
      filePath: 'function/index.js',
    }),
    runtime: cloudfront.FunctionRuntime.JS_2_0,
  });
}

export class CloudfrontCdnTemplateStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props: CloudfrontCdnTemplateStackProps,
  ) {
    super(scope, id, props);

    const {
      bucketName,
      environment,
      cloudfront: { comment, originAccessControl },
      kms: kmsConfig,
    } = props;

    const encryption = resolveEncryption(this, kmsConfig);

    const s3bucket = new s3.Bucket(this, 'S3Bucket', {
      bucketName,
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      accessControl: s3.BucketAccessControl.PRIVATE,
      publicReadAccess: false,
      encryption: encryption.encryption,
      encryptionKey: encryption.encryptionKey,
    });

    // CloudFront Functionリソースの定義
    const { functionConfig } = originAccessControl;
    compileBundles();

    const functionName = environment ? `${environment}-${functionConfig.name}` : functionConfig.name;
    const websiteIndexPageForwardFunction = websiteIndexPageForwardFunctionResolver(this, functionConfig, functionName);
    const functionAssociations = [
      {
        eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
        function: websiteIndexPageForwardFunction,
      },
    ];

    const oac = new cloudfront.S3OriginAccessControl(this, 'OriginAccessControl', {
      originAccessControlName: originAccessControl.functionConfig.name,
      signing: cloudfront.Signing.SIGV4_NO_OVERRIDE,
    });

    const cf = new cloudfront.Distribution(this, 'CloudFront', {
      comment,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(s3bucket, {
          originAccessControl: oac,
        }),
        compress: true,
        functionAssociations,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        viewerProtocolPolicy:
          cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        // minTtl: cdk.Duration.seconds(0),
        // maxTtl: cdk.Duration.seconds(86400),
        // defaultTtl: cdk.Duration.seconds(3600),
      },
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
    });
    s3bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowCloudFrontServicePrincipalReadOnly',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
        actions: ['s3:GetObject'],
        resources: [`${s3bucket.bucketArn}/*`],
        conditions: {
          StringEquals: {
            'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${cf.distributionId}`,
          },
        },
      }),
    );

    if (encryption.encryptionKey) {
      if (kmsConfig?.createKey) {
        encryption.encryptionKey.addToResourcePolicy(
          new iam.PolicyStatement({
            sid: 'AllowCloudFrontServicePrincipalSSE-KMS',
            effect: iam.Effect.ALLOW,
            principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
            actions: ['kms:Decrypt', 'kms:Encrypt', 'kms:GenerateDataKey*'],
            resources: ['*'],
            conditions: {
              StringLike: {
                'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/*`,
              },
            },
          }),
        );
      }
    }

    if (!(kmsConfig?.arn || kmsConfig?.alias)) {
      s3bucket.addToResourcePolicy(
        new iam.PolicyStatement({
          sid: 'DenyUnEncryptedObjectUploads',
          effect: iam.Effect.ALLOW,
          principals: [new iam.StarPrincipal()],
          actions: ['s3:PutObject'],
          resources: [`${s3bucket.bucketArn}/*`],
          conditions: {
            StringEquals: {
              's3:x-amz-server-side-encryption': 'aws:kms',
            },
          },
        }),
      );
    } else if (encryption.encryptionKey) {
      s3bucket.addToResourcePolicy(
        new iam.PolicyStatement({
          sid: 'DenyUnEncryptedObjectUploads',
          effect: iam.Effect.ALLOW,
          principals: [new iam.StarPrincipal()],
          actions: ['s3:PutObject'],
          resources: [`${s3bucket.bucketArn}/*`],
          conditions: {
            StringEquals: {
              's3:x-amz-server-side-encryption-aws-kms-key-id':
                encryption.encryptionKey.keyArn,
            },
          },
        }),
      );
    }

    new cdk.CfnOutput(this, 'AccessURLOutput', {
      value: `https://${cf.distributionDomainName}`,
    });
  }
}
