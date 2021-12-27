// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { App, CfnOutput } from 'aws-cdk-lib';
import { IParameterAwareProps, ParameterAwareProps, ResourceAwareStack } from '../resourceawarestack';

import { SecurityLayer } from './securityLayer';
import { ConfigurationLayer } from './configurationLayer';
import { StorageLayer } from './storageLayer';
import { DatabaseLayer } from './databaseLayer';
import { IngestionConsumptionLayer } from './ingestionConsumptionLayer';
import { ProcessingLayer } from './processingLayer';
import { WebSocketLayer } from './websocketLayer';

import { ContentDeliveryLayer } from './contentDeliveryLayer';

var DEPLOY_CDN : boolean = false;
var SESSION_PARAMETER : boolean = false;


export class MainLayer extends ResourceAwareStack {

  constructor(scope: App, id: string, props?: IParameterAwareProps) {
    super(scope, id, props);
    if (props && props.getParameter("deploycdn")) DEPLOY_CDN = true;
    if (props && props.getParameter("sessionparameter")) SESSION_PARAMETER=true;
    this.buildResources();
  }

  buildResources() {

    // security layer
    let securityLayer =
      new SecurityLayer(this, 'SecurityLayer', this.properties);

    // configuration layer
    let configLayerProps = new ParameterAwareProps(this.properties);

    let ssmProperties = new Map<string, string>();
    ssmProperties.set("Region", this.region);
    ssmProperties.set("ClientId", securityLayer.getUserPoolClientId());
    ssmProperties.set("UserpoolId", securityLayer.getUserPoolId());
    ssmProperties.set("UserPoolURL", securityLayer.getUserPoolUrl());
    ssmProperties.set("IdentityPoolId", securityLayer.getIdentityPoolId());

    if (SESSION_PARAMETER) ssmProperties.set("Session", "null");
    configLayerProps.addParameter('ssmParameters', ssmProperties);

    let configLayer =
      new ConfigurationLayer(this, 'ConfigurationLayer', configLayerProps);

    // storage layer
    let storageLayer =
      new StorageLayer(this, 'StorageStorage', this.properties);

    let cdnLayer = null;
    if (DEPLOY_CDN) {
      let cdnLayerProps = new ParameterAwareProps(this.properties);
      cdnLayerProps.addParameter('appbucket', storageLayer.getResource('appbucket'));
      cdnLayer = new ContentDeliveryLayer(this, 'ContentDeliveryLayer', cdnLayerProps);
    }


    // database layer
    let databaseLayer =
      new DatabaseLayer(this, 'DatabaseLayer', this.properties);
    

    // processing layer
    let processingLayerProps = new ParameterAwareProps(this.properties);
    if (SESSION_PARAMETER) processingLayerProps.addParameter('parameter.session', configLayer.getResource('parameter.session'));
   
      processingLayerProps.addParameter('table.sessionControl', databaseLayer.getResource('table.sessionControl'));
      processingLayerProps.addParameter('table.sessionTopX', databaseLayer.getResource('table.sessionTopX'));
      processingLayerProps.addParameter('table.session', databaseLayer.getResource('table.session'));
    let processingLayer = new ProcessingLayer(this, 'ProcessingLayer', processingLayerProps);
   
    // WebSocket Layer
    let webSocketLayerProps = new ParameterAwareProps(this.properties);
    webSocketLayerProps.addParameter('table.sessionControl', databaseLayer.getResource('table.sessionControl'));
    new WebSocketLayer(this, 'WebSocketLayer', webSocketLayerProps);

    // Ingestion/consumption layer 
    let ingestionConsumptionLayerProps = new ParameterAwareProps(processingLayerProps);
    ingestionConsumptionLayerProps.addParameter('rawbucketarn', storageLayer.getRawDataBucketArn());
    ingestionConsumptionLayerProps.addParameter('userpool',securityLayer.getUserPoolArn());
    ingestionConsumptionLayerProps.addParameter('userpoolid', securityLayer.getUserPoolId());
    ingestionConsumptionLayerProps.addParameter('table.session',databaseLayer.getResource('table.session'));
    ingestionConsumptionLayerProps.addParameter('table.sessiontopx',databaseLayer.getResource('table.sessiontopx'));
    ingestionConsumptionLayerProps.addParameter('lambda.allocate',processingLayer.getAllocateFunctionRef());
    ingestionConsumptionLayerProps.addParameter('lambda.deallocate',processingLayer.getDeallocateFunctionArn());
    ingestionConsumptionLayerProps.addParameter('lambda.scoreboard',processingLayer.getScoreboardFunctionRef());
    ingestionConsumptionLayerProps.addParameter('security.playersrole', securityLayer.getResource('security.playersrole'));
    ingestionConsumptionLayerProps.addParameter('security.managersrole', securityLayer.getResource('security.managersrole'));
    let icl = new IngestionConsumptionLayer(this, 'IngestionConsumptionLayer',ingestionConsumptionLayerProps); 
    
    new CfnOutput(this, "apigtw", {
      description : "API Gateway URL",
      value : icl.getResource("apigtw.url"),
      exportName : this.properties.getApplicationName().toLocaleLowerCase()+":apigtw"
    });

    new CfnOutput(this, "region", {
      description : "region",
      value : this.region,
      exportName : this.properties.getApplicationName().toLocaleLowerCase()+":region"
    });

    new CfnOutput(this, "envname", {
      description : "Environment name",
      value : this.properties.getApplicationName(),
      exportName : this.properties.getApplicationName().toLocaleLowerCase()+":envname"
    });

    if (cdnLayer) {
      new CfnOutput(this, "url", {
        description : "Cloudfront domain for the website (Cloudfront distribution)",
        value : cdnLayer.getResource("cdndomain"),
        exportName : this.properties.getApplicationName().toLocaleLowerCase()+":url"
      }).node.addDependency(cdnLayer);
    }  
  }
}