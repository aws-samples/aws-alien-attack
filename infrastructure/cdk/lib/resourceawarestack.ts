// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { Construct } from 'constructs';
import { Stack, StackProps } from 'aws-cdk-lib'; 

export interface IFlexNameApplication {
    applicationName? : string,
    getApplicationName() : string
}

export interface IResourceAware {
    getResources() : Map<string,any>;
    getResource(resourceName: string) : any | undefined;
    addResources(resources : Map<string,any>) : void;
    addResource(map: string, resource:any) : void;
    getResourcesNames() : IterableIterator<string> | string[];
}

export interface IParameterAware {
    getParameters() : Map<string,any>;
    getParameter(parameterName: string) : any | undefined;
    addParameters(parameters : Map<string,any>) : void;
    addParameter(map: string, resource:any) : void;
}

export interface IDeploymentTarget {
    accountId? : string,
    region? : string
}

export class ResourceBag implements IResourceAware {

    private resources : Map<string,any>;

    constructor(resources? : IResourceAware) {
        if (resources && resources.getResources()) {
            if (!this.resources) this.resources = new Map<string,any>();
            resources.getResources().forEach( (v,k) => {
                this.resources.set(k.toLowerCase(),v);
            })
        };
    }

    getResources() : Map<string,any> {
        return this.resources;
    };
    
    addResources(resources : Map<string,any>) {
        if (resources) {
            if (!this.resources) this.resources = new Map<string,any>();
            for (let resourceName of resources.keys()) {
                let name = resourceName.toLowerCase();
                this.resources.set(name, resources.get(name));
            }
        }
    };
    
    addResource(key: string, resource:any) : void {
        if (resource) {
            if (!this.resources) this.resources = new Map<string,any>();
            this.resources.set(key.toLowerCase(),resource);
        }
    }

    getResource(key: string) : any | undefined {
        return this.resources.get(key.toLowerCase());
    }

    getResourcesNames() {
        if (this.resources) return this.resources.keys();
        else return []; 
    }

}

export interface IParameterAwareProps extends StackProps, IParameterAware, IFlexNameApplication, IDeploymentTarget {
}

export class ParameterAwareProps implements IParameterAwareProps {

    accountId? : string;
    region? : string;
    
    
    // handling/defining the application name.
    // Default is NRTA - Near Real-Time Application
    static defaultApplicationName : string = 'NRTA';
    applicationName? : string;
    setApplicationName(appName : string) {
        if (appName && appName.length>0) this.applicationName = appName.toUpperCase();
    }
    getApplicationName() {
        let appName = this.applicationName ? this.applicationName  : ParameterAwareProps.defaultApplicationName;
        return appName;
    }    
    
    parameters : Map<string,any>;
    
    getParameters() : Map<string,any> {
        return this.parameters;
    };
    
    addParameters(parameters : Map<string,any>) {
        if (parameters) {
            if (!this.parameters) this.parameters = new Map<string,any>();
            for (let parameterName of parameters.keys()) {
                this.parameters.set(parameterName.toLowerCase(), parameters.get(parameterName))
            }
        }
    };
    
    addParameter(key: string, parameter:any) : void {
        if (parameter) {
            if (!this.parameters) this.parameters = new Map<string,any>();
            this.parameters.set(key.toLowerCase(),parameter);
        }
    }

    getParameter(key: string) : any | undefined {
        if (!this.parameters) this.parameters = new Map<string,any>();
        return this.parameters.get(key.toLowerCase());
    }

    constructor(props?: IParameterAwareProps) {
        this.applicationName = (props && props.applicationName && props.applicationName.length > 0) ? props.applicationName : ParameterAwareProps.defaultApplicationName;
        if (props) {
            this.region = props.region;
            this.accountId = props.accountId;
            if (props.getParameters()) props.getParameters().forEach( (v,k) => this.addParameter(k,v) );
        }
    }
}


export class ResourceAwareStack extends Stack implements IResourceAware {

    protected resources : Map<string,any>;
    protected scope: Construct | undefined;
    protected properties : IParameterAwareProps;

    constructor(parent?: Construct, name?: string, props?: IParameterAwareProps) {
        super(parent,name,props);
        if (this.scope)
            this.scope = parent;
        if (!this.properties) this.properties = new ParameterAwareProps(props);
        if (!this.properties.accountId) this.properties.accountId = this.account;
        if (!this.properties.region) this.properties.region = this.region;
    }
    
    getResources() : Map<string,any> {
        return this.resources;
    };
    
    addResources(resources : Map<string,any>) {
        if (resources) {
            if (!this.resources) this.resources = new Map<string,any>();
            for (let resourceName of resources.keys()) {
                let name = resourceName.toLowerCase();
                this.resources.set(name, resources.get(name));
            }
        }
    };
    
    addResource(key: string, resource:any) : void {
        if (resource) {
            if (!this.resources) this.resources = new Map<string,any>();
            this.resources.set(key.toLowerCase(),resource);
        }
    }

    getResource(key: string) : any | undefined {
        if (!this.resources) this.resources = new Map<string,any>();
        return this.resources.get(key.toLowerCase());
    }

    getResourcesNames() {
        if (this.resources) return this.resources.keys();
        else return []; 
    }

    getProperties() {
        return this.properties;
    }
}


export class ResourceAwareConstruct extends Construct implements IResourceAware {

    resources : Map<string,any>;
    protected properties : IParameterAwareProps;

    constructor(scope: Construct, id: string, props: IParameterAwareProps) {
        super(scope,id);
        this.properties = props;
    }

    getResources() : Map<string,any> {
        return this.resources;
    };
    
    addResources(resources : Map<string,any>) {
        if (resources) {
            if (!this.resources) this.resources = new Map<string,any>();
            for (let resourceName of resources.keys()) {
                let name = resourceName.toLowerCase();
                this.resources.set(name, resources.get(name));
            }
        }
    };
    
    addResource(key: string, resource:any) : void {
        if (resource) {
            if (!this.resources) this.resources = new Map<string,any>();
            this.resources.set(key.toLowerCase(),resource);
        }
    }

    getResource(key: string) : any | undefined {
        return this.resources.get(key.toLowerCase());
    }

    getResourcesNames() {
        if (this.resources) return this.resources.keys();
        else return []; 
    }

    getProperties() {
        return this.properties;
    }
}
