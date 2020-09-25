import '@aws-cdk/assert/jest';
import * as configLayer from './../lib/layer/configurationLayer';
import * as databaseLayer from './../lib/layer/databaseLayer';
import * as securityLayer from './../lib/layer/securityLayer';
import * as storageLayer from './../lib/layer/storageLayer';
import * as contentDeliveryLayer from './../lib/layer/contentDeliveryLayer';
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
 
/**
 * SECURITY LAYER
 */
test('SecurityLayer validation', () => {
    let testFunction = function(stack : ResourceAwareStack, props: NRTAProps) {
        new securityLayer.SecurityLayer(stack, 'SecurityLayer', props);
        let expectedResources = [
            'AWS::IAM::Role',
            'AWS::IAM::Policy',
            'AWS::Lambda::Function',
            'AWS::CloudFormation::CustomResource',
            'AWS::Cognito::UserPoolClient',
            'AWS::Lambda::Permission',
            'AWS::Cognito::IdentityPool',
            'AWS::Cognito::UserPoolGroup',
            'AWS::Cognito::IdentityPoolRoleAttachment'
        ];
        expectedResources.forEach( (resource) => {
            expect(stack).toHaveResource(resource);
        })
    };
    AlienAttackTest.test(testFunction);
})


/**
 * CONFIGURATION LAYER
 * This simple test validates the Config layer (where Systems Manager parameters are defined),
 * so checking if the Cloudformation Template is generated properly
 * 
 */
test('ConfigurationLayer validation (Systems Manager Parameters)', () => {
    let testFunction = function(stack : ResourceAwareStack, props: NRTAProps) {
        let ssmParameters = new Map<string, string>();
        ssmParameters.set("parameter1", "value1");
        props.addParameter("ssmParameters",ssmParameters);
        new configLayer.ConfigurationLayer(stack,'ConfigLayer',props);
        expect(stack).toHaveResource('AWS::SSM::Parameter');
    };
    AlienAttackTest.test(testFunction);
});

/**
 * STORAGE LAYER
 */ 
test('StorageLayer validation', () => {
    let testFunction = function(stack : ResourceAwareStack, props: NRTAProps) {
        props.addParameter('existingbuckets',[]);
        new storageLayer.StorageLayer(stack, 'StorageLayer', props);
        expect(stack).toHaveResource('AWS::S3::Bucket');
    };
    AlienAttackTest.test(testFunction);
});


/**
 * CONTENT DELIVERY LAYER
 */ 
test('ContentDeliveryLayer validation', () => {
    let testFunction = function(stack : ResourceAwareStack, props: NRTAProps) {
        props.addParameter('appBucket', { bucketName : 'testappbucket' } );
        props.addParameter('rawBucket', { bucketName : 'testrawbucket' } );
        new contentDeliveryLayer.ContentDeliveryLayer(stack, 'ContentDeliveryLayer', props);
        expect(stack).toHaveResource('AWS::CloudFront::CloudFrontOriginAccessIdentity');
        expect(stack).toHaveResource('AWS::CloudFront::Distribution');
        expect(stack).toHaveResource('AWS::S3::BucketPolicy');
    };
    AlienAttackTest.test(testFunction);
});


/**
 * DATABASE LAYER
 */ 
test('DatabaseLayer validation', () => {
    let testFunction = function(stack : ResourceAwareStack, props: NRTAProps) {
        new databaseLayer.DatabaseLayer(stack, 'DatabaseLayer', props);
        expect(stack).toHaveResource('AWS::DynamoDB::Table');
    };
    AlienAttackTest.test(testFunction);
});


/**
 * PROCESSING LAYER
 */ 
test('ProcessingLayer validation', () => {
    let testFunction = function(stack : ResourceAwareStack, props: NRTAProps) {
        props.addParameter('table.sessioncontrol','TBLSESSIONCONTROL');
        props.addParameter('table.sessionTopX','TBLSESSIONTOP');
        props.addParameter('table.session','TBLSESSION');
        new processingLayer.ProcessingLayer(stack, 'ProcessingLayer', props);
        let expectedResources = [
            'AWS::IAM::Role',
            'AWS::Lambda::Function',
            'AWS::SQS::Queue'
        ];
        expectedResources.forEach( (resource) => {
            expect(stack).toHaveResource(resource);
        });
    };
    AlienAttackTest.test(testFunction);
});

/**
 * WEBSOCKET LAYER
 */ 
test('WebsocketLayer validation', () => {
    let testFunction = function(stack : ResourceAwareStack, props: NRTAProps) {
        props.addParameter('table.sessioncontrol','TBL_TEST_SESSIONCONTROL');
        new websocketLayer.WebSocketLayer(stack, 'WebSocketLayer', props);
        expect(stack).toHaveResource('AWS::Lambda::Function');
        expect(stack).toHaveResource('AWS::IAM::Role');
    };
    AlienAttackTest.test(testFunction);
});


/**
 * INGESTION-CONSUMPTION LAYER
 */ 
test('IngestionConsumptionLayer validation', () => {
    let testFunction = function(stack : ResourceAwareStack, props: NRTAProps) {
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
        expectedResources.forEach( (resource) => {
            expect(stack).toHaveResource(resource);
        });
    };
    AlienAttackTest.test(testFunction);
});