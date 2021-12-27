import { Template } from "aws-cdk-lib/assertions";
import * as configLayer from './../lib/layer/configurationLayer';
import * as databaseLayer from './../lib/layer/databaseLayer';
import * as securityLayer from './../lib/layer/securityLayer';
import * as storageLayer from './../lib/layer/storageLayer';
import * as processingLayer from './../lib/layer/processingLayer';
import * as websocketLayer from './../lib/layer/websocketLayer';
import * as ingestionConsumptionLayer from './../lib/layer/ingestionConsumptionLayer';
import { ResourceAwareStack } from './../lib/resourceawarestack';
import { NRTAProps } from './../lib/nrta';

/**
 * These tests are built using https://jestjs.io/
 * 
 * To prepare the enviroment, you need to:
 * npm install --save-dev jest @types/jest @aws-cdk/assert
 */
 
 // This interface specifies the test function that we need to have in place to test Alien Attack stacks
 interface TestFunction {
     (stack : ResourceAwareStack, props: NRTAProps) : void;
 } 
 
 // This is the helper class which instantiates the essential resources and then pass them to the testFunction
 class AlienAttackTest {
    static test(testFunction: TestFunction) {
        if (!testFunction) throw new Error("Test function was not defined");
        const stack = new ResourceAwareStack();
        const props = new NRTAProps();
        props.region = process.env.region;
        props.accountId = process.env.account;
        props.setApplicationName('TEST');
        testFunction(stack,props);
     }  
}
 

// TO-DO need to implement this test
/*
describe("SecurityLayer",  () => {
    test("Synthesizes the security layer", () => {
         const stack = new ResourceAwareStack();
         const props = new NRTAProps();
         props.region = process.env.region;
         props.accountId = process.env.account;
         props.setApplicationName('TEST_SECURITY');
         new securityLayer.SecurityLayer(stack, 'SecurityLayer', props);
         const template = Template.fromStack(stack);
         
        let expectedResources = [
            'AWS::IAM::Role',
            'AWS::IAM::Policy',
            'AWS::Lambda::Function',
            'AWS::Cognito::UserPool',
            'AWS::Cognito::UserPoolClient',
            'AWS::Lambda::Permission',
            'AWS::Cognito::IdentityPool',
            'AWS::Cognito::UserPoolGroup',
            'AWS::Cognito::IdentityPoolRoleAttachment'
        ];
        expectedResources.forEach( (resource) => {
            template.findResources(resource);
        });
    });
});
*/

describe("ConfigurationLayer", () => {
    test("ConfigurationLayer validation (Systems Manager Parameters)", () => {
        const stack = new ResourceAwareStack();
        const props = new NRTAProps();
        props.region = process.env.region;
        props.accountId = process.env.account;
        props.setApplicationName('TEST_CONFIG');
        let ssmParameters = new Map<string, string>();
        ssmParameters.set("parameter1", "value1");
        props.addParameter("ssmParameters",ssmParameters);
        new configLayer.ConfigurationLayer(stack,'ConfigLayer',props);
        const template = Template.fromStack(stack);
        
        template.findResources("AWS::SSM::Parameter");
    });
});
    
describe('StorageLayer validation', () => {    
    test('StorageLayer validation', () => {
        const stack = new ResourceAwareStack();
        const props = new NRTAProps();
        props.region = process.env.region;
        props.accountId = process.env.account;
        props.setApplicationName('TEST_CONFIG');
        const template = Template.fromStack(stack);
        template.findResources("AWS::S3::Bucket");
    });
});

// TO-DO need to implement this test
/*
describe('Content Delivery', () => {    
    test('Content Delivery', () => {
        const stack = new ResourceAwareStack();
        const props = new NRTAProps();
        props.region = process.env.region;
        props.accountId = process.env.account;
        props.addParameter('appBucket','appbucket');
        new contentDeliveryLayer.ContentDeliveryLayer(stack, 'ContentDeliveryLayer', props);
        const template = Template.fromStack(stack);
        template.findResources('AWS::CloudFront::CloudFrontOriginAccessIdentity');
        template.findResources('AWS::CloudFront::Distribution');
        template.findResources('AWS::S3::BucketPolicy');
    });
});
*/
   
describe('DatabaseLayer validation', () => {  
    test('DatabaseLayer validation', () => {
        const stack = new ResourceAwareStack();
        const props = new NRTAProps();
        props.region = process.env.region;
        props.accountId = process.env.account;           
        new databaseLayer.DatabaseLayer(stack, 'DatabaseLayer', props);
        const template = Template.fromStack(stack);
        template.findResources('AWS::DynamoDB::Table');
    });
});
    
describe('ProcessingLayer validation', () => {  
    test('ProcessingLayer validation', () => {
        const stack = new ResourceAwareStack();
        const props = new NRTAProps();
        props.region = process.env.region;
        props.accountId = process.env.account;
        props.addParameter('table.sessioncontrol','TBLSESSIONCONTROL');
        props.addParameter('table.sessionTopX','TBLSESSIONTOP');
        props.addParameter('table.session','TBLSESSION');
        new processingLayer.ProcessingLayer(stack, 'ProcessingLayer', props);
        let expectedResources = [
            'AWS::IAM::Role',
            'AWS::Lambda::Function',
            'AWS::SQS::Queue'
        ];
        const template = Template.fromStack(stack);
        expectedResources.forEach( (resource) => {
            template.findResources(resource);
        });
    });
});
   
describe('WebsocketLayer validation', () => {
    test('WebsocketLayer validation', () => {
        const stack = new ResourceAwareStack();
        const props = new NRTAProps();
        props.region = process.env.region;
        props.accountId = process.env.account;
        props.addParameter('table.sessioncontrol','TBL_TEST_SESSIONCONTROL');
        new websocketLayer.WebSocketLayer(stack, 'WebSocketLayer', props);
        const template = Template.fromStack(stack);
        template.findResources('AWS::Lambda::Function');
        template.findResources('AWS::IAM::Role');
    });
});
   
describe('IngestionConsumptionLayer validation', () => {
    test('IngestionConsumptionLayer validation', () => {
        const stack = new ResourceAwareStack();
        const props = new NRTAProps();
        props.region = process.env.region;
        props.accountId = process.env.account;

        props.addParameter('kinesisintegration', true);
        props.addParameter('firehose',true);
        let secl = new securityLayer.SecurityLayer(stack, 'SecurityLayer', props);
        props.addParameter('existingbuckets',[]);
        let stol = new storageLayer.StorageLayer(stack, 'StorageLayer', props);
        props.addParameter('rawbucketarn',stol.getRawDataBucketArn());
        let dbl =  new databaseLayer.DatabaseLayer(stack, 'DatabaseLayer', props);
        props.addParameter('table.sessionTopX',dbl.getResource('table.sessiontopx'));
        props.addParameter('table.session',dbl.getResource('table.session'));
        props.addParameter('table.sessionControl',dbl.getResource('table.sessioncontrol'));
        let pl = new processingLayer.ProcessingLayer(stack, 'ProcessingLayer', props);
        props.addParameter('rawbucketarn', stol.getRawDataBucketArn());
        props.addParameter('userpool',secl.getUserPoolArn());
        props.addParameter('userpoolid', secl.getUserPoolId());
        props.addParameter('table.session',dbl.getResource('table.session'));
        props.addParameter('table.sessiontopx',dbl.getResource('table.sessiontopx'));
        props.addParameter('lambda.allocate',pl.getAllocateFunctionRef());
        props.addParameter('lambda.deallocate',pl.getDeallocateFunctionArn());
        props.addParameter('lambda.scoreboard',pl.getScoreboardFunctionRef());
        props.addParameter('security.playersrole', secl.getResource('security.playersrole'));
        props.addParameter('security.managersrole', secl.getResource('security.managersrole'));
        new ingestionConsumptionLayer.IngestionConsumptionLayer(stack, 'IngestionConsumptionLayer',props); 
        let expectedResources = [
            'AWS::Kinesis::Stream',
            'AWS::KinesisFirehose::DeliveryStream',
            'AWS::IAM::Role',
            'AWS::ApiGateway::RestApi',
            'AWS::ApiGateway::GatewayResponse',
            'AWS::ApiGateway::Authorizer',
            'AWS::ApiGateway::Model',
            'AWS::ApiGateway::Resource',
            'AWS::ApiGateway::Method',
            'AWS::ApiGateway::Deployment'
        ];
        const template = Template.fromStack(stack);
        expectedResources.forEach( (resource) => {
           template.findResources(resource);
        });
    });
});

