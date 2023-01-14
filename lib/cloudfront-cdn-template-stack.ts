import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import { compileBundles } from './process/setup';

export interface Config extends cdk.StackProps {
  bucketName: string;
  cloudfront: {
    comment: string;
    originAccessControl?: {
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

    const resolveEncryption = (): {
      encryptionKey?: cdk.aws_kms.IKey;
      encryption: cdk.aws_s3.BucketEncryption;
      bucketKeyEnabled?: boolean;
    } => {
      if (kmsConfig) {
        if (kmsConfig.arn || kmsConfig.alias || kmsConfig.createKey) {
          const encryption = {
            encryption: s3.BucketEncryption.KMS,
            bucketKeyEnabled: true,
          };
          if (kmsConfig.arn) {
            const encryptionKey = kms.Key.fromKeyArn(
              this,
              'KMSKey',
              kmsConfig.arn,
            );
            return { ...encryption, encryptionKey };
          }
          if (kmsConfig.createKey) {
            const encryptionKey = new kms.Key(this, 'KMSKey', {
              alias: kmsConfig.alias,
              enableKeyRotation: true,
              description: `Created by ${this.stackName}`,
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
              this,
              'KMSKeyAlias',
              kmsConfig.alias,
            );
            const encryptionKey = kms.Key.fromKeyArn(
              this,
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

    const encryption = resolveEncryption();

    const s3bucket = new s3.Bucket(this, 'S3Bucket', {
      bucketName,
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      accessControl: s3.BucketAccessControl.PRIVATE,
      publicReadAccess: false,
      websiteIndexDocument: !originAccessControl ? 'index.html' : undefined,
      ...encryption,
    });

    // CloudFront Functionリソースの定義
    const functionAssociationsResolver = () => {
      if (originAccessControl) {
        const { functionConfig } = originAccessControl;
        compileBundles();

        const functionName = environment
          ? `${environment}-${functionConfig.name}`
          : functionConfig.name;
        const websiteIndexPageForwardFunction = functionConfig.arn
          ? cloudfront.Function.fromFunctionAttributes(
              this,
              'WebsiteIndexPageForwardFunction',
              {
                functionName,
                functionArn: functionConfig.arn,
              },
            )
          : new cloudfront.Function(this, 'WebsiteIndexPageForwardFunction', {
              functionName,
              code: cloudfront.FunctionCode.fromFile({
                filePath: 'function/index.js',
              }),
            });
        return [
          {
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            function: websiteIndexPageForwardFunction,
          },
        ];
      }
      return [];
    };

    const cf = new cloudfront.CloudFrontWebDistribution(this, 'CloudFront', {
      comment,
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: s3bucket,
          },
          behaviors: [
            {
              isDefaultBehavior: true,
              compress: true,
              functionAssociations: functionAssociationsResolver(),
              cachedMethods: cloudfront.CloudFrontAllowedCachedMethods.GET_HEAD,
              viewerProtocolPolicy:
                cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
              minTtl: cdk.Duration.seconds(0),
              maxTtl: cdk.Duration.seconds(86400),
              defaultTtl: cdk.Duration.seconds(3600),
            },
          ],
        },
      ],
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

    const cfnDistribution = cf.node.defaultChild as cloudfront.CfnDistribution;
    if (originAccessControl || kmsConfig) {
      const oac = new cloudfront.CfnOriginAccessControl(
        this,
        'OriginAccessControl',
        {
          originAccessControlConfig: {
            name: originAccessControl!.functionConfig.name,
            originAccessControlOriginType: 's3',
            signingBehavior: 'no-override',
            signingProtocol: 'sigv4',
          },
        },
      );
      cfnDistribution.addPropertyOverride(
        'DistributionConfig.Origins.0.OriginAccessControlId',
        oac.getAtt('Id'),
      );
      cfnDistribution.addPropertyOverride(
        'DistributionConfig.Origins.0.S3OriginConfig.OriginAccessIdentity',
        '',
      );
    }

    // eslint-disable-next-line no-new
    new cdk.CfnOutput(this, 'AccessURLOutput', {
      value: `https://${cf.distributionDomainName}`,
    });
  }
}
