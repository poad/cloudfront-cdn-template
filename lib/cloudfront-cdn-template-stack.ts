import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as iam from 'aws-cdk-lib/aws-iam';

interface CloudfrontCdnTemplateStackProps extends cdk.StackProps {
  bucketName: string;
  cloudfront: {
    comment: string;
    functionName: string;
    originAccessControlResourceName: string;
  };
  s3Encryption?: boolean;
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
      cloudfront: { comment, functionName, originAccessControlResourceName },
      s3Encryption,
    } = props;

    const resolveEncryption = () => {
      if (s3Encryption) {
        return s3.BucketEncryption.S3_MANAGED;
      }
      return undefined;
    };

    const encryption = resolveEncryption();

    const s3bucket = new s3.Bucket(this, 'S3Bucket', {
      bucketName,
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      accessControl: s3.BucketAccessControl.PRIVATE,
      publicReadAccess: false,
      encryption,
    });

    // CloudFront Functionリソースの定義
    const websiteIndexPageForwardFunction = new cloudfront.Function(
      this,
      'WebsiteIndexPageForwardFunction',
      {
        functionName,
        code: cloudfront.FunctionCode.fromFile({
          filePath: 'function/index.js',
        }),
      },
    );

    const oac = new cloudfront.CfnOriginAccessControl(
      this,
      'OriginAccessControl',
      {
        originAccessControlConfig: {
          name: originAccessControlResourceName,
          originAccessControlOriginType: 's3',
          signingBehavior: 'no-override',
          signingProtocol: 'sigv4',
        },
      },
    );

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
              functionAssociations: [
                {
                  eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
                  function: websiteIndexPageForwardFunction,
                },
              ],
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

    const cfnDistribution = cf.node.defaultChild as cloudfront.CfnDistribution;
    cfnDistribution.addPropertyOverride(
      'DistributionConfig.Origins.0.OriginAccessControlId',
      oac.getAtt('Id'),
    );
    cfnDistribution.addPropertyOverride(
      'DistributionConfig.Origins.0.S3OriginConfig.OriginAccessIdentity',
      '',
    );

    // eslint-disable-next-line no-new
    new cdk.CfnOutput(this, 'AccessURLOutput', {
      value: `https://${cf.distributionDomainName}`
    })
  }
}
