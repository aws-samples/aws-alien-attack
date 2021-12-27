// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { ResourceAwareConstruct, IParameterAwareProps } from './../resourceawarestack'
import { Construct } from 'constructs';
import * as ssm from 'aws-cdk-lib/aws-ssm';  


/**
 * Configuration Layer is a construct designed to acquire and store configuration
 * data to be used by the system
 */
export class ConfigurationLayer extends ResourceAwareConstruct {

    constructor(parent: Construct, name: string, props: IParameterAwareProps) {
        super(parent, name, props);
        if (props) {
            let parametersToBeCreated = props.getParameter('ssmParameters');
            if (parametersToBeCreated) {
                parametersToBeCreated.forEach( (v : any, k : string) => {
                    let parameter = this.createParameter(props.getApplicationName(),k,<string> v);
                    this.addResource('parameter.'+k,parameter);
                });
            }
        }
    }       

    private createParameter(appName : string, keyName: string, value : string) {    
        let baseName : string = '/'+ appName.toLowerCase();
        let parameter = new ssm.StringParameter(this, 'SSMParameter'+appName+keyName, {
            parameterName : baseName + '/'+keyName.toLowerCase(),
            stringValue: value
        });
        return parameter;
    }
}
