#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
#
echo Updating the attached instance
# We need first to check what's the underlying operating system
OSNAME=$(uname -a)
if [[ "$OSNAME" == *"Ubuntu"* ]]; then
   OSNAME="UBUNTU"
elif [[ "$OSNAME" == *"amzn2"* ]]; then
   OSNAME="AMAZON"
elif [[ "$OSNAME" == *"Darwin"* ]]; then
   OSNAME="OSX"
else 
   OSNAME="INVALID"
fi

## NodeJS version
node_version=""
## Typescript version
tsc_version=""
## CDK version
cdk_version=""

UPDATE_TYPE="AUTOMATIC"
case $OSNAME in
   AMAZON)
        sudo yum update -y
        node_version="v20.5.1"
        tsc_version="5.1.6"
        cdk_version="latest" 
        ;;
   UBUNTU)
        sudo apt-get update -y
        node_version="v18.17.1"
        tsc_version="5.0.3"
        cdk_version="latest" 
        ;;
   OSX)
        echo "This is Mac OSX"
        node_version="v20.5.1"
        tsc_version="5.1.6"
        cdk_version="latest"
        ;;
    *)
        echo "Invalid OS"
        echo "You need to update it by hand"
        UPDATE_TYPE="BY_HAND";;
esac
if [[ "$UPDATE_TYPE" == "BY_HAND" ]]; then
   echo "Follow the instructions to install CDK version >= 2.72.0 <= 2.91.0"
   exit 0
fi

# Check if we're in the project root with isolated environment
PROJECT_ROOT=""
if [[ -f "./activate-env.sh" && -f "../.nvmrc" ]]; then
    PROJECT_ROOT="$(cd .. && pwd)"
    echo "Detected isolated environment at: $PROJECT_ROOT"
fi

echo --
echo Configuring your $OSNAME
echo --
### Check if nvm is installed
if ! command -v nvm &> /dev/null; then
    echo "nvm is not installed. Installing nvm..."
    # Download nvm installation script
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.37.2/install.sh | bash
    # Load nvm
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
    [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
    echo "nvm has been installed."
else
    echo "nvm is already installed."
fi
###
echo Configuring nodejs
#node_version=$(nvm ls-remote --lts | grep Latest | tail -1 | grep -o 'v[.0-9]*' | sed 's/\x1b\[[0-9;]*m//g')
#node_version=${node_version:1}
if [[ $(nvm ls | grep $node_version) == "" ]]; then
  nvm install $node_version
  nvm use $node_version
  # Only set default alias if not in isolated environment
  if [[ -z "$PROJECT_ROOT" ]]; then
    nvm alias latest $node_version
    nvm alias default latest
  fi
else
  nvm use $node_version
  # Only set default alias if not in isolated environment
  if [[ -z "$PROJECT_ROOT" ]]; then
    nvm alias latest $node_version
    nvm alias default latest
  fi
fi

echo --
echo Installing Typescript
if [[ -n "$PROJECT_ROOT" ]]; then
  # Use project-local npm for isolated environment
  if [[ $( NPM_CONFIG_PREFIX="$PROJECT_ROOT/.npm-global" npm list -g typescript 2>/dev/null | grep $tsc_version ) == "" ]]; then
    echo "Installing TypeScript $tsc_version in isolated environment"
    NPM_CONFIG_PREFIX="$PROJECT_ROOT/.npm-global" npm install -g typescript@$tsc_version
  else
    echo "TypeScript $tsc_version already installed in isolated environment"
  fi
else
  # Standard global installation
  if [[ $( npm list -g typescript | grep $tsc_version ) == "" ]]; then
    npm install -g typescript@$tsc_version
  fi
fi
echo --
echo Installing CDK
if [[ -n "$PROJECT_ROOT" ]]; then
  # Use project-local npm for isolated environment
  echo "Installing CDK $cdk_version in isolated environment"
  rm -rf "$PROJECT_ROOT/.npm-global/bin/cdk" 2>/dev/null
  NPM_CONFIG_PREFIX="$PROJECT_ROOT/.npm-global" NPM_CONFIG_USERCONFIG="$PROJECT_ROOT/.npmrc" npm install -g aws-cdk@$cdk_version
else
  # Standard global installation
  # Forcing the removal of the latest version
  rm -rf ~/.nvm/versions/node/$node_version/bin/cdk
  #installing it
  npm install -g aws-cdk@$cdk_version
fi
echo --
echo Bootstraping CDK
account=$(aws sts get-caller-identity --output text --query 'Account')
region=$(aws configure get region)
cdk bootstrap aws://$account/$region
echo --
echo Installing CDK dependencies
cd cdk
npm install
echo --
# THIS IS FOR FUTURE CONFIGURATION OF AWS SDK v2
#echo Installing Lambda dependencies
#find ./lambdas -name 'package.json' -not -path '*/node_modules*' -execdir npm install \;

# Only modify bash_profile if not in isolated environment
if [[ -z "$PROJECT_ROOT" ]]; then
  [[ $(grep "nvm use latest" ~/.bash_profile) ]] || echo nvm use latest >> ~/.bash_profile
fi
