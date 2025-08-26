# cloudfront-cdn-template

## Architecture

```mermaid
graph LR
    User[👤<br/>User] --> CF[☁️<br/>Amazon CloudFront]
    
    CF --> CFFunc[⚡<br/>CloudFront Functions<br/>Viewer Request]
    CF --> S3[🪣<br/>Amazon S3<br/>Origin Bucket]
    
    CF -.-> OAC[🔐<br/>Origin Access Control<br/>OAC]
    OAC --> S3
    
    S3 -.-> KMS[🔑<br/>AWS KMS<br/>Customer Managed Key<br/><i>Optional</i>]
    
    subgraph AWS["AWS Cloud"]
        CF
        CFFunc
        S3
        OAC
        KMS
    end
    
    classDef aws fill:#fff,color:#345,stroke:#345,stroke-width:2px
    classDef user fill:#4CAF50,stroke:#2E7D32,stroke-width:2px,color:#fff
    classDef optional fill:#FFC107,stroke:#F57C00,stroke-width:2px,color:#000
    classDef awsRegion fill:#fff,color:#345,stroke:#345,stroke-width:2px
    
    class CF,CFFunc,S3,OAC aws
    class User user
    class KMS optional
    class AWS awsRegion
```

## Features

- **CloudFront CDN**: エッジキャッシュによるグローバルなコンテンツ配信
- **S3静的ホスティング**: Origin Access Controlによるセキュアなプライベートバケット
- **CloudFront Function**: SPAルーティング用の自動index.html転送機能
- **KMS暗号化**: S3オブジェクトのオプションサーバーサイド暗号化
- **セキュリティ**: CloudFrontからのみアクセス可能なプライベートS3バケット

## deploy

```sh
pnpm install && \
npx -y aws-cdk@latest deploy
```
