import * as cdk from "@aws-cdk/core";
import * as apiGw from "@aws-cdk/aws-apigateway";
import * as iam from "@aws-cdk/aws-iam";
import * as logs from "@aws-cdk/aws-logs";
import * as elb2 from "@aws-cdk/aws-elasticloadbalancingv2";

export class DocumentConverterApiGWStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const applicationName = 'DocumentConverter';

    const boundary = iam.ManagedPolicy.fromManagedPolicyName(this, 'Boundary', 'Core-PermissionBoundaryPolicy');
    iam.PermissionsBoundary.of(this).apply(boundary);

    const networkLoadBalancer = elb2.NetworkLoadBalancer.fromLookup(this, "NblLookUp", {
      loadBalancerArn: "NLB_ARN"
    })

    const vpcLink = new apiGw.VpcLink(this, "vpcLink", {
      description: "VpcLink towards NLB",
      targets: [networkLoadBalancer]
    });

    const policy = new iam.PolicyDocument({
      statements: [new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.AnyPrincipal()],
        actions: ["execute-api:Invoke"],
        resources: ["execute-api:/*"]
      }),
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        actions: ["execute-api:Invoke"],
        resources: ["execute-api:/*"],
        conditions: { "NotIpAddress": { "aws:VpcSourceIp": ["IP_LIST"] } }
      })]
    });

    const restApiGw = new apiGw.RestApi(this, "RestApiGw", {
      description: "Api Gateway for GroupServices",
      deploy: false,
      cloudWatchRole: true,
      endpointConfiguration: {
        types: [apiGw.EndpointType.PRIVATE],
      },
      policy: policy
    }
    );

    const integrationGet = new apiGw.Integration({
      type: apiGw.IntegrationType.HTTP_PROXY,
      integrationHttpMethod: "GET",
      uri: "http://" + networkLoadBalancer.loadBalancerDnsName + "/{proxy}",
      options: {
        connectionType: apiGw.ConnectionType.VPC_LINK,
        vpcLink: vpcLink,
        passthroughBehavior: apiGw.PassthroughBehavior.WHEN_NO_MATCH,
        requestParameters: {
          "integration.request.path.proxy": "method.request.path.proxy"
        }
      },
    });

    const integrationPost = new apiGw.Integration({
      type: apiGw.IntegrationType.HTTP_PROXY,
      integrationHttpMethod: "POST",
      uri: "http://" + networkLoadBalancer.loadBalancerDnsName + "/{proxy}",
      options: {
        connectionType: apiGw.ConnectionType.VPC_LINK,
        vpcLink: vpcLink,
        passthroughBehavior: apiGw.PassthroughBehavior.WHEN_NO_MATCH,
        requestParameters: {
          "integration.request.path.proxy": "method.request.path.proxy",
        }
      },
    })

    const proxyResource = new apiGw.ProxyResource(this, "ProxyResource", {
      parent: restApiGw.root,
    });
    proxyResource.addMethod("GET", integrationGet, { requestParameters: { "method.request.path.proxy": true } });
    proxyResource.addMethod("POST", integrationPost, { requestParameters: { "method.request.path.proxy": true } });

    const deployment = new apiGw.Deployment(this, "Deployment", {
      api: restApiGw
    })

    const logGroupApiGw = new logs.LogGroup(this, 'ApiGwLogGroup', {
      logGroupName: "/api-gw/" + applicationName,
      retention: 7
    });

    const stage = new apiGw.Stage(this, "Stage", {
      deployment: deployment,
      accessLogDestination: new apiGw.LogGroupLogDestination(logGroupApiGw),
      loggingLevel: apiGw.MethodLoggingLevel.INFO,
      dataTraceEnabled: true,
      stageName: "DEV",
    });

    restApiGw.deploymentStage = stage;
    new cdk.CfnOutput(this, 'ApiGatewayURL', { value: restApiGw.url, exportName: "ApiGatewayURL" });
  }
}
