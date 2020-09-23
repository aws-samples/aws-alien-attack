import '@aws-cdk/assert/jest';
import * as configLayer from './../lib/layer/configurationLayer'
import { ResourceAwareStack } from './../lib/resourceawarestack'
import { NRTAProps } from './../lib/nrta'

/**
 * These tests are built using https://jestjs.io/
 * 
 * To prepare the enviroment, you need to:
 * npm install --save-dev jest @types/jest @aws-cdk/assert
 */


/**
 * This simple test validates the Config layer (where Systems Manager parameters are defined),
 * so checking if the Cloudformation Template is generated properly
 * 
 */
test('Validates ConfigurationLayer creation (Systems Manager Parameters)', () => {
    const stack = new ResourceAwareStack();
    const props = new NRTAProps();
    props.setApplicationName('TEST');
    let ssmParameters = new Map<string, string>();
    ssmParameters.set("parameter1", "value1");
    props.addParameter("ssmParameters",ssmParameters);
    new configLayer.ConfigurationLayer(stack,'ConfigLayer',props);
    expect(stack).toHaveResource('AWS::SSM::Parameter');
})